import {
  ROTATOR_LAYERS,
  buildGraph,
  cellsToNodes,
  nodeCell,
  nodesAt,
  nodesToCells,
  type BoardGraph,
  type BoardSpec,
} from '../graph';
import { createRng, hashSeed, type Rng } from '../rng';
import { solveExact } from '../solver/exact';
import { solveHuman, type HumanResult } from '../solver/human';
import { computeDifficulty, type MechanicsCount } from '../difficulty';
import { DEFAULT_PALETTE, MAX_COLORS, colorDistance } from '../palette';
import type { Cell, Difficulty, Level, LevelDot, Puzzle, Rotator, Teleporter, Tunnel, Warp } from '../types';
import { randomCover } from './cover';
import { placeOverlays, type Overlays } from './overlays';

export const GENERATOR_VERSION = '2.0.0';

type Count = number | [number, number];

export interface GenParams {
  seed: number;
  width: number;
  height?: number;
  colors: [number, number];
  minPathLength?: number;
  maxPathLength?: number;
  walls?: Count;
  bridges?: Count;
  warps?: Count;
  teleporters?: Count;
  tunnels?: Count;
  rotators?: Count;
  locks?: Count;
  requireUnique?: boolean;
  targetDifficulty?: [number, number];
  maxSolverTier?: number;
  maxAttempts?: number;
  timeBudgetMs?: number;
  /** Search budget for the uniqueness check. */
  maxSolverNodes?: number;
  /** Overlay placements tried per path cover before giving up on it. */
  overlayTries?: number;
}

export interface Candidate {
  puzzle: Puzzle;
  /** Node paths per dot index. */
  solutionNodes: number[][];
  solution: Cell[][];
  difficulty: Difficulty;
  seed: number;
  /** Set when the level has overlays: true if they are needed for a unique logical solve. */
  loadBearing?: boolean;
}

export type RejectReason = 'board' | 'cover' | 'overlay' | 'not-unique' | 'solver-budget' | 'too-hard' | 'band';

export interface GenStats {
  attempts: number;
  rejects: Record<RejectReason, number>;
}

const emptyStats = (): GenStats => ({
  attempts: 0,
  rejects: { board: 0, cover: 0, overlay: 0, 'not-unique': 0, 'solver-budget': 0, 'too-hard': 0, band: 0 },
});

function rangeValue(rng: Rng, v: Count | undefined): number {
  if (v === undefined) return 0;
  return Array.isArray(v) ? rng.range(v[0], v[1]) : v;
}

/** True when the params use any mechanic beyond walls, bridges and warps. */
export function usesNewMechanics(p: Pick<GenParams, 'teleporters' | 'tunnels' | 'rotators' | 'locks'>): boolean {
  return [p.teleporters, p.tunnels, p.rotators, p.locks].some((v) => v !== undefined && v !== 0);
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

/** Places warps, then bridges, then teleporters, then walls. Returns null if the layout is impossible. */
export function randomBoard(
  rng: Rng,
  W: number,
  H: number,
  walls: number,
  bridges: number,
  warps: number,
  teleporters = 0,
): BoardSpec | null {
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

  const teleList: Teleporter[] = [];
  if (teleporters > 0) {
    const onWarpEdge = ([r, c]: Cell) =>
      (usedRows.has(r) && (c === 0 || c === W - 1)) || (usedCols.has(c) && (r === 0 || r === H - 1));
    const busy: Cell[] = [...bridgeList];
    const clear = (x: Cell) => busy.every(([r, c]) => Math.abs(r - x[0]) + Math.abs(c - x[1]) >= 2);
    for (let i = 0; i < teleporters; i++) {
      for (let t = 0; t < 100; t++) {
        const a: Cell = [rng.int(H), rng.int(W)];
        const b: Cell = [rng.int(H), rng.int(W)];
        if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 4) continue;
        if (onWarpEdge(a) || onWarpEdge(b) || !clear(a) || !clear(b)) continue;
        teleList.push({ a, b });
        busy.push(a, b);
        break;
      }
    }
    if (teleList.length < teleporters) return null;
  }

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
  for (const t of teleList) for (const [r, c] of [t.a, t.b]) protectedCell[r * W + c] = true;

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
  const spec: BoardSpec = { width: W, height: H, walls: wallList, bridges: bridgeList, warps: warpList };
  if (teleList.length) spec.teleporters = teleList;
  return spec;
}

function warpEdges(g: BoardGraph, warps: Warp[]): [number, number][] {
  return warps.map((w) => {
    const a: Cell = w.axis === 'row' ? [w.index, 0] : [0, w.index];
    const b: Cell = w.axis === 'row' ? [w.index, g.width - 1] : [g.height - 1, w.index];
    return [nodesAt(g, a)[0], nodesAt(g, b)[0]];
  });
}

function teleportEdges(g: BoardGraph): [number, number][] {
  const out: [number, number][] = [];
  g.partner.forEach((p, n) => p > n && out.push([n, p]));
  return out;
}

/** Assigns palette indices so that touching paths get well-separated colors. */
function assignColors(g: BoardGraph, paths: number[][]): number[] {
  const k = paths.length;
  const pid = new Int32Array(g.nodeCount).fill(-1);
  paths.forEach((p, i) => p.forEach((n) => (pid[n] = i)));
  const touch: Set<number>[] = paths.map(() => new Set());
  for (let v = 0; v < g.nodeCount; v++) {
    if (pid[v] < 0) continue;
    for (const n of g.adj[v]) if (pid[n] >= 0 && pid[n] !== pid[v]) touch[pid[v]].add(pid[n]);
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

type Verified = { solutionNodes: number[][]; human: HumanResult } | RejectReason;

/** Uniqueness and tier check on a finished board. */
function verify(g: BoardGraph, endpoints: [number, number][], fallback: number[][], params: GenParams): Verified {
  const maxTier = params.maxSolverTier ?? 4;
  // A logical (deduction-only) solve proves uniqueness without a full search.
  const human = solveHuman(g, endpoints, { maxTier: 4 });
  if (human.solved) return human.maxTier > maxTier ? 'too-hard' : { solutionNodes: human.paths!, human };
  if (maxTier < 5) return 'too-hard';
  const exact = solveExact(g, endpoints, { maxSolutions: 2, maxNodes: params.maxSolverNodes ?? 400_000 });
  if (exact.aborted) return 'solver-budget';
  if (params.requireUnique !== false && exact.solutions.length !== 1) return 'not-unique';
  return { solutionNodes: exact.solutions[0] ?? fallback, human };
}

function withOverlays(spec: BoardSpec, ov: Overlays): BoardSpec {
  return {
    ...spec,
    tunnels: ov.tunnels.map((t) => t.cell),
    rotators: ov.rotators.map((t) => t.cell),
    locks: ov.locks,
  };
}

export function mechanicsOf(p: Puzzle): MechanicsCount {
  return {
    walls: p.walls.length,
    bridges: p.bridges.length,
    warps: p.warps.length,
    teleporters: p.teleporters?.length ?? 0,
    tunnels: p.tunnels?.length ?? 0,
    rotators: p.rotators?.length ?? 0,
    locks: p.locks?.length ?? 0,
  };
}

/**
 * One deterministic generation attempt: board, path cover, overlays, strip to
 * endpoints, uniqueness check, difficulty rating. Returns null (with a reason)
 * on rejection.
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
  const nTeleporters = rangeValue(rng, params.teleporters);
  const counts = {
    tunnels: rangeValue(rng, params.tunnels),
    rotators: rangeValue(rng, params.rotators),
    locks: rangeValue(rng, params.locks),
  };

  const spec = randomBoard(rng, W, H, nWalls, nBridges, nWarps, nTeleporters);
  if (!spec) {
    stats.rejects.board++;
    return null;
  }
  const g0 = buildGraph(spec);
  const k = Math.min(MAX_COLORS, cMax);
  const cells = g0.nodeCount;
  const maxLen = params.maxPathLength ?? Math.max(minLen + 2, Math.ceil((cells / Math.max(1, cMin)) * 1.9));
  const cover = randomCover(g0, rng, {
    kMin: Math.min(cMin, k),
    kMax: k,
    minLen,
    maxLen,
    warpEdges: warpEdges(g0, spec.warps),
    teleportEdges: teleportEdges(g0),
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
    const ka = g0.nodeRow[a] * W + g0.nodeCol[a];
    const kb = g0.nodeRow[b] * W + g0.nodeCol[b];
    return ka <= kb ? p : [...p].reverse();
  });
  oriented.sort((x, y) => g0.nodeRow[x[0]] * W + g0.nodeCol[x[0]] - (g0.nodeRow[y[0]] * W + g0.nodeCol[y[0]]));
  const endpoints0: [number, number][] = oriented.map((p) => [p[0], p[p.length - 1]]);

  let g = g0;
  let endpoints = endpoints0;
  let overlays: Overlays | null = null;
  let loadBearing: boolean | undefined;
  let result: Verified;
  if (counts.tunnels + counts.rotators + counts.locks === 0) {
    result = verify(g0, endpoints0, oriented, params);
  } else {
    loadBearing = !solveHuman(g0, endpoints0, { maxTier: params.maxSolverTier ?? 4 }).solved;
    let altOwner: Int16Array | undefined;
    if (counts.locks > 0 && loadBearing) {
      const intended = JSON.stringify(oriented);
      const alt = solveExact(g0, endpoints0, { maxSolutions: 2, maxNodes: 50_000 }).solutions.find(
        (s) => JSON.stringify(s) !== intended,
      );
      if (alt) {
        altOwner = new Int16Array(g0.nodeCount).fill(-1);
        alt.forEach((p, i) => p.forEach((n) => (altOwner![n] = i)));
      }
    }
    result = 'overlay';
    const cellPaths = oriented.map((p) => nodesToCells(g0, p));
    for (let t = 0; t < (params.overlayTries ?? 4) && typeof result === 'string'; t++) {
      const ov = placeOverlays(g0, oriented, rng, counts, altOwner);
      if (!ov) break;
      const g2 = buildGraph(withOverlays(spec, ov));
      const paths2 = cellPaths.map((c) => cellsToNodes(g2, c)!);
      const eps2: [number, number][] = paths2.map((p) => [p[0], p[p.length - 1]]);
      result = verify(g2, eps2, paths2, params);
      if (typeof result !== 'string') {
        g = g2;
        endpoints = eps2;
        overlays = ov;
      }
    }
  }
  if (typeof result === 'string') {
    stats.rejects[result]++;
    return null;
  }
  const { solutionNodes, human } = result;

  const tunnels: Tunnel[] = (overlays?.tunnels ?? []).map((t) => ({ cell: t.cell, start: t.solved === 'h' ? 'v' : 'h' }));
  const rotators: Rotator[] = (overlays?.rotators ?? []).map((t) => {
    const i = ROTATOR_LAYERS.indexOf(t.solved);
    return { cell: t.cell, start: ROTATOR_LAYERS[(i + 1 + rng.int(3)) % 4] };
  });
  const puzzle: Puzzle = {
    size: { width: W, height: H },
    dots: [],
    walls: spec.walls,
    bridges: spec.bridges,
    warps: spec.warps,
  };
  if (usesNewMechanics(params)) {
    puzzle.teleporters = spec.teleporters ?? [];
    puzzle.tunnels = tunnels;
    puzzle.rotators = rotators;
    puzzle.locks = overlays?.locks ?? [];
  }

  const searchNodes = measureSearch(g, endpoints);
  const difficulty = computeDifficulty(g, solutionNodes, human, searchNodes, mechanicsOf(puzzle));

  const colors = assignColors(g, solutionNodes);
  const dots: LevelDot[] = solutionNodes.map((p, i) => ({
    color: colors[i],
    start: nodeCell(g, p[0]),
    end: nodeCell(g, p[p.length - 1]),
  }));
  puzzle.dots = dots;
  return {
    puzzle,
    solutionNodes,
    solution: solutionNodes.map((p) => p.map((n) => nodeCell(g, n))),
    difficulty,
    seed,
    ...(loadBearing === undefined ? {} : { loadBearing }),
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
  const m = mechanicsOf(c.puzzle);
  const v2 = c.puzzle.teleporters !== undefined;
  return {
    id: info.id,
    pack: info.pack,
    index: info.index,
    formatVersion: v2 ? 2 : 1,
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
        walls: m.walls,
        bridges: m.bridges,
        warps: m.warps,
        ...(v2 ? { teleporters: m.teleporters, tunnels: m.tunnels, rotators: m.rotators, locks: m.locks } : {}),
      },
      ...(c.loadBearing === undefined ? {} : { loadBearing: c.loadBearing }),
    },
  };
}

export { emptyStats };
