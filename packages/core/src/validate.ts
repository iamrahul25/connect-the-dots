import { buildGraph, cellsToNodes, endpointNodes, specOf } from './graph';
import { solveExact } from './solver/exact';
import { solveHuman } from './solver/human';
import { computeDifficulty } from './difficulty';
import { measureSearch } from './generator';
import { MAX_COLORS } from './palette';
import type { Cell, Level, Puzzle, Warp } from './types';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

const isCell = (c: unknown): c is Cell =>
  Array.isArray(c) && c.length === 2 && c.every((x) => Number.isInteger(x));

/** Structural checks, cheap enough to run on-device. */
export function validateShape(level: Level): string[] {
  const errors: string[] = [];
  const { width: W, height: H } = level.size ?? ({} as Level['size']);
  if (!Number.isInteger(W) || !Number.isInteger(H) || W < 2 || H < 2) errors.push('invalid size');
  const inside = (c: Cell) => c[0] >= 0 && c[0] < H && c[1] >= 0 && c[1] < W;
  if (!Array.isArray(level.dots) || level.dots.length < 1) errors.push('no dots');
  if (level.dots.length > MAX_COLORS) errors.push(`more than ${MAX_COLORS} colors`);
  const seen = new Set<string>();
  const mark = (c: Cell, what: string) => {
    if (!isCell(c) || !inside(c)) {
      errors.push(`${what} out of bounds: ${JSON.stringify(c)}`);
      return;
    }
    const k = c.join(',');
    if (seen.has(k)) errors.push(`${what} overlaps another item at ${k}`);
    seen.add(k);
  };
  const colors = new Set<number>();
  level.dots.forEach((d, i) => {
    mark(d.start, `dot ${i} start`);
    mark(d.end, `dot ${i} end`);
    if (colors.has(d.color)) errors.push(`duplicate color ${d.color}`);
    colors.add(d.color);
  });
  level.walls.forEach((w) => mark(w, 'wall'));
  level.bridges.forEach((b) => {
    mark(b, 'bridge');
    if (b[0] === 0 || b[1] === 0 || b[0] === H - 1 || b[1] === W - 1) errors.push('bridge on board edge');
  });
  level.warps.forEach((w: Warp) => {
    const max = w.axis === 'row' ? H : W;
    if (w.index < 0 || w.index >= max) errors.push(`warp out of bounds: ${JSON.stringify(w)}`);
  });
  return errors;
}

/** Checks that `paths` (node lists) connect every pair and cover every node exactly once. */
export function isValidSolution(level: Puzzle, paths: number[][]): boolean {
  const g = buildGraph(specOf(level));
  const eps = endpointNodes(g, level);
  const seen = new Uint8Array(g.nodeCount);
  for (let i = 0; i < eps.length; i++) {
    const p = paths[i];
    if (!p || p.length < 2) return false;
    const [a, b] = eps[i];
    if (!((p[0] === a && p[p.length - 1] === b) || (p[0] === b && p[p.length - 1] === a))) return false;
    for (let j = 0; j < p.length; j++) {
      if (seen[p[j]]) return false;
      seen[p[j]] = 1;
      if (j > 0 && !g.adj[p[j - 1]].includes(p[j])) return false;
    }
  }
  return seen.every((x) => x === 1);
}

/** Full validation: shape, stored solution, uniqueness, and difficulty drift. */
export function validateLevel(level: Level, opts: { checkDifficulty?: boolean } = {}): ValidationResult {
  const errors = validateShape(level);
  if (errors.length) return { ok: false, errors };
  const g = buildGraph(specOf(level));
  const eps = endpointNodes(g, level);
  const stored: number[][] = [];
  for (let i = 0; i < level.dots.length; i++) {
    const cells = level.solution[String(i)];
    const nodes = cells ? cellsToNodes(g, cells) : null;
    if (!nodes) {
      errors.push(`solution for dot ${i} is missing or not a connected path`);
      continue;
    }
    stored.push(nodes);
  }
  if (errors.length) return { ok: false, errors };
  if (!isValidSolution(level, stored)) errors.push('stored solution is not a legal full cover');

  const human = solveHuman(g, eps, { maxTier: 4 });
  let unique = human.solved;
  if (!human.solved) {
    const exact = solveExact(g, eps, { maxSolutions: 2, maxNodes: 2_000_000 });
    if (exact.aborted) errors.push('solver budget exceeded');
    else if (exact.solutions.length !== 1) errors.push(`expected 1 solution, found ${exact.solutions.length}`);
    else unique = true;
  }

  if (opts.checkDifficulty !== false && unique) {
    const d = computeDifficulty(g, stored, human, measureSearch(g, eps), {
      walls: level.walls.length,
      bridges: level.bridges.length,
      warps: level.warps.length,
    });
    if (Math.abs(d.score - level.difficulty.score) > 0.11) {
      errors.push(`difficulty drift: stored ${level.difficulty.score}, computed ${d.score}`);
    }
  }
  if (level.stars.perfectMoves !== level.dots.length) errors.push('stars.perfectMoves must equal color count');
  return { ok: errors.length === 0, errors };
}
