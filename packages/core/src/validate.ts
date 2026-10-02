import { ROTATOR_LAYERS, TUNNEL_LAYERS, buildGraph, cellsToNodes, endpointNodes, nodesAt, specOf } from './graph';
import { solveExact } from './solver/exact';
import { solveHuman } from './solver/human';
import { computeDifficulty } from './difficulty';
import { mechanicsOf, measureSearch } from './generator';
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
  (level.teleporters ?? []).forEach((t, i) => {
    mark(t.a, `teleporter ${i} gate a`);
    mark(t.b, `teleporter ${i} gate b`);
    if (isCell(t.a) && isCell(t.b) && Math.abs(t.a[0] - t.b[0]) + Math.abs(t.a[1] - t.b[1]) < 2) {
      errors.push(`teleporter ${i} gates are adjacent`);
    }
  });
  (level.tunnels ?? []).forEach((t, i) => {
    mark(t.cell, `tunnel ${i}`);
    if (!(TUNNEL_LAYERS as readonly string[]).includes(t.start)) errors.push(`tunnel ${i} has bad start ${t.start}`);
  });
  (level.rotators ?? []).forEach((t, i) => {
    mark(t.cell, `rotator ${i}`);
    if (!(ROTATOR_LAYERS as readonly string[]).includes(t.start)) errors.push(`rotator ${i} has bad start ${t.start}`);
  });
  (level.locks ?? []).forEach((l, i) => {
    mark(l.key, `lock ${i} key`);
    mark(l.door, `lock ${i} door`);
  });
  const v2 = ['teleporters', 'tunnels', 'rotators', 'locks'].some((k) => k in level);
  if (v2 && level.formatVersion !== 2) errors.push('levels with new mechanics need formatVersion 2');
  return errors;
}

/**
 * Checks that `paths` (node lists) connect every pair, cover every fill unit
 * exactly once, take every gate they enter through its teleporter, and keep
 * lock dependencies acyclic.
 */
export function isValidSolution(level: Puzzle, paths: number[][]): boolean {
  const g = buildGraph(specOf(level));
  const eps = endpointNodes(g, level);
  const seenUnit = new Uint8Array(g.unitCount);
  const owner = new Int16Array(g.nodeCount).fill(-1);
  for (let i = 0; i < eps.length; i++) {
    const p = paths[i];
    if (!p || p.length < 2) return false;
    const [a, b] = eps[i];
    if (!((p[0] === a && p[p.length - 1] === b) || (p[0] === b && p[p.length - 1] === a))) return false;
    for (let j = 0; j < p.length; j++) {
      const u = g.nodeUnit[p[j]];
      if (seenUnit[u]) return false;
      seenUnit[u] = 1;
      owner[p[j]] = i;
      if (j > 0 && !g.adj[p[j - 1]].includes(p[j])) return false;
      const partner = g.partner[p[j]];
      if (partner !== -1 && p[j - 1] !== partner && p[j + 1] !== partner) return false;
    }
  }
  if (!seenUnit.every((x) => x === 1)) return false;
  const deps = g.locks.map((l) => [owner[l.door], owner[l.key]] as const);
  if (deps.some(([d, k]) => d === k)) return false;
  const reaches = (from: number, to: number, seen = new Set<number>()): boolean => {
    if (from === to) return true;
    if (seen.has(from)) return false;
    seen.add(from);
    return deps.some(([d, k]) => d === from && reaches(k, to, seen));
  };
  return !deps.some(([d, k]) => reaches(k, d));
}

/** Full validation: shape, stored solution, uniqueness, and difficulty drift. */
export function validateLevel(level: Level, opts: { checkDifficulty?: boolean } = {}): ValidationResult {
  const errors = validateShape(level);
  if (errors.length) return { ok: false, errors };
  const g = buildGraph(specOf(level));
  const eps = endpointNodes(g, level);
  level.dots.forEach((d, i) => {
    for (const c of [d.start, d.end]) {
      const n = nodesAt(g, c)[0];
      if (g.cellKind[g.nodeCellIdx[n]] !== 'cell' || g.partner[n] !== -1) errors.push(`dot ${i} sits on a mechanic`);
    }
  });
  if (errors.length) return { ok: false, errors };
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
  const solvedAt = new Map<string, string>();
  for (const p of stored) for (const n of p) if (g.isOption[n]) solvedAt.set(`${g.nodeRow[n]},${g.nodeCol[n]}`, g.nodeLayer[n]);
  for (const t of [...(level.tunnels ?? []), ...(level.rotators ?? [])]) {
    if (solvedAt.get(t.cell.join(',')) === t.start) errors.push(`piece at ${t.cell.join(',')} starts already solved`);
  }

  const human = solveHuman(g, eps, { maxTier: 4 });
  let unique = human.solved;
  if (!human.solved) {
    const exact = solveExact(g, eps, { maxSolutions: 2, maxNodes: 2_000_000 });
    if (exact.aborted) errors.push('solver budget exceeded');
    else if (exact.solutions.length !== 1) errors.push(`expected 1 solution, found ${exact.solutions.length}`);
    else unique = true;
  }

  if (opts.checkDifficulty !== false && unique) {
    const d = computeDifficulty(g, stored, human, measureSearch(g, eps), mechanicsOf(level));
    if (Math.abs(d.score - level.difficulty.score) > 0.11) {
      errors.push(`difficulty drift: stored ${level.difficulty.score}, computed ${d.score}`);
    }
  }
  if (level.stars.perfectMoves !== level.dots.length) errors.push('stars.perfectMoves must equal color count');
  return { ok: errors.length === 0, errors };
}
