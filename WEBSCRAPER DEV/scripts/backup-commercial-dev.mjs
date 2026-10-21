// SPEC-101: backup de la fuente comercial DEV, nunca restaura ni ejecuta DDL.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { chmod, mkdir, mkdtemp, open, stat, unlink, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse } from 'dotenv';
import pg from 'pg';

const backup = process.argv.slice(2);
if (backup.some(arg => arg !== '--backup') || backup.length > 1) {
  throw new Error('Uso: node scripts/backup-commercial-dev.mjs [--backup]');
}

function runDocker(args, outputFd) {
  return new Promise((accept, reject) => {
    const child = spawn('sudo', ['-n', 'docker', 'exec', ...args], {
      stdio: ['ignore', outputFd, 'pipe'], windowsHide: true,
    });
    // No imprimir stderr: preservar errores de conexión sin volcar credenciales.
    child.stderr.on('data', () => {});
    child.once('error', () => reject(new Error('No se pudo iniciar Docker mediante sudo.')));
    child.once('close', code => code === 0 ? accept() : reject(new Error(
      `Docker/pg_dump/pg_restore terminó con código ${code}; revisar sudo -v, conectividad y versiones.`,
    )));
  });
}

async function digest(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

async function main() {
  if (process.platform !== 'linux') throw new Error('Ejecutar en Ubuntu del NAS DEV.');
  const env = parse(readFileSync(resolve('.env')));
  if (env.PGHOST !== '10.238.13.227' || env.PGDATABASE !== 'WEBSCRAPING_CAMAS_DEV'
    || env.PGUSER !== 'postgres' || (env.PGPORT || '5432') !== '5432'
    || (env.PGSCHEMA || 'catalogo') !== 'catalogo') {
    throw new Error('Destino distinto del inventario comercial DEV aprobado; no continuar.');
  }
  if (!env.PGPASSWORD || /[\r\n\0]/.test(env.PGPASSWORD)) {
    throw new Error('Credencial ausente o incompatible con env-file; no se muestra su contenido.');
  }
  const client = new pg.Client({ host: env.PGHOST, port: 5432,
    database: env.PGDATABASE, user: env.PGUSER, password: env.PGPASSWORD,
    connectionTimeoutMillis: 10000, application_name: 'catalogo_dev_backup_readonly' });
  let folder;
  let credential;
  try {
    await client.connect();
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const identity = (await client.query(`SELECT current_database() AS database,
      current_user AS role, current_setting('server_version_num') AS version`)).rows[0];
    if (identity.database !== 'WEBSCRAPING_CAMAS_DEV' || identity.role !== 'postgres'
      || Math.floor(Number(identity.version) / 10000) !== 16) {
      throw new Error('Identidad o versión de la fuente no coincide con PostgreSQL DEV 16.');
    }
    const counts = (await client.query(`SELECT
      (SELECT count(*)::text FROM catalogo.productos_catalogo) AS productos,
      (SELECT count(*)::text FROM catalogo.scraping_runs) AS ejecuciones,
      (SELECT count(*)::text FROM catalogo.catalog_display_snapshots) AS publicaciones,
      (SELECT max(id)::text FROM catalogo.scraping_runs) AS ultimo_run`)).rows[0];
    const schema = (await client.query(`SELECT table_name,column_name,data_type,is_nullable
      FROM information_schema.columns WHERE table_schema='catalogo'
      ORDER BY table_name,ordinal_position`)).rows;
    const report = { source: { host: env.PGHOST, ...identity }, counts, schema,
      capturedAt: new Date().toISOString(), databaseWrites: false };
    if (!backup.length) {
      console.log(JSON.stringify({ mode: 'plan', ...report }, null, 2));
      await client.query('COMMIT');
      return;
    }
    const parent = join(homedir(), 'backups', 'webscraper');
    await mkdir(parent, { recursive: true, mode: 0o700 });
    folder = await mkdtemp(join(parent, 'comercial-dev-'));
    await chmod(folder, 0o700);
    const dump = join(folder, 'comercial_dev.dump');
    const inventory = join(folder, 'inventario.txt');
    credential = join(folder, '.pg-env-temporal');
    await writeFile(credential, `PGPASSWORD=${env.PGPASSWORD}\nPGOPTIONS=-c default_transaction_read_only=on\n`,
      { mode: 0o600, flag: 'wx' });
    const snapshot = (await client.query('SELECT pg_export_snapshot() AS snapshot')).rows[0].snapshot;
    const output = await open(dump, 'wx', 0o600);
    try {
      await runDocker(['--env-file', credential, 'tickets_it_db', 'pg_dump',
        '-h', env.PGHOST, '-p', '5432', '-U', env.PGUSER, '-d', env.PGDATABASE,
        '--no-password', '--format=custom', `--snapshot=${snapshot}`], output.fd);
    } finally { await output.close(); }
    await client.query('COMMIT');
    if (!(await stat(dump)).size) throw new Error('Respaldo vacío.');
    // pg_restore --list lee el archivo, no abre una conexión de base de datos.
    // Evitar otra copia dentro del contenedor: pasar el dump por stdin.
    const listing = await open(inventory, 'wx', 0o600);
    try {
      await new Promise((accept, reject) => {
        const input = createReadStream(dump);
        const child = spawn('sudo', ['-n', 'docker', 'exec', '-i', 'tickets_it_db',
          'pg_restore', '--list'], { stdio: ['pipe', listing.fd, 'pipe'] });
        child.stderr.on('data', () => {});
        child.stdin.on('error', () => {});
        input.on('error', reject);
        child.once('error', reject);
        child.once('close', code => {
          input.destroy();
          code === 0 ? accept() : reject(new Error('Inventario del respaldo no legible.'));
        });
        input.pipe(child.stdin);
      });
    } finally { await listing.close(); }
    const sha256 = await digest(dump);
    await writeFile(join(folder, 'manifiesto.json'), JSON.stringify({
      ...report, sha256, inventoryReadable: true,
      note: 'Respaldo e inventario comprobados; restauración de ensayo pendiente.',
    }, null, 2), { mode: 0o600, flag: 'wx' });
    await writeFile(join(folder, 'SHA256SUMS'), `${sha256}  comercial_dev.dump\n`,
      { mode: 0o600, flag: 'wx' });
    console.log(JSON.stringify({ status: 'respaldo_generado', folder, sha256, counts,
      inventoryReadable: true, databaseWrites: false }, null, 2));
  } catch {
    // Un respaldo parcial no incluye manifiesto de éxito; conservarlo para diagnóstico.
    console.error(JSON.stringify({ status: 'error', folder,
      message: 'Respaldo no confirmado; no restaurar. Revisar destino, sudo -v y Docker.' }));
    process.exitCode = 1;
  } finally {
    if (credential) await unlink(credential).catch(() => {});
    await client.end();
  }
}

main().catch(() => {
  console.error('No se inició el respaldo: revisar requisitos y configuración DEV.');
  process.exitCode = 1;
});
