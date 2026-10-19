import { performance } from 'node:perf_hooks';
import { parentPort } from 'node:worker_threads';
import { emptyStats, generateAttempt, type RejectReason } from '@ctd/core';
import type { AttemptResult, AttemptTask } from './pool';

parentPort!.on('message', ({ id, params, seeds }: AttemptTask) => {
  const results: AttemptResult[] = seeds.map((seed) => {
    const stats = emptyStats();
    const t0 = performance.now();
    const candidate = generateAttempt(params, seed, stats);
    const ms = performance.now() - t0;
    const reject = candidate ? null : (Object.keys(stats.rejects) as RejectReason[]).find((r) => stats.rejects[r] > 0) ?? null;
    return { candidate, reject, ms };
  });
  parentPort!.postMessage({ id, results });
});
