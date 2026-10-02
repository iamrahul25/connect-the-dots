import { isTeleportStep, stepDirection, type BoardGraph } from './graph';
import type { Difficulty, DifficultyBand, DifficultyMetrics } from './types';
import type { HumanResult } from './solver/human';

const norm = (x: number, lo: number, hi: number) => Math.min(1, Math.max(0, (x - lo) / (hi - lo)));

export function bandOf(score: number): DifficultyBand {
  if (score < 15) return 'relaxed';
  if (score < 35) return 'easy';
  if (score < 55) return 'medium';
  if (score < 75) return 'hard';
  return 'expert';
}

export function turnDensity(g: BoardGraph, paths: number[][]): number {
  let turns = 0;
  let cells = 0;
  for (const p of paths) {
    cells += p.length;
    for (let i = 1; i < p.length - 1; i++) {
      if (isTeleportStep(g, p[i - 1], p[i]) || isTeleportStep(g, p[i], p[i + 1])) continue;
      if (stepDirection(g, p[i - 1], p[i]) !== stepDirection(g, p[i], p[i + 1])) turns++;
    }
  }
  return cells ? turns / cells : 0;
}

export interface MechanicsCount {
  walls: number;
  bridges: number;
  warps: number;
  teleporters?: number;
  tunnels?: number;
  rotators?: number;
  locks?: number;
}

export function computeDifficulty(
  g: BoardGraph,
  solution: number[][],
  human: HumanResult,
  searchNodes: number,
  mech: MechanicsCount,
): Difficulty {
  const cells = g.width * g.height - mech.walls;
  const colors = solution.length;
  const avgPathLength = solution.reduce((a, p) => a + p.length, 0) / colors;
  const td = turnDensity(g, solution);
  const [t1, t2, t3, t4] = human.tierCounts;
  const total = t1 + t2 + t3 + t4 || 1;
  const forcedMoveRatio = t1 / total;
  const lookahead = human.maxTier >= 5 ? 2 : t4 > 0 ? 1 : 0;
  const mechanicsWeight = norm(
    mech.bridges * 1.0 +
      mech.warps * 1.2 +
      mech.walls * 0.4 +
      (mech.teleporters ?? 0) * 1.2 +
      (mech.tunnels ?? 0) * 0.5 +
      (mech.rotators ?? 0) * 0.6 +
      (mech.locks ?? 0) * 1.0,
    0,
    4,
  );

  const score =
    18 * norm(cells, 25, 196) +
    14 * norm(avgPathLength, 3, 20) +
    10 * norm(td, 0.2, 0.6) +
    16 * ((Math.min(human.maxTier, 4) - 1) / 3) +
    8 * norm(t3 + t4, 0, 12) +
    12 * (1 - forcedMoveRatio) +
    6 * norm(lookahead, 0, 2) +
    6 * mechanicsWeight +
    10 * norm(Math.log10(1 + searchNodes), 0, Math.log10(5001));

  const rounded = Math.round(score * 10) / 10;
  const metrics: DifficultyMetrics = {
    cells,
    colors,
    avgPathLength: Math.round(avgPathLength * 100) / 100,
    turnDensity: Math.round(td * 1000) / 1000,
    maxSolverTier: human.maxTier,
    tierCounts: [t1, t2, t3, t4],
    searchNodes,
    forcedMoveRatio: Math.round(forcedMoveRatio * 1000) / 1000,
  };
  return { score: rounded, band: bandOf(rounded), metrics };
}
