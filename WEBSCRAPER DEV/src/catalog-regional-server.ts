import { constants, closeSync, copyFileSync, existsSync, fstatSync, lstatSync, mkdirSync, openSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { createServer, type Server } from 'node:https';
import { X509Certificate } from 'node:crypto';
import { Pool } from 'pg';
import { createSecureHandler } from './server/secure-handler.js';
import { createRegionalCatalogReader } from './server/regional-catalog-reader.js';
import { createRecoverableExecutionPersistence } from './server/execution-recovery.js';
import { createScraperJobQueue } from './server/scraper-job-queue.js';
import { createNcJobs } from './server/nc-jobs.js';
import { createPriceUploadHandler } from './server/facenco-upload.js';
import { stopRegionalWorkers } from './server/regional-workers.js';

const ORIGIN = 'https://catalogo-ensayo.local:8444';
const DATABASE = 'catalogocomercial_ensayo_101';

function passwordFile(path: string) {
  if (lstatSync(path).isSymbolicLink()) throw new Error('Credencial no admite enlaces.');
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > 4096 || (process.platform !== 'win32' && (info.mode & 0o077))) {
      throw new Error('Credencial requiere archivo privado.');
    }
    const value = readFileSync(fd, 'utf8').trim();
    if (!value || value.includes('\0')) throw new Error('Credencial inválida.');
    return value;
  } finally { closeSync(fd); }
}

async function main() {
  const { values } = parseArgs({ options: {
    'db-host': { type: 'string' }, 'password-file': { type: 'string' },
    'runtime-dir': { type: 'string' }, cert: { type: 'string' }, key: { type: 'string' },
    'check-only': { type: 'boolean', default: false },
  } });
  if (!values['db-host'] || !values['password-file']) throw new Error('Falta --db-host o --password-file.');
  const runtime = values['runtime-dir'];
  if (!values['check-only'] && (!runtime || !isAbsolute(runtime) || !values.cert || !values.key)) {
    throw new Error('Arranque requiere --runtime-dir absoluto, --cert y --key.');
  }
  const password = passwordFile(values['password-file']);
  const pool = new Pool({ host: values['db-host'], port: 5432, database: DATABASE,
    user: 'webscraper_user', password, max: 10, connectionTimeoutMillis: 10000,
    application_name: 'catalog_regional_rehearsal' });
  const owners = [createRecoverableExecutionPersistence(pool, 'GT'), createRecoverableExecutionPersistence(pool, 'NC')];
  let server: Server | undefined;
  let closing: Promise<void> | undefined;
  const close = () => closing ??= (async () => {
    if (server?.listening) { server.close(); server.closeAllConnections(); }
    const closedOwners = await Promise.allSettled(owners.map(owner => owner.close()));
    await stopRegionalWorkers();
    await pool.end();
    if (closedOwners.some(result => result.status === 'rejected')) throw new Error('Cierre incompleto; revisar recuperación al reiniciar.');
  })();

  try {
    const client = await pool.connect();
    let missing: string[];
    try {
      await client.query('BEGIN READ ONLY');
      const identity = (await client.query('SELECT current_database() AS database,current_user AS role')).rows[0];
      if (identity.database !== DATABASE || identity.role !== 'webscraper_user') throw new Error('Destino no permitido.');
      const privileges: Array<{ schema: string; table: string; privilege: string }> = [];
      const add = (schema: string, table: string, required: string[]) =>
        required.forEach(privilege => privileges.push({ schema, table, privilege }));
      for (const schema of ['guatemala', 'nicaragua']) {
        for (const table of ['ejecuciones', 'publicaciones']) add(schema, table, ['SELECT', 'INSERT', 'UPDATE']);
        for (const table of ['productos', 'tiendas']) add(schema, table, ['SELECT', 'INSERT']);
      }
      add('administracion', 'migraciones_ensayo', ['SELECT']);
      add('administracion', 'paises', ['SELECT']);
      add('administracion', 'usuarios', ['SELECT', 'INSERT', 'UPDATE']);
      add('administracion', 'usuario_paises', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
      add('administracion', 'sesiones_app', ['SELECT', 'INSERT', 'UPDATE']);
      add('administracion', 'login_intentos', ['SELECT', 'INSERT', 'UPDATE', 'DELETE']);
      add('administracion', 'admin_eventos', ['SELECT', 'INSERT']);
      const checks = await client.query(`SELECT r.schema,r.table,r.privilege,
        has_table_privilege(current_user,format('%I.%I',r.schema,r.table),r.privilege) AS allowed
        FROM jsonb_to_recordset($1::jsonb) AS r(schema text,"table" text,privilege text)`, [JSON.stringify(privileges)]);
      missing = checks.rows.filter(row => !row.allowed).map(row => `${row.schema}.${row.table}:${row.privilege}`);
      for (const schema of ['guatemala', 'nicaragua']) {
        const sequence = (await client.query(`SELECT has_sequence_privilege(current_user,
          pg_get_serial_sequence($1,'id'),'USAGE') AS allowed`, [`${schema}.productos`])).rows[0];
        if (sequence?.allowed !== true) missing.push(`${schema}.productos:id_sequence_usage`);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }

    const sourcePrices = resolve('data/precios_facenco.xlsx');
    const isolatedPrices = runtime ? resolve(runtime, 'precios_facenco.xlsx') : undefined;
    const reader = createRegionalCatalogReader(pool, {
      priceFile: isolatedPrices && existsSync(isolatedPrices) ? isolatedPrices : sourcePrices,
    });
    const gt = await reader.getProducts(new URLSearchParams());
    const nc = await reader.ncSnapshot() as { products: unknown[] };
    if (values['check-only']) {
      console.log(JSON.stringify({ status: missing.length ? 'permisos_pendientes' : 'requisitos_db_validados',
        database: DATABASE, origin: ORIGIN, bind: '127.0.0.1:8444', auth: 'http://127.0.0.1:8042',
        gt_products: gt.length, nc_products: nc.products.length, missing_privileges: missing,
        databaseWrites: false, queues_claimed: false, https_started: false }, null, 2));
      await close();
      return;
    }
    if (missing.length) throw new Error('Faltan permisos de ensayo; ejecutar --check-only.');
    const certificate = new X509Certificate(readFileSync(values.cert!));
    if (!certificate.checkHost('catalogo-ensayo.local') || Date.now() < Date.parse(certificate.validFrom)
      || Date.now() > Date.parse(certificate.validTo)) throw new Error('Certificado de ensayo inválido.');
    server = createServer({ cert: readFileSync(values.cert!), key: readFileSync(values.key!), minVersion: 'TLSv1.2' });
    if (!existsSync(runtime!)) mkdirSync(runtime!, { recursive: true, mode: 0o700 });
    const directory = lstatSync(runtime!);
    if (!directory.isDirectory() || directory.isSymbolicLink()
      || (process.platform !== 'win32' && (directory.mode & 0o077))) throw new Error('Runtime requiere directorio privado.');
    if (!existsSync(isolatedPrices!) && existsSync(sourcePrices)) {
      copyFileSync(sourcePrices, isolatedPrices!, constants.COPYFILE_EXCL);
    }
    Object.assign(process.env, { PGHOST: values['db-host'], PGPORT: '5432', PGDATABASE: DATABASE,
      PGUSER: 'webscraper_user', PGPASSWORD: password, PGSSL: 'false',
      CATALOG_REGIONAL_WRITES: '1', CATALOG_WORKER_LOG_DIR: resolve(runtime!, 'logs') });
    for (const key of ['CATALOG_EXECUTION_ID', 'CATALOG_EXECUTION_USER_ID', 'CATALOG_EXECUTION_COUNTRY']) delete process.env[key];
    const gtQueue = createScraperJobQueue({ persistence: owners[0].persistence, maxQueueSize: 100 });
    const ncJobs = createNcJobs(undefined, owners[1].persistence);
    const handler = createSecureHandler(ORIGIN, { publicDir: resolve('public'), outputCsv: '',
      scraperJobQueue: gtQueue, ncJobs,
      regionalReader: createRegionalCatalogReader(pool, { priceFile: isolatedPrices }),
      priceUpload: createPriceUploadHandler(isolatedPrices),
    }, fetch, { authBase: 'http://127.0.0.1:8042' });
    server.on('request', (req, res) => {
      void handler(req, res).catch(() => {
        if (!res.headersSent) res.writeHead(503, { 'Cache-Control': 'no-store' });
        res.end();
      });
    });
    // Reclamar ambos países antes de reanudar cualquier trabajo.
    await owners[0].persistence.initialize!();
    await owners[1].persistence.initialize!();
    await new Promise<void>((resolveListen, reject) => {
      server!.once('error', reject);
      server!.listen(8444, '127.0.0.1', resolveListen);
    });
    await Promise.all([gtQueue.ready(), ncJobs.ready()]);
    for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => {
      void close().then(() => process.exit(0), () => process.exit(1));
    });
    console.log(`Ensayo regional disponible en ${ORIGIN}, sólo loopback.`);
  } catch (error) {
    await close().catch(() => {});
    const code = error instanceof Error && 'code' in error && typeof error.code === 'string'
      && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : 'CONFIGURACION';
    throw new Error(`Ensayo no iniciado (${code}); revisar destino, permisos, certificado y puertos.`);
  }
}

main().catch(error => { console.error(error.message); process.exitCode = 1; });
