import { emptyStats, generateLevel, type GenParams } from '@ctd/core';

const configs: Omit<GenParams, 'seed'>[] = [
  { width: 5, colors: [4, 5] },
  { width: 7, colors: [6, 7] },
  { width: 8, colors: [7, 8], bridges: 1, walls: [1, 3] },
  { width: 9, colors: [7, 9], warps: 1 },
  { width: 10, colors: [8, 10], bridges: 1, warps: 1, walls: [0, 2] },
  { width: 12, colors: [9, 12], bridges: 1, warps: 1, walls: [0, 3] },
];

const size = process.argv[2] ? Number(process.argv[2]) : undefined;
for (const cfg of configs) {
  if (size && cfg.width !== size) continue;
  for (let s = 0; s < 3; s++) {
    const stats = emptyStats();
    const t = Date.now();
    const c = generateLevel({ ...cfg, seed: 1000 + s, maxAttempts: 300 }, stats);
    const ms = Date.now() - t;
    console.log(
      `${cfg.width}x${cfg.width} seed=${s} ${ms}ms attempts=${stats.attempts}`,
      c ? `score=${c.difficulty.score} tier=${c.difficulty.metrics.maxSolverTier} colors=${c.puzzle.dots.length} nodes=${c.difficulty.metrics.searchNodes}` : 'FAILED',
      JSON.stringify(stats.rejects),
    );
  }
}
