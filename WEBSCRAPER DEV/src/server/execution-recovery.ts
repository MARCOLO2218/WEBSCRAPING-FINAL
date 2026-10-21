import type { Pool, PoolClient } from 'pg';
import type { ExecutionCountry, ExecutionPersistence, PersistedExecutionJob } from './execution-attribution.js';
import { createPostgresExecutionPersistence } from './execution-repository.js';

type Recovered = PersistedExecutionJob & { status: 'queued' | 'done' | 'error'; output?: string };
const SCHEMAS = { GT: 'guatemala', NC: 'nicaragua' } as const;
const iso = (value: unknown) => (value instanceof Date ? value : new Date(String(value))).toISOString();

// El propietario mantiene una conexión dedicada. Cerrar el pool pertenece al servidor.
export function createRecoverableExecutionPersistence(pool: Pool, country: ExecutionCountry) {
  const schema = SCHEMAS[country];
  if (!schema) throw new Error('País de cola no soportado.');
  let owner: PoolClient | undefined;
  let available = false;
  let closed = false;
  let initializing: Promise<Recovered[]> | undefined;
  let backend: { pid: number; started: string } | undefined;
  const fence = `catalog_regional_queue_fence:${country}`;
  const assertOwnership = () => {
    if (!available || closed) throw new Error('La cola perdió su conexión propietaria. Reinicie el servicio.');
  };
  const repository = createPostgresExecutionPersistence(pool, country, assertOwnership, async client => {
    // Recuperación exclusiva frente a las transacciones de la instancia anterior.
    await client.query('SELECT pg_advisory_xact_lock_shared(hashtextextended($1,0))', [fence]);
    const result = await client.query(`SELECT 1 FROM pg_locks l
      JOIN pg_stat_activity a ON a.pid=l.pid
      WHERE l.pid=$1 AND a.backend_start=$2::timestamptz
        AND l.locktype='advisory' AND l.granted LIMIT 1`, [backend?.pid, backend?.started]);
    if (result.rowCount !== 1) {
      available = false;
      throw new Error('La conexión propietaria dejó de mantener el bloqueo.');
    }
  });

  const validateDatabase = async (client: PoolClient) => {
    const identity = (await client.query('SELECT current_database() AS database,current_user AS role')).rows[0];
    if (!['webscraper_dev', 'catalogocomercial_ensayo_101'].includes(identity?.database)
      || identity?.role !== 'webscraper_user') throw new Error('Recuperación requiere base DEV y rol regional.');
    const phases = await client.query(`SELECT fase FROM administracion.migraciones_ensayo
      WHERE fase IN ('101_administracion','101_comercial')`);
    if (phases.rowCount !== 2) throw new Error('Fases regionales incompletas.');
  };

  const closeAbandoned = async (client: PoolClient) => {
    await client.query(`UPDATE ${schema}.ejecuciones e SET
      estado=CASE WHEN source_payload->>'result_committed'='true'
        AND source_payload->>'result_state' IN ('completada','parcial','fallida')
        THEN source_payload->>'result_state' ELSE 'interrumpida' END,
      fin=CASE WHEN inicio IS NOT NULL THEN greatest(now(),inicio) ELSE NULL END,
      total_productos=(SELECT count(*)::integer FROM ${schema}.productos p WHERE p.ejecucion_uuid=e.id),
      source_payload=source_payload || jsonb_build_object('recovered_at',now(),
        'recovery_reason','service_restart_or_shutdown')
      WHERE origen='manual' AND estado='ejecutando'`);
  };

  const initialize = () => {
    if (initializing) return initializing;
    initializing = (async (): Promise<Recovered[]> => {
      if (closed) throw new Error('La cola está cerrada.');
      const client = await pool.connect();
      owner = client;
      const lost = () => { available = false; };
      client.on('error', lost);
      client.on('end', lost);
      let inTransaction = false;
      try {
        await validateDatabase(client);
        const lock = await client.query('SELECT pg_try_advisory_lock(hashtextextended($1,0)) AS acquired',
          [`catalog_regional_queue:${country}`]);
        if (lock.rows[0]?.acquired !== true) throw new Error('Otra instancia administra la cola de este país.');
        backend = (await client.query(`SELECT pg_backend_pid() AS pid,backend_start::text AS started
          FROM pg_stat_activity WHERE pid=pg_backend_pid()`)).rows[0];
        if (!backend) throw new Error('No se pudo identificar la conexión propietaria.');
        await client.query('BEGIN'); inTransaction = true;
        await client.query("SET LOCAL lock_timeout='10s'");
        await client.query("SET LOCAL statement_timeout='30s'");
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [fence]);
        await closeAbandoned(client);
        const pending = await client.query(`SELECT * FROM ${schema}.ejecuciones
          WHERE origen='manual' AND estado='encolada' ORDER BY importado_en,id LIMIT 10001`);
        if (pending.rows.length > 10000) throw new Error('Demasiadas solicitudes pendientes; revisar la cola.');
        const history = await client.query(`SELECT * FROM ${schema}.ejecuciones
          WHERE origen='manual' AND estado NOT IN ('encolada','ejecutando')
          ORDER BY coalesce(fin,importado_en) DESC,id DESC LIMIT 50`);
        const jobs: Recovered[] = [...history.rows.reverse(), ...pending.rows].map(row => {
          const stores = row.source_payload?.stores;
          if (!row.usuario_id || !Array.isArray(stores) || stores.some(value =>
            typeof value !== 'string' || !value.trim() || value.length > 160)
            || stores.length > 100 || new Set(stores).size !== stores.length) {
            throw new Error('Solicitud persistida inválida; revisar antes de recuperar.');
          }
          return { id: row.id, actorUserId: row.usuario_id, country, stores: [...stores],
            createdAt: iso(row.importado_en), startedAt: row.inicio ? iso(row.inicio) : undefined,
            finishedAt: row.fin ? iso(row.fin) : undefined,
            status: row.estado === 'encolada' ? 'queued' : row.estado === 'completada' ? 'done' : 'error',
            ok: row.estado === 'encolada' ? undefined : row.estado === 'completada',
            output: row.estado === 'interrumpida' ? 'La ejecución fue interrumpida; puede solicitar una nueva.'
              : row.estado === 'encolada' ? 'Solicitud pendiente recuperada.'
                : `Ejecución recuperada: ${row.estado}.`,
          };
        });
        if (closed) throw new Error('La cola se cerró durante la recuperación.');
        await client.query('COMMIT'); inTransaction = false;
        available = true;
        return jobs;
      } catch (error) {
        if (inTransaction) await client.query('ROLLBACK').catch(() => {});
        available = false;
        if (owner === client) { owner = undefined; client.release(true); }
        throw error;
      }
    })();
    return initializing;
  };

  const persistence: ExecutionPersistence = { country, initialize, checkAvailable: assertOwnership,
    create: repository.create, start: repository.start, finish: repository.finish };
  const close = async () => {
    closed = true; available = false;
    // Dejar que initialize libere su conexión si el cierre coincide con el arranque.
    await initializing?.catch(() => {});
    const client = owner; owner = undefined;
    if (!client) return;
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='10s'");
      await client.query("SET LOCAL statement_timeout='30s'");
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [fence]);
      await closeAbandoned(client);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(true); }
  };
  return { persistence, close, assertOwnership };
}
