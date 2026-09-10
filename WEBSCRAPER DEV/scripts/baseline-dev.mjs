// Carga únicamente .env de este DEV, independientemente de la carpeta actual.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.some(arg => arg !== '--apply') || args.length > 1) {
  console.error('Uso: node scripts/baseline-dev.mjs [--apply]');
  process.exit(2);
}
dotenv.config({ path: resolve(root, '.env'), quiet: true });
const python = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
const result = spawnSync(resolve(root, 'backend', python),
  ['-m', 'catalog_api.db.baseline', ...args],
  { cwd: resolve(root, 'backend'), env: process.env, stdio: 'inherit' });
if (result.error) console.error('No se pudo iniciar Python DEV; revisa backend/.venv.');
process.exit(result.status ?? 2);
