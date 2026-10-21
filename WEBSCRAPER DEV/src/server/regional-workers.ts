import type { ChildProcess } from 'node:child_process';
import type { ExecutionAttribution } from './execution-attribution.js';

const workers = new Set<ChildProcess>();
export function registerRegionalWorker(child: ChildProcess, attribution?: ExecutionAttribution) {
  if (!attribution) return;
  workers.add(child);
  child.once('close', () => workers.delete(child));
}

export async function stopRegionalWorkers() {
  await Promise.all([...workers].map(child => new Promise<void>(resolve => {
    const force = setTimeout(() => child.kill('SIGKILL'), 10000);
    const deadline = setTimeout(() => { clearTimeout(force); resolve(); }, 15000);
    child.once('close', () => { clearTimeout(force); clearTimeout(deadline); resolve(); });
    child.kill('SIGTERM');
  })));
}
