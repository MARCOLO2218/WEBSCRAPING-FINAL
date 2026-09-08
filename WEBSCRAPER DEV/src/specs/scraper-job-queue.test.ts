import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  createScraperJobQueue,
  summarizeScraperOutput,
  type RunScraper,
} from '../server/scraper-job-queue.js';

const mainSource = readFileSync('src/catalog-server.ts', 'utf8');
const queueSource = readFileSync('src/server/scraper-job-queue.ts', 'utf8');

const nextTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

test('la cola ejecuta un trabajo a la vez y conserva posiciones', async () => {
  const pending: Array<(result: { ok: boolean; output: string }) => void> = [];
  const calls: string[][] = [];
  const runScraper: RunScraper = (stores = []) => {
    calls.push(stores);
    return new Promise((resolve) => pending.push(resolve));
  };
  let id = 0;
  let second = 0;
  const queue = createScraperJobQueue({
    runScraper,
    createId: () => `job-${++id}`,
    now: () => new Date(`2026-09-03T12:00:0${second++}.000Z`),
  });

  const first = queue.enqueue(['FACENCO']);
  const queued = queue.enqueue(['Siman Guatemala']);

  assert.equal(first.status, 'running');
  assert.equal(queued.status, 'queued');
  assert.equal(queued.queuePosition, 1);
  assert.deepEqual(calls, [['FACENCO']]);
  assert.deepEqual(queue.getStatus().jobsInOrder.map((job) => job.id), ['job-1', 'job-2']);

  pending[0]?.({ ok: true, output: 'OK FACENCO' });
  await nextTurn();
  assert.deepEqual(calls, [['FACENCO'], ['Siman Guatemala']]);
  assert.equal(queue.getJob('job-1')?.status, 'done');
  assert.equal(queue.getJob('job-2')?.status, 'running');

  pending[1]?.({ ok: false, output: 'fallo controlado' });
  await nextTurn();
  const status = queue.getStatus();
  assert.equal(status.running, false);
  assert.equal(status.queueSize, 0);
  assert.equal(status.lastJob?.id, 'job-2');
  assert.equal(status.lastJob?.status, 'error');
});

test('el resumen conserva líneas importantes y mensajes de error', () => {
  const output = [
    'detalle sin importancia',
    'Run ID de esta consulta: 25',
    'Productos extraidos: 100',
    'CSV generado: output.csv',
  ].join('\n');

  assert.equal(
    summarizeScraperOutput(output, true),
    'Run ID de esta consulta: 25\nProductos extraidos: 100\nCSV generado: output.csv',
  );
  assert.match(summarizeScraperOutput('ECONNREFUSED PostgreSQL', false), /conexion PostgreSQL/);
  assert.equal(summarizeScraperOutput('', true), 'Scraper finalizado correctamente.');
});

test('la cola y el proceso viven fuera del servidor principal', () => {
  for (const name of ['runScraperProcess', 'processScraperQueue', 'enqueueScraperJob', 'queueSnapshot']) {
    assert.doesNotMatch(mainSource, new RegExp(`function ${name}\\b`));
  }
  assert.match(queueSource, /export function createScraperJobQueue/);
  assert.match(queueSource, /export function runScraperProcess/);
  assert.match(mainSource, /createScraperJobQueue/);
});
