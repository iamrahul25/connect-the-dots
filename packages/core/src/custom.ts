import { ROTATOR_LAYERS, TUNNEL_LAYERS, buildGraph, cellsToNodes, endpointNodes, nodeCell, type BoardGraph, type BoardSpec, type Layer } from './graph';
import { solveExact } from './solver/exact';
import { solveHuman } from './solver/human';
import { computeDifficulty } from './difficulty';
import { mechanicsOf, measureSearch } from './generator';
import { hashSeed } from './rng';
import { validateShape } from './validate';
import type { Cell, Level, LevelDot, Lock, Puzzle, Rotator, Teleporter, Tunnel, Warp } from './types';

/**
 * A handcrafted level while it is being made: the board, its obstacles and one
 * drawn line per color. The lines are the solution; their ends become the dots.
 */
export interface CustomDraft {
  size: { width: number; height: number };
  /** Number of colors; line `i` uses palette color `i`. */
  colors: number;
  /** Ordered cells per color, empty until drawn. A teleport is two consecutive gate cells. */
  lines: Cell[][];
  walls: Cell[];
  bridges: Cell[];
  warps: Warp[];
  teleporters: Teleporter[];
  tunnels: Cell[];
  rotators: Cell[];
  locks: Lock[];
  /** How chosen tunnels / rotators face when the level starts; the rest start turned away from their line. */
  starts?: PieceStart[];
}

export type PieceDir = Tunnel['start'] | Rotator['start'];
export interface PieceStart {
  cell: Cell;
  dir: PieceDir;
}

export const CUSTOM_MIN_SIZE = 3;
/** Past this a phone can't fit cells big enough to draw on. */
export const CUSTOM_MAX_SIZE = 30;
export const CUSTOM_GENERATOR_VERSION = 'custom-1';

/** `unknown`: the solver gave up before it could tell (very open boards). */
export type Uniqueness = 'unique' | 'multiple' | 'unknown';

export interface BuildIssue {
  message: string;
  /** Squares to highlight on the board. */
  cells: Cell[];
}

export type BuildResult = { ok: true; level: Level; uniqueness: Uniqueness } | { ok: false; issue: BuildIssue };

export function emptyDraft(width: number, height: number, colors: number): CustomDraft {
  return {
    size: { width, height },
    colors,
    lines: Array.from({ length: colors }, () => []),
    walls: [],
    bridges: [],
    warps: [],
    teleporters: [],
    tunnels: [],
    rotators: [],
    locks: [],
  };
}

/** Every line needs two squares of its own, so a board can't hold more colors than this. */
export function maxColorsFor(width: number, height: number): number {
  return Math.max(1, Math.floor((width * height) / 2));
}

export function draftSpec(d: CustomDraft): BoardSpec {
  return {
    width: d.size.width,
    height: d.size.height,
    walls: d.walls,
    bridges: d.bridges,
    warps: d.warps,
    teleporters: d.teleporters,
    tunnels: d.tunnels,
    rotators: d.rotators,
    locks: d.locks,
  };
}

export function draftGraph(d: CustomDraft): BoardGraph {
  return buildGraph(draftSpec(d));
}

const isCell = (c: unknown): c is Cell => Array.isArray(c) && c.length === 2 && c.every((x) => Number.isInteger(x));

/** Type and bounds checks for drafts that came from outside (imports, storage). */
export function draftShapeError(d: CustomDraft): string | null {
  const W = d?.size?.width;
  const H = d?.size?.height;
  if (!Number.isInteger(W) || !Number.isInteger(H) || W < 2 || H < 2 || W > CUSTOM_MAX_SIZE || H > CUSTOM_MAX_SIZE) {
    return `Board size must be between 2 and ${CUSTOM_MAX_SIZE}`;
  }
  if (!Number.isInteger(d.colors) || d.colors < 1) return 'A level needs at least one color';
  if (d.colors > maxColorsFor(W, H)) return 'Too many colors for this board';
  const inside = (c: unknown) => isCell(c) && c[0] >= 0 && c[0] < H && c[1] >= 0 && c[1] < W;
  const lists: unknown[] = [d.lines, d.walls, d.bridges, d.warps, d.teleporters, d.tunnels, d.rotators, d.locks];
  if (!lists.every(Array.isArray)) return 'Level data is incomplete';
  if (!d.lines.every((l) => Array.isArray(l) && l.every(inside))) return 'A line leaves the board';
  const cells = [
    ...d.walls,
    ...d.bridges,
    ...d.tunnels,
    ...d.rotators,
    ...d.teleporters.flatMap((t) => [t?.a, t?.b]),
    ...d.locks.flatMap((l) => [l?.key, l?.door]),
  ];
  if (!cells.every(inside)) return 'An obstacle is outside the board';
  if (!d.warps.every((w) => (w?.axis === 'row' || w?.axis === 'col') && Number.isInteger(w.index))) return 'A warp is invalid';
  if (d.starts !== undefined && !(Array.isArray(d.starts) && d.starts.every((s) => inside(s?.cell) && typeof s.dir === 'string'))) {
    return 'A piece orientation is invalid';
  }
  return null;
}

/** The orientation each tunnel / rotator takes in the given lines, by cell index. */
export function solvedDirs(g: BoardGraph, nodes: number[][]): Map<number, Layer> {
  const out = new Map<number, Layer>();
  for (const p of nodes) for (const n of p) if (g.isOption[n]) out.set(g.nodeCellIdx[n], g.nodeLayer[n]);
  return out;
}

/** Orientations a piece on `c` can face, or null when there's no tunnel or rotator. */
export function pieceDirs(d: CustomDraft, c: Cell): readonly PieceDir[] | null {
  if (d.tunnels.some((x) => same(x, c))) return TUNNEL_LAYERS;
  if (d.rotators.some((x) => same(x, c))) return ROTATOR_LAYERS;
  return null;
}

/**
 * How the piece on `c` faces when the level starts: the editor's choice, unless
 * that is how the line solves it (pieces never start solved); otherwise turned
 * halfway round from the solved way.
 */
export function pieceStart(d: CustomDraft, c: Cell, solved?: Layer): PieceDir | null {
  const dirs = pieceDirs(d, c);
  if (!dirs) return null;
  const chosen = d.starts?.find((s) => same(s.cell, c))?.dir;
  if (chosen && dirs.includes(chosen) && chosen !== solved) return chosen;
  if (!solved) return dirs[0];
  return dirs[(Math.max(0, dirs.indexOf(solved as PieceDir)) + dirs.length / 2) % dirs.length];
}

/** Which lines (by color) run through `cell`. */
export function linesAt(d: CustomDraft, cell: Cell): number[] {
  const out: number[] = [];
  d.lines.forEach((l, i) => {
    if (l.some((c) => c[0] === cell[0] && c[1] === cell[1])) out.push(i);
  });
  return out;
}

/**
 * Turns a finished draft into a playable level. Fails with the first problem
 * found (and the squares involved) when the lines don't make a full, legal cover.
 */
export function buildCustomLevel(draft: CustomDraft, opts: { maxSolverNodes?: number } = {}): BuildResult {
  const fail = (message: string, cells: Cell[] = []): BuildResult => ({ ok: false, issue: { message, cells } });
  const shape = draftShapeError(draft);
  if (shape) return fail(shape);
  const { width: W, height: H } = draft.size;
  const k = draft.colors;
  const lines = Array.from({ length: k }, (_, i) => draft.lines[i] ?? []);

  const missing = lines.flatMap((l, i) => (l.length < 2 ? [i] : []));
  if (missing.length === 1) return fail(`Color ${missing[0] + 1} has no line yet`);
  if (missing.length > 1) return fail(`${missing.length} colors have no line yet`);

  const dots: LevelDot[] = lines.map((l, i) => ({ color: i, start: l[0], end: l[l.length - 1] }));
  const v2 = draft.teleporters.length + draft.tunnels.length + draft.rotators.length + draft.locks.length > 0;
  const puzzle: Puzzle = {
    size: { width: W, height: H },
    dots,
    walls: draft.walls,
    bridges: draft.bridges,
    warps: draft.warps,
  };
  if (v2) {
    puzzle.teleporters = draft.teleporters;
    puzzle.tunnels = draft.tunnels.map((cell) => ({ cell, start: 'h' }));
    puzzle.rotators = draft.rotators.map((cell) => ({ cell, start: 'ne' }));
    puzzle.locks = draft.locks;
  }
  const shapeErrors = validateShape({ ...puzzle, formatVersion: v2 ? 2 : 1 } as Level, { maxColors: Infinity });
  if (shapeErrors.length) return fail(friendlyShapeError(shapeErrors[0]));

  const g = draftGraph(draft);
  const ends = dots.flatMap((d) => [d.start, d.end]).filter((c) => !isPlain(g, draft, c));
  if (ends.length) return fail('Lines must start and end on empty squares', ends);

  const nodes: number[][] = [];
  for (let i = 0; i < k; i++) {
    const n = cellsToNodes(g, lines[i]);
    if (!n) return fail(`Color ${i + 1}'s line breaks an obstacle rule`, lines[i]);
    for (let j = 0; j < n.length; j++) {
      const partner = g.partner[n[j]];
      if (partner !== -1 && n[j - 1] !== partner && n[j + 1] !== partner) {
        return fail('A line crosses a teleporter gate without jumping', [nodeCell(g, n[j])]);
      }
    }
    nodes.push(n);
  }

  const owner = new Int16Array(g.unitCount).fill(-1);
  const overlap: Cell[] = [];
  nodes.forEach((p, i) =>
    p.forEach((n) => {
      const u = g.nodeUnit[n];
      if (owner[u] !== -1) overlap.push(nodeCell(g, n));
      owner[u] = i;
    }),
  );
  if (overlap.length) return fail('Lines overlap', overlap);
  const empty: Cell[] = [];
  for (let n = 0; n < g.nodeCount; n++) {
    if (owner[g.nodeUnit[n]] !== -1) continue;
    const c = nodeCell(g, n);
    if (!empty.some((e) => e[0] === c[0] && e[1] === c[1])) empty.push(c);
  }
  if (empty.length) return fail(empty.length === 1 ? '1 square is still empty' : `${empty.length} squares are still empty`, empty);

  const lockIssue = lockProblem(g, draft.locks, nodes);
  if (lockIssue) return { ok: false, issue: lockIssue };

  const solved = solvedDirs(g, nodes);
  if (v2) {
    const start = (cell: Cell) => pieceStart(draft, cell, solved.get(cell[0] * W + cell[1]));
    puzzle.tunnels = draft.tunnels.map((cell): Tunnel => ({ cell, start: start(cell) as Tunnel['start'] }));
    puzzle.rotators = draft.rotators.map((cell): Rotator => ({ cell, start: start(cell) as Rotator['start'] }));
  }

  const eps = endpointNodes(g, puzzle);
  const human = solveHuman(g, eps, { maxTier: 4 });
  let uniqueness: Uniqueness = 'unique';
  if (!human.solved) {
    const exact = solveExact(g, eps, { maxSolutions: 2, maxNodes: opts.maxSolverNodes ?? 300_000 });
    uniqueness = exact.solutions.length > 1 ? 'multiple' : exact.aborted ? 'unknown' : 'unique';
  }
  const mech = mechanicsOf(puzzle);
  const difficulty = computeDifficulty(g, nodes, human, measureSearch(g, eps), mech);

  const solution: Record<string, Cell[]> = {};
  lines.forEach((l, i) => (solution[String(i)] = l.map((c) => [c[0], c[1]] as Cell)));
  const level: Level = {
    id: `custom-${hashSeed(JSON.stringify(puzzle), JSON.stringify(solution)).toString(36)}`,
    pack: 'custom',
    index: 0,
    formatVersion: v2 ? 2 : 1,
    ...puzzle,
    solution,
    difficulty,
    stars: { perfectMoves: k, twoStarMoves: k + Math.ceil(k / 2) },
    meta: {
      seed: 0,
      generatorVersion: CUSTOM_GENERATOR_VERSION,
      params: {
        size: Math.max(W, H),
        colors: [k, k],
        walls: mech.walls,
        bridges: mech.bridges,
        warps: mech.warps,
        ...(v2 ? { teleporters: mech.teleporters, tunnels: mech.tunnels, rotators: mech.rotators, locks: mech.locks } : {}),
      },
    },
  };
  return { ok: true, level, uniqueness };
}

/**
 * Rebuilds the draft a level was made from, so shared levels can be checked
 * (and remixed) with the same rules as the editor. Colors are renumbered 0..k-1.
 */
export function draftFromLevel(level: Level): CustomDraft | null {
  if (!level || typeof level !== 'object' || !level.size || !Array.isArray(level.dots) || !level.solution) return null;
  const order = level.dots.map((d, i) => ({ color: d?.color, i })).sort((a, b) => a.color - b.color);
  return {
    size: { width: level.size.width, height: level.size.height },
    colors: level.dots.length,
    lines: order.map(({ i }) => {
      const cells = level.solution[String(i)];
      return Array.isArray(cells) ? cells.map((c) => (isCell(c) ? ([c[0], c[1]] as Cell) : c)) : [];
    }),
    walls: level.walls ?? [],
    bridges: level.bridges ?? [],
    warps: level.warps ?? [],
    teleporters: level.teleporters ?? [],
    tunnels: (level.tunnels ?? []).map((t) => t?.cell),
    rotators: (level.rotators ?? []).map((t) => t?.cell),
    locks: level.locks ?? [],
    starts: [...(level.tunnels ?? []), ...(level.rotators ?? [])].map((t) => ({ cell: t?.cell, dir: t?.start })),
  };
}

/** Plain square: not a wall, bridge, piece, gate, key or door. Dots can only sit on these. */
export function isPlain(g: BoardGraph, d: CustomDraft, c: Cell): boolean {
  const i = c[0] * g.width + c[1];
  if (g.cellKind[i] !== 'cell') return false;
  if (g.partner[g.cellNodes[i][0]] !== -1) return false;
  return !d.locks.some((l) => same(l.key, c) || same(l.door, c));
}

export const same = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1];

/** A door opens once a finished line runs through its key, so key → door dependencies must not loop. */
export function lockProblem(g: BoardGraph, locks: Lock[], nodes: number[][]): BuildIssue | null {
  const owner = new Int16Array(g.nodeCount).fill(-1);
  nodes.forEach((p, i) => p.forEach((n) => (owner[n] = i)));
  const deps = g.locks.map((l) => [owner[l.door], owner[l.key]] as const);
  for (let i = 0; i < deps.length; i++) {
    const [d, k] = deps[i];
    if (d !== -1 && d === k) return { message: 'A key and its door are on the same line', cells: [locks[i].key, locks[i].door] };
  }
  const reaches = (from: number, to: number, seen = new Set<number>()): boolean => {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return deps.some(([d, k]) => d === from && k !== -1 && reaches(k, to, seen));
  };
  const loop = deps.findIndex(([d, k]) => d !== -1 && k !== -1 && reaches(k, d));
  if (loop >= 0) return { message: 'Locks block each other in a loop', cells: locks.flatMap((l) => [l.key, l.door]) };
  return null;
}

function friendlyShapeError(e: string): string {
  if (e.includes('bridge on board edge')) return "Bridges can't sit on the edge of the board";
  if (e.includes('gates are adjacent')) return 'Teleporter gates must not be next to each other';
  if (e.includes('overlaps')) return 'Two items share the same square';
  if (e.includes('out of bounds')) return 'Something is outside the board';
  return e;
}
