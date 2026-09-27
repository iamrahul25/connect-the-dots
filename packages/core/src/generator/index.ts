import { buildGraph, nodeCell, nodesAt, type BoardGraph, type BoardSpec } from '../graph';
import { createRng, hashSeed, type Rng } from '../rng';
import { solveExact } from '../solver/exact';
import { solveHuman } from '../solver/human';
import { computeDifficulty } from '../difficulty';
import { DEFAULT_PALETTE, MAX_COLORS, colorDistance } from '../palette';
import type { Cell, Difficulty, Level, LevelDot, Puzzle, Warp } from '../types';
import { randomCover } from './cover';

export const GENERATOR_VERSION = '1.0.0';

export interface GenParams {
  seed: number;
  width: number;
  height?: number;
  colors: [number, number];
  minPathLength?: number;
  maxPathLength?: number;
  walls?: number | [number, number];
  bridges?: number | [number, number];
  warps?: number | [number, number];
  requireUnique?: boolean;
  targetDifficulty?: [number, number];
  maxSolverTier?: number;
  maxAttempts?: number;
  timeBudgetMs?: number;
  /** Search budget for the uniqueness check. */
  maxSolverNodes?: number;
}

export interface Candidate {
  puzzle: Puzzle;
  /** Node paths per dot index. */
  solutionNodes: number[][];
  solution: Cell[][];
  difficulty: Difficulty;
  seed: number;
}

export type RejectReason = 'board' | 'cover' | 'not-unique' | 'solver-budget' | 'too-hard' | 'band';

export interface GenStats {
  attempts: number;
  rejects: Record<RejectReason, number>;
}

const emptyStats = (): GenStats => ({
  attempts: 0,
  rejects: { board: 0, cover: 0, 'not-unique': 0, 'solver-budget': 0, 'too-hard': 0, band: 0 },
});

function rangeValue(rng: Rng, v: number | [number, number] | undefined): number {
  if (v === undefined) return 0;
  return Array.isArray(v) ? rng.range(v[0], v[1]) : v;
}

function cellsConnected(W: number, H: number, blocked: boolean[]): boolean {
  const total = blocked.filter((b) => !b).length;
  const start = blocked.findIndex((b) => !b);
  if (start < 0) return false;
  const seen = new Uint8Array(W * H);
  const stack = [start];
  seen[start] = 1;
  let count = 0;
  while (stack.length) {
    const i = stack.pop()!;
    count++;
    const r = Math.floor(i / W);
    const c = i % W;
    const nb = [r > 0 ? i - W : -1, r < H - 1 ? i + W : -1, c > 0 ? i - 1 : -1, c < W - 1 ? i + 1 : -1];
    for (const j of nb) {
      if (j >= 0 && !blocked[j] && !seen[j]) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return count === total;
}

/** Places warps, then bridges, then walls. Returns null if the layout is impossible. */
export function randomBoard(rng: Rng, W: number, H: number, walls: number, bridges: number, warps: number): BoardSpec | null {
  const warpList: Warp[] = [];
  const usedRows = new Set<number>();
  const usedCols = new Set<number>();
  for (let i = 0; i < warps; i++) {
    for (let t = 0; t < 20; t++) {
      const axis = rng.chance(0.5) ? 'row' : 'col';
      const index = rng.range(1, (axis === 'row' ? H : W) - 2);
      const used = axis === 'row' ? usedRows : usedCols;
      if (used.has(index)) continue;
      used.add(index);
      warpList.push({ axis, index });
      break;
    }
  }

  const bridgeList: Cell[] = [];
  for (let i = 0; i < bridges; i++) {
    for (let t = 0; t < 50; t++) {
      const r = rng.range(1, H - 2);
      const c = rng.range(1, W - 2);
      if (bridgeList.some(([br, bc]) => Math.abs(br - r) + Math.abs(bc - c) < 3)) continue;
      bridgeList.push([r, c]);
      break;
    }
  }
  if (bridgeList.length < bridges) return null;

  const blocked = new Array<boolean>(W * H).fill(false);
  const protectedCell = new Array<boolean>(W * H).fill(false);
  for (const [r, c] of bridgeList) {
    protectedCell[r * W + c] = true;
    for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) protectedCell[(r + dr) * W + c + dc] = true;
  }
  for (const w of warpList) {
    if (w.axis === 'row') {
      protectedCell[w.index * W] = true;
      protectedCell[w.index * W + W - 1] = true;
    } else {
      protectedCell[w.index] = true;
      protectedCell[(H - 1) * W + w.index] = true;
    }
  }

  const wallList: Cell[] = [];
  for (let i = 0; i < walls; i++) {
    let placed = false;
    for (let t = 0; t < 60 && !placed; t++) {
      const r = rng.int(H);
      const c = rng.int(W);
      const idx = r * W + c;
      if (blocked[idx] || protectedCell[idx]) continue;
      // No 2x2 wall blobs.
      let isBlob = false;
      for (const [sr, sc] of [[-1, -1], [-1, 0], [0, -1], [0, 0]]) {
        let n = 0;
        for (const [a, b] of [[0, 0], [0, 1], [1, 0], [1, 1]]) {
          const rr = r + sr + a;
          const cc = c + sc + b;
          if (rr === r && cc === c) n++;
          else if (rr >= 0 && rr < H && cc >= 0 && cc < W && blocked[rr * W + cc]) n++;
        }
        if (n === 4) isBlob = true;
      }
      if (isBlob) continue;
      blocked[idx] = true;
      if (!cellsConnected(W, H, blocked)) {
        blocked[idx] = false;
        continue;
      }
      wallList.push([r, c]);
      placed = true;
    }
  }
  return { width: W, height: H, walls: wallList, bridges: bridgeList, warps: warpList };
}

function warpEdges(g: BoardGraph, warps: Warp[]): [number, number][] {
  return warps.map((w) => {
    const a: Cell = w.axis === 'row' ? [w.index, 0] : [0, w.index];
    const b: Cell = w.axis === 'row' ? [w.index, g.width - 1] : [g.height - 1, w.index];
    return [nodesAt(g, a)[0], nodesAt(g, b)[0]];
  });
}

/** Assigns palette indices so that touching paths get well-separated colors. */
function assignColors(g: BoardGraph, paths: number[][]): number[] {
  const k = paths.length;
  const pid = new Int32Array(g.nodeCount);
  paths.forEach((p, i) => p.forEach((n) => (pid[n] = i)));
  const touch: Set<number>[] = paths.map(() => new Set());
  for (let v = 0; v < g.nodeCount; v++) {
    for (const n of g.adj[v]) if (pid[n] !== pid[v]) touch[pid[v]].add(pid[n]);
  }
  const colors = new Array<number>(k).fill(-1);
  const free = new Set(Array.from({ length: k }, (_, i) => i));
  const order = Array.from({ length: k }, (_, i) => i).sort((a, b) => touch[b].size - touch[a].size);
  for (const p of order) {
    let best = -1;
    let bestScore = -1;
    for (const c of free) {
      let minD = Infinity;
      for (const q of touch[p]) {
        if (colors[q] >= 0) minD = Math.min(minD, colorDistance(DEFAULT_PALETTE[c], DEFAULT_PALETTE[colors[q]]));
      }
      if (minD > bestScore) {
        bestScore = minD;
        best = c;
      }
    }
    colors[p] = best;
    free.delete(best);
  }
  return colors;
}

/**
 * One deterministic generation attempt: board, path cover, strip to endpoints,
 * uniqueness check, difficulty rating. Returns null (with a reason) on rejection.
 */
export function generateAttempt(
  params: GenParams,
  seed: number,
  stats: GenStats = emptyStats(),
): Candidate | null {
  stats.attempts++;
  const rng = createRng(seed);
  const W = params.width;
  const H = params.height ?? params.width;
  const [cMin, cMax] = params.colors;
  const minLen = params.minPathLength ?? 3;
  const nWalls = rangeValue(rng, params.walls);
  const nBridges = rangeValue(rng, params.bridges);
  const nWarps = rangeValue(rng, params.warps);

  const spec = randomBoard(rng, W, H, nWalls, nBridges, nWarps);
  if (!spec) {
    stats.rejects.board++;
    return null;
  }
  const g = buildGraph(spec);
  const k = Math.min(MAX_COLORS, cMax);
  const cells = g.nodeCount;
  const maxLen = params.maxPathLength ?? Math.max(minLen + 2, Math.ceil((cells / Math.max(1, cMin)) * 1.9));
  const cover = randomCover(g, rng, {
    kMin: Math.min(cMin, k),
    kMax: k,
    minLen,
    maxLen,
    warpEdges: warpEdges(g, spec.warps),
    maxIterations: Math.max(20000, cells * 400),
  });
  if (!cover) {
    stats.rejects.cover++;
    return null;
  }

  // Order pairs in reading order of their first endpoint; orient each path from that endpoint.
  const oriented = cover.map((p) => {
    const a = p[0];
    const b = p[p.length - 1];
    const ka = g.nodeRow[a] * W + g.nodeCol[a];
    const kb = g.nodeRow[b] * W + g.nodeCol[b];
    return ka <= kb ? p : [...p].reverse();
  });
  oriented.sort((x, y) => g.nodeRow[x[0]] * W + g.nodeCol[x[0]] - (g.nodeRow[y[0]] * W + g.nodeCol[y[0]]));
  const endpoints: [number, number][] = oriented.map((p) => [p[0], p[p.length - 1]]);

  // A logical (deduction-only) solve proves uniqueness without a full search.
  const human = solveHuman(g, endpoints, { maxTier: 4 });
  let solutionNodes: number[][];
  if (human.solved) {
    if (human.maxTier > (params.maxSolverTier ?? 4)) {
      stats.rejects['too-hard']++;
      return null;
    }
    solutionNodes = human.paths!;
  } else {
    if ((params.maxSolverTier ?? 4) < 5) {
      stats.rejects['too-hard']++;
      return null;
    }
    const exact = solveExact(g, endpoints, { maxSolutions: 2, maxNodes: params.maxSolverNodes ?? 400_000 });
    if (exact.aborted) {
      stats.rejects['solver-budget']++;
      return null;
    }
    if (params.requireUnique !== false && exact.solutions.length !== 1) {
      stats.rejects['not-unique']++;
      return null;
    }
    solutionNodes = exact.solutions[0] ?? oriented;
  }

  const searchNodes = measureSearch(g, endpoints);
  const difficulty = computeDifficulty(g, solutionNodes, human, searchNodes, {
    walls: spec.walls.length,
    bridges: spec.bridges.length,
    warps: spec.warps.length,
  });

  const colors = assignColors(g, solutionNodes);
  const dots: LevelDot[] = solutionNodes.map((p, i) => ({
    color: colors[i],
    start: nodeCell(g, p[0]),
    end: nodeCell(g, p[p.length - 1]),
  }));
  const puzzle: Puzzle = {
    size: { width: W, height: H },
    dots,
    walls: spec.walls,
    bridges: spec.bridges,
    warps: spec.warps,
  };
  return {
    puzzle,
    solutionNodes,
    solution: solutionNodes.map((p) => p.map((n) => nodeCell(g, n))),
    difficulty,
    seed,
  };
}

export const SEARCH_METRIC_BUDGET = 20_000;

/** Search effort to find the first solution (difficulty metric, capped). */
export function measureSearch(g: BoardGraph, endpoints: [number, number][]): number {
  return solveExact(g, endpoints, { maxSolutions: 1, maxNodes: SEARCH_METRIC_BUDGET }).nodes;
}

function bandDistance(score: number, band?: [number, number]): number {
  if (!band) return 0;
  if (score < band[0]) return band[0] - score;
  if (score > band[1]) return score - band[1];
  return 0;
}

/**
 * Tries seeds derived from `params.seed` until a candidate lands in the target
 * difficulty band. Falls back to the closest unique candidate found.
 */
export function generateLevel(params: GenParams, stats: GenStats = emptyStats()): Candidate | null {
  const maxAttempts = params.maxAttempts ?? 5000;
  const deadline = params.timeBudgetMs ? Date.now() + params.timeBudgetMs : Infinity;
  let best: Candidate | null = null;
  let bestDist = Infinity;
  for (let i = 0; i < maxAttempts && Date.now() < deadline; i++) {
    const c = generateAttempt(params, hashSeed(params.seed, i), stats);
    if (!c) continue;
    const d = bandDistance(c.difficulty.score, params.targetDifficulty);
    if (d === 0) return c;
    stats.rejects.band++;
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

export function toLevel(
  c: Candidate,
  info: { id: string; pack: number; index: number; params: GenParams },
): Level {
  const k = c.puzzle.dots.length;
  const solution: Record<string, Cell[]> = {};
  c.solution.forEach((cells, i) => (solution[String(i)] = cells));
  return {
    id: info.id,
    pack: info.pack,
    index: info.index,
    formatVersion: 1,
    ...c.puzzle,
    solution,
    difficulty: c.difficulty,
    stars: { perfectMoves: k, twoStarMoves: k + Math.ceil(k / 2) },
    meta: {
      seed: c.seed,
      generatorVersion: GENERATOR_VERSION,
      params: {
        size: info.params.width,
        colors: info.params.colors,
        walls: c.puzzle.walls.length,
        bridges: c.puzzle.bridges.length,
        warps: c.puzzle.warps.length,
      },
    },
  };
}

export { emptyStats };
