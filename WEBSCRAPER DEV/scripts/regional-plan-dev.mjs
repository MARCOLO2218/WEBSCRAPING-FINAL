// SPEC-038: clasifica todo el historial sin aplicar cambios.
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import dotenv from 'dotenv';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
if (args.length > 1 || args.some(arg => arg !== '--details')) {
  console.error('Uso: node scripts/regional-plan-dev.mjs [--details] (sólo lectura)');
  process.exit(2);
}
dotenv.config({ path: resolve(root, '.env'), quiet: true });
const python = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
const result = spawnSync(resolve(root, 'backend', python), ['-m', 'catalog_api.db.regional_plan', ...args],
  { cwd: resolve(root, 'backend'), env: { ...process.env, PYTHONIOENCODING: 'utf-8' }, stdio: 'inherit' });
if (result.error) console.error('No se pudo iniciar Python DEV; revisar backend/.venv.');
process.exit(result.status ?? 2);
