import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const LOG_DIR = resolve('logs');
const SCRAPER_LOG = resolve(LOG_DIR, 'ultimo_scraper.log');
const SCRAPER_PROCESS_TIMEOUT_MS = Math.max(
  60_000,
  Number(process.env.SCRAPER_PROCESS_TIMEOUT_MS || 90 * 60_000),
);
const MAX_SCRAPER_JOB_HISTORY = 50;

export type ScraperJob = {
  id: string;
  status: 'queued' | 'running' | 'done' | 'error';
  createdAt: string;
  startedAt?: string;
  finishedAt?: string;
  ok?: boolean;
  output?: string;
  stores?: string[];
};

export type PublicScraperJob = ScraperJob & { queuePosition: number };
export type RunScraper = (
  stores?: string[],
  onProgress?: (output: string) => void,
) => Promise<{ ok: boolean; output: string }>;

function cleanScraperLine(line: string): string | null {
  const trimmed = line.replace(/\u001b\[[0-9;]*m/g, '').trim();
  if (!trimmed) return null;
  if (trimmed.includes('DETALLE_TECNICO')) return null;
  if (trimmed.includes('Call log:')) return null;
  if (trimmed.startsWith('at ')) return null;
  if (trimmed.includes('node:internal')) return null;
  if (trimmed.includes('file:///')) return null;
  if (trimmed.includes('injected env')) return null;
  return trimmed;
}

export function summarizeScraperOutput(output: string, ok: boolean): string {
  const lines = output.split(/\r?\n/).map(cleanScraperLine).filter((line): line is string => Boolean(line));
  const important = lines.filter((line) =>
    line.startsWith('Run ID de esta consulta') ||
    line.startsWith('Inicio de semana') ||
    line.startsWith('PostgreSQL actualizado') ||
    line.startsWith('Productos extraidos') ||
    line.startsWith('CSV generado') ||
    line.startsWith('OK ') ||
    (line.startsWith('ADVERTENCIA:') && !/Reintentando/i.test(line))
  );

  if (important.length > 0) {
    return important.slice(0, 12).join('\n');
  }

  if (!ok) {
    if (/ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET/i.test(output)) {
      return 'El scraper no pudo completar la consulta porque una pagina cerro la conexion. Intenta nuevamente mas tarde.';
    }
    if (/Timeout|timed out/i.test(output)) {
      return 'El scraper no pudo completar la consulta porque una pagina tardo demasiado en responder. Intenta nuevamente mas tarde.';
    }
    if (/PostgreSQL|password|ECONNREFUSED|ENOTFOUND/i.test(output)) {
      return 'El scraper no pudo guardar en base de datos. Revisa la conexion PostgreSQL y el archivo .env.';
    }
    return 'El scraper no pudo finalizar. Revisa logs\\ultimo_scraper.log para detalle tecnico.';
  }

  return 'Scraper finalizado correctamente.';
}

async function writeScraperLog(output: string): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true });
  await writeFile(SCRAPER_LOG, output, 'utf8');
}

export function runScraperProcess(
  stores: string[] = [],
  onProgress?: (output: string) => void,
): Promise<{ ok: boolean; output: string }> {
  return new Promise((resolveRun) => {
    const jobTimeoutMs = stores.length
      ? Math.min(SCRAPER_PROCESS_TIMEOUT_MS, Math.max(10 * 60_000, stores.length * 10 * 60_000))
      : SCRAPER_PROCESS_TIMEOUT_MS;
    const args = ['dist/scrape-facenco-energy.js'];
    if (stores.length) {
      args.push(`--stores=${stores.join(',')}`);
    }

    const child = spawn(process.execPath, args, {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
    });

    let output = '';
    let settled = false;

    const finish = (ok: boolean, finalOutput: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      void writeScraperLog(finalOutput);
      resolveRun({
        ok,
        output: summarizeScraperOutput(finalOutput, ok),
      });
    };

    const appendOutput = (chunk: unknown) => {
      output += String(chunk);
      onProgress?.(output.slice(-8_000));
    };

    child.stdout.on('data', appendOutput);
    child.stderr.on('data', appendOutput);
    child.on('close', (code) => finish(code === 0, output));
    child.on('error', (error) => {
      appendOutput(`\n${error.message}\n`);
      finish(false, output);
    });

    const timeout = setTimeout(() => {
      const timeoutMessage =
        `\nADVERTENCIA: El proceso excedio el limite de ${Math.round(jobTimeoutMs / 60_000)} minutos y fue detenido para liberar la cola.\n`;
      appendOutput(timeoutMessage);
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!settled) {
          child.kill('SIGKILL');
          finish(false, output);
        }
      }, 10_000).unref();
    }, jobTimeoutMs);
    timeout.unref();
  });
}

export function createScraperJobQueue(options: {
  runScraper?: RunScraper;
  now?: () => Date;
  createId?: () => string;
} = {}) {
  const runScraper = options.runScraper ?? runScraperProcess;
  const now = options.now ?? (() => new Date());
  const createId = options.createId ?? (() => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const jobs = new Map<string, ScraperJob>();
  const queue: ScraperJob[] = [];
  let processing = false;
  let currentJob: ScraperJob | null = null;
  let lastFinishedJob: ScraperJob | null = null;

  const publicJob = (job: ScraperJob): PublicScraperJob => {
    const queueIndex = queue.findIndex((item) => item.id === job.id);
    return {
      ...job,
      queuePosition: job.status === 'queued' && queueIndex >= 0 ? queueIndex + 1 : 0,
    };
  };

  const cleanupJobs = () => {
    const finished = [...jobs.values()]
      .filter((job) => job.status === 'done' || job.status === 'error')
      .sort((a, b) => String(b.finishedAt || b.createdAt).localeCompare(String(a.finishedAt || a.createdAt)));

    for (const job of finished.slice(MAX_SCRAPER_JOB_HISTORY)) {
      jobs.delete(job.id);
    }
  };

  const processQueue = () => {
    if (processing) return;
    processing = true;

    void (async () => {
      while (queue.length) {
        const job = queue.shift();
        if (!job) continue;

        currentJob = job;
        job.status = 'running';
        job.startedAt = now().toISOString();

        try {
          const result = await runScraper(job.stores || [], (progress) => {
            job.output = progress;
          });
          job.ok = result.ok;
          job.output = result.output;
          job.status = result.ok ? 'done' : 'error';
        } catch (error) {
          job.ok = false;
          job.output = error instanceof Error ? error.message : String(error);
          job.status = 'error';
        } finally {
          job.finishedAt = now().toISOString();
          lastFinishedJob = job;
          currentJob = null;
          cleanupJobs();
        }
      }

      processing = false;
    })();
  };

  const enqueue = (stores: string[] = []): PublicScraperJob => {
    const job: ScraperJob = {
      id: createId(),
      status: 'queued',
      createdAt: now().toISOString(),
      stores,
    };
    jobs.set(job.id, job);
    queue.push(job);
    processQueue();
    return publicJob(job);
  };

  const getJob = (id: string): PublicScraperJob | undefined => {
    const job = jobs.get(id);
    return job ? publicJob(job) : undefined;
  };

  const getStatus = () => {
    const jobsInOrder = [
      ...(currentJob ? [publicJob(currentJob)] : []),
      ...queue.map(publicJob),
    ];
    return {
      running: currentJob !== null,
      queueSize: queue.length + (currentJob ? 1 : 0),
      currentJobId: currentJob?.id || null,
      currentJob: currentJob ? publicJob(currentJob) : null,
      queuedJobs: queue.map(publicJob),
      jobsInOrder,
      lastJob: lastFinishedJob ? publicJob(lastFinishedJob) : null,
    };
  };

  return { enqueue, getJob, getStatus };
}
