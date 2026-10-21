import type { Pool, PoolClient } from 'pg';
import type { ExecutionCountry, ExecutionPersistence, PersistedExecutionJob } from './execution-attribution.js';

const SCHEMAS = { GT: 'guatemala', NC: 'nicaragua' } as const;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

// No construye pools ni lee .env: el futuro servidor regional debe inyectar su conexión.
export function createPostgresExecutionPersistence(pool: Pool, country: ExecutionCountry,
  assertOwnership: () => void = () => {},
  verifyOwnership?: (client: PoolClient) => Promise<void>): ExecutionPersistence {
  const schema = SCHEMAS[country];
  if (!schema) throw new Error('País de ejecución no soportado.');

  const authorized = `EXISTS (
    SELECT 1 FROM administracion.usuarios u JOIN administracion.paises p ON p.codigo=$3
    WHERE u.id=$2 AND u.enabled AND p.habilitado AND (
      u.account_level IN ('superadmin','admin') OR EXISTS (
        SELECT 1 FROM administracion.usuario_paises a
        WHERE a.user_id=u.id AND a.country_code=p.codigo AND a.role='operador'
      )
    )
  )`;

  const validate = (job: PersistedExecutionJob) => {
    if (!UUID.test(job.id) || job.country !== country || !job.actorUserId
      || !/^[A-Za-z0-9_-]{1,36}$/.test(job.actorUserId)
      || !Number.isFinite(Date.parse(job.createdAt))) throw new Error('Atribución de ejecución inválida.');
  };

  const transaction = async <T>(operation: (client: PoolClient) => Promise<T>): Promise<T> => {
    assertOwnership();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout='10s'");
      await verifyOwnership?.(client);
      const identity = await client.query<{ database: string }>('SELECT current_database() AS database');
      if (!['webscraper_dev', 'catalogocomercial_ensayo_101'].includes(identity.rows[0]?.database)) {
        throw new Error('La persistencia regional requiere una base DEV migrada.');
      }
      const phases = await client.query(`SELECT fase FROM administracion.migraciones_ensayo
        WHERE fase IN ('101_administracion','101_comercial')`);
      if (phases.rowCount !== 2) throw new Error('Fases regionales incompletas.');
      const result = await operation(client);
      assertOwnership();
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  };

  return {
    country,
    async create(job) {
      validate(job);
      const stores = job.stores ?? [];
      if (stores.length > 100 || new Set(stores).size !== stores.length
        || stores.some(store => typeof store !== 'string' || !store.trim() || store.length > 160)) {
        throw new Error('Selección de tiendas inválida.');
      }
      await transaction(async client => {
        const result = await client.query(`INSERT INTO ${schema}.ejecuciones (
          id,usuario_id,origen,estado,total_productos,importado_en,source_payload
        ) SELECT $1::uuid,$2,'manual','encolada',0,$4::timestamptz,$5::jsonb
        WHERE ${authorized} RETURNING id`, [job.id, job.actorUserId, country, job.createdAt,
          JSON.stringify({ job_id: job.id, stores, selection: stores.length ? 'selected' : 'all',
            requested_at: job.createdAt, result_committed: false })]);
        if (result.rowCount !== 1) throw new Error('Usuario o país no autorizado para ejecutar.');
      });
    },
    async start(job) {
      validate(job);
      if (!job.startedAt || !Number.isFinite(Date.parse(job.startedAt))) throw new Error('Inicio de ejecución inválido.');
      await transaction(async client => {
        const result = await client.query(`UPDATE ${schema}.ejecuciones
          SET estado='ejecutando',inicio=$4::timestamptz
          WHERE id=$1::uuid AND usuario_id=$2 AND origen='manual' AND estado='encolada'
            AND ${authorized} RETURNING id`, [job.id, job.actorUserId, country, job.startedAt]);
        if (result.rowCount !== 1) throw new Error('La ejecución ya cambió de estado o perdió autorización.');
      });
    },
    async finish(job) {
      validate(job);
      if (!job.finishedAt || !Number.isFinite(Date.parse(job.finishedAt))) throw new Error('Cierre de ejecución inválido.');
      const confirmed = await transaction(async client => {
        const result = await client.query(`SELECT estado,source_payload FROM ${schema}.ejecuciones
          WHERE id=$1::uuid AND usuario_id=$2 AND origen='manual' FOR UPDATE`, [job.id, job.actorUserId]);
        const row = result.rows[0];
        if (!row || !['encolada', 'ejecutando'].includes(row.estado)) throw new Error('Ejecución no disponible para cerrar.');
        // Un exit code 0 no prueba que el worker haya guardado productos en esta ejecución.
        const committed = row.source_payload?.result_committed === true;
        const resultState = row.source_payload?.result_state;
        const ok = job.ok === true && committed && resultState === 'completada';
        await client.query(`UPDATE ${schema}.ejecuciones SET
          estado=$3,fin=CASE WHEN inicio IS NULL THEN NULL ELSE $4::timestamptz END,
          total_productos=(SELECT count(*)::integer FROM ${schema}.productos WHERE ejecucion_uuid=$1::uuid),
          source_payload=source_payload || $5::jsonb
          WHERE id=$1::uuid AND usuario_id=$2`, [job.id, job.actorUserId,
          ok ? 'completada' : committed && resultState !== 'fallida' ? 'parcial' : 'fallida', job.finishedAt,
          JSON.stringify({ worker_ok: job.ok === true, closed_at: job.finishedAt,
            missing_result_commit: job.ok === true && !committed })]);
        return job.ok !== true || (committed && resultState === 'completada');
      });
      if (!confirmed) throw new Error('El worker no confirmó persistencia regional de resultados.');
    },
  };
}
