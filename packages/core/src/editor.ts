import { cellsToNodes, isWarpStep, nodeCell, nodesAt, nodesToCells, sameCell, type BoardGraph } from './graph';
import { draftGraph, isPlain, linesAt, lockProblem, pieceDirs, pieceStart, same, solvedDirs, type CustomDraft } from './custom';
import type { GameEvent } from './engine';
import type { Cell, Warp } from './types';

export type ObstacleKind = 'wall' | 'bridge' | 'tunnel' | 'rotator' | 'gate' | 'key' | 'door';

export const OBSTACLE_NAMES: Record<ObstacleKind, string> = {
  wall: 'a wall',
  bridge: 'a bridge',
  tunnel: 'a tunnel',
  rotator: 'a rotator',
  gate: 'a teleporter gate',
  key: 'a key',
  door: 'a door',
};

/** Distinct colors the board can draw for each; more pairs would be ambiguous. */
export const MAX_TELEPORTERS = 4;
export const MAX_LOCKS = 3;

export type EditResult = { ok: true; draft: CustomDraft } | { ok: false; reason: string; cells?: Cell[] };

const reject = (reason: string, cells?: Cell[]): EditResult => ({ ok: false, reason, cells });
const has = (list: Cell[], c: Cell) => list.some((x) => same(x, c));
const without = (list: Cell[], c: Cell) => list.filter((x) => !same(x, c));

export function obstacleAt(d: CustomDraft, c: Cell): ObstacleKind | null {
  if (has(d.walls, c)) return 'wall';
  if (has(d.bridges, c)) return 'bridge';
  if (has(d.tunnels, c)) return 'tunnel';
  if (has(d.rotators, c)) return 'rotator';
  if (d.teleporters.some((t) => same(t.a, c) || same(t.b, c))) return 'gate';
  if (d.locks.some((l) => same(l.key, c))) return 'key';
  if (d.locks.some((l) => same(l.door, c))) return 'door';
  return null;
}

/** True when `c` is the first or last square of some line (where a dot will be). */
export function isLineEnd(d: CustomDraft, c: Cell): boolean {
  return d.lines.some((l) => l.length > 0 && (same(l[0], c) || same(l[l.length - 1], c)));
}

const onEdge = (d: CustomDraft, [r, c]: Cell) => r === 0 || c === 0 || r === d.size.height - 1 || c === d.size.width - 1;

/** Lines that still resolve on the board's graph after an obstacle change; the first that doesn't, if any. */
function brokenLine(d: CustomDraft): number {
  const g = draftGraph(d);
  for (let i = 0; i < d.lines.length; i++) {
    const l = d.lines[i];
    if (l.length === 0) continue;
    const n = cellsToNodes(g, l);
    if (!n) return i;
    for (let j = 0; j < n.length; j++) {
      const p = g.partner[n[j]];
      if (p !== -1 && n[j - 1] !== p && n[j + 1] !== p) return i;
    }
  }
  return -1;
}

function occupiedReason(d: CustomDraft, c: Cell): string | null {
  const o = obstacleAt(d, c);
  return o ? `This square already has ${OBSTACLE_NAMES[o]}. Erase it first.` : null;
}

/** Places a single-square obstacle, or removes it when the same kind is already there. */
export function toggleObstacle(d: CustomDraft, kind: 'wall' | 'bridge' | 'tunnel' | 'rotator', c: Cell): EditResult {
  const key = ({ wall: 'walls', bridge: 'bridges', tunnel: 'tunnels', rotator: 'rotators' } as const)[kind];
  if (has(d[key], c)) return { ok: true, draft: repairLines({ ...d, [key]: without(d[key], c) }) };
  const busy = occupiedReason(d, c);
  if (busy) return reject(busy, [c]);
  const through = linesAt(d, c);
  if (kind === 'wall') {
    if (through.length) return reject('A line runs through this square. Erase the line first.', [c]);
    return { ok: true, draft: { ...d, walls: [...d.walls, c] } };
  }
  if (kind === 'bridge' && onEdge(d, c)) return reject("Bridges can't go on the edge of the board.", [c]);
  if (isLineEnd(d, c)) return reject(`A line ends here. Dots can't sit on ${OBSTACLE_NAMES[kind]}.`, [c]);
  const next = { ...d, [key]: [...d[key], c] };
  if (brokenLine(next) >= 0) {
    const why = {
      bridge: 'The line turns here. Lines must cross a bridge in a straight line.',
      tunnel: 'The line turns here. A tunnel needs a straight line through it.',
      rotator: 'The line goes straight here. A rotator needs a line that turns.',
    }[kind];
    return reject(why, [c]);
  }
  return { ok: true, draft: next };
}

/**
 * Turns how the tunnel / rotator on `c` faces at the start one step clockwise
 * (like a tap in play), skipping the way its line solves it.
 */
export function rotatePiece(d: CustomDraft, c: Cell): EditResult {
  const dirs = pieceDirs(d, c);
  if (!dirs) return reject('Only tunnels and rotators can be turned.', [c]);
  const g = draftGraph(d);
  const solved = solvedDirs(g, d.lines.map((l) => (l.length ? (cellsToNodes(g, l) ?? []) : []))).get(c[0] * g.width + c[1]);
  if (dirs.filter((x) => x !== solved).length < 2) {
    return reject('Your line goes straight through this tunnel, so it always starts turned across it.', [c]);
  }
  let i = dirs.indexOf(pieceStart(d, c, solved)!);
  do i = (i + 1) % dirs.length;
  while (dirs[i] === solved);
  const starts = (d.starts ?? []).filter((s) => !same(s.cell, c));
  return { ok: true, draft: { ...d, starts: [...starts, { cell: c, dir: dirs[i] }] } };
}

/** Why `c` can't hold a teleporter gate, or null. */
export function gateProblem(d: CustomDraft, c: Cell): string | null {
  const busy = occupiedReason(d, c);
  if (busy) return busy;
  if (linesAt(d, c).length) return 'A line runs through this square. Gates need an empty square.';
  return null;
}

export function placeTeleporter(d: CustomDraft, a: Cell, b: Cell): EditResult {
  if (d.teleporters.length >= MAX_TELEPORTERS) return reject(`A level can have up to ${MAX_TELEPORTERS} teleporter pairs.`);
  for (const c of [a, b]) {
    const p = gateProblem(d, c);
    if (p) return reject(p, [c]);
  }
  if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) < 2) return reject("The two gates can't be next to each other.", [a, b]);
  return { ok: true, draft: { ...d, teleporters: [...d.teleporters, { a, b }] } };
}

/** Why `c` can't hold a key or door, or null. */
export function lockCellProblem(d: CustomDraft, c: Cell): string | null {
  const busy = occupiedReason(d, c);
  if (busy) return busy;
  if (isLineEnd(d, c)) return "A line ends here. Dots can't sit on a key or door.";
  return null;
}

export function placeLock(d: CustomDraft, key: Cell, door: Cell): EditResult {
  if (d.locks.length >= MAX_LOCKS) return reject(`A level can have up to ${MAX_LOCKS} locks.`);
  for (const c of [key, door]) {
    const p = lockCellProblem(d, c);
    if (p) return reject(p, [c]);
  }
  if (same(key, door)) return reject('The key and door need different squares.', [key]);
  const next = { ...d, locks: [...d.locks, { key, door }] };
  const g = draftGraph(next);
  const nodes = next.lines.map((l) => (l.length ? (cellsToNodes(g, l) ?? []) : []));
  const issue = lockProblem(g, next.locks, nodes);
  if (issue) return reject(issue.message === 'A key and its door are on the same line' ? "The key and its door can't be on the same line." : `${issue.message}.`, [key, door]);
  return { ok: true, draft: next };
}

export function toggleWarp(d: CustomDraft, w: Warp): EditResult {
  const max = w.axis === 'row' ? d.size.height : d.size.width;
  if (w.index < 0 || w.index >= max) return reject('That warp is outside the board.');
  const exists = d.warps.some((x) => x.axis === w.axis && x.index === w.index);
  if (exists) return { ok: true, draft: repairLines({ ...d, warps: d.warps.filter((x) => !(x.axis === w.axis && x.index === w.index)) }) };
  return { ok: true, draft: { ...d, warps: [...d.warps, w] } };
}

/** Removes the obstacle on `c` (both squares of a teleporter or lock), else the lines through it. */
export function eraseAt(d: CustomDraft, c: Cell): CustomDraft | null {
  const kind = obstacleAt(d, c);
  if (kind) {
    const next: CustomDraft = {
      ...d,
      walls: without(d.walls, c),
      bridges: without(d.bridges, c),
      tunnels: without(d.tunnels, c),
      rotators: without(d.rotators, c),
      teleporters: d.teleporters.filter((t) => !same(t.a, c) && !same(t.b, c)),
      locks: d.locks.filter((l) => !same(l.key, c) && !same(l.door, c)),
    };
    return repairLines(next);
  }
  const through = linesAt(d, c);
  if (!through.length) return null;
  return { ...d, lines: d.lines.map((l, i) => (through.includes(i) ? [] : l)) };
}

export function resizeDraft(d: CustomDraft, width: number, height: number): CustomDraft {
  const inside = ([r, c]: Cell) => r >= 0 && c >= 0 && r < height && c < width;
  const interior = ([r, c]: Cell) => r > 0 && c > 0 && r < height - 1 && c < width - 1;
  const next: CustomDraft = {
    ...d,
    size: { width, height },
    lines: d.lines.map((l) => {
      const out = l.findIndex((c) => !inside(c));
      return out < 0 ? l : l.slice(0, out);
    }),
    walls: d.walls.filter(inside),
    bridges: d.bridges.filter(interior),
    warps: d.warps.filter((w) => w.index < (w.axis === 'row' ? height : width)),
    teleporters: d.teleporters.filter((t) => inside(t.a) && inside(t.b)),
    tunnels: d.tunnels.filter(inside),
    rotators: d.rotators.filter(inside),
    locks: d.locks.filter((l) => inside(l.key) && inside(l.door)),
  };
  return repairLines(next);
}

export function setColorCount(d: CustomDraft, colors: number): CustomDraft {
  return { ...d, colors, lines: Array.from({ length: colors }, (_, i) => d.lines[i] ?? []) };
}

/** Drops trailing gates that were entered from the grid (a gate is always followed by its partner). */
function trimGate(g: BoardGraph, p: number[]): number[] {
  let out = p;
  while (out.length > 1) {
    const last = out[out.length - 1];
    const partner = g.partner[last];
    if (partner === -1 || out[out.length - 2] === partner) break;
    out = out.slice(0, -1);
  }
  if (out.length === 1 && g.partner[out[0]] !== -1) return [];
  return out;
}

/** Shortens a line from its tail until it ends on a plain square. */
function trimToPlain(g: BoardGraph, d: CustomDraft, p: number[]): number[] {
  let out = p;
  while (out.length > 0 && !isPlain(g, d, nodeCell(g, out[out.length - 1]))) out = trimGate(g, out.slice(0, -1));
  return out;
}

/** Both ends of a line on plain squares, or nothing when it gets too short. */
function settle(g: BoardGraph, d: CustomDraft, p: number[]): number[] {
  const tail = trimToPlain(g, d, p);
  const both = trimToPlain(g, d, [...tail].reverse()).reverse();
  return both.length >= 2 ? both : [];
}

/**
 * Keeps the draft legal after obstacles change: each line is cut where it
 * stops resolving, overlaps an earlier line, or skips a teleport, its ends are
 * pulled back onto plain squares, and orientations of removed pieces are dropped.
 */
export function repairLines(d: CustomDraft): CustomDraft {
  const g = draftGraph(d);
  const used = new Uint8Array(g.unitCount);
  const lines = d.lines.map((l) => {
    if (l.length === 0) return l;
    let lo = 0;
    let hi = l.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if (cellsToNodes(g, l.slice(0, mid))) lo = mid;
      else hi = mid - 1;
    }
    let nodes = cellsToNodes(g, l.slice(0, lo)) ?? [];
    for (let j = 0; j < nodes.length; j++) {
      const p = g.partner[nodes[j]];
      const jumped = p !== -1 && (nodes[j - 1] === p || nodes[j + 1] === p);
      if (used[g.nodeUnit[nodes[j]]] || (p !== -1 && !jumped && j < nodes.length - 1)) {
        nodes = nodes.slice(0, j);
        break;
      }
    }
    nodes = settle(g, d, trimGate(g, nodes));
    for (const n of nodes) used[g.nodeUnit[n]] = 1;
    return nodesToCells(g, nodes);
  });
  if (!d.starts) return { ...d, lines };
  return { ...d, lines, starts: d.starts.filter((s) => pieceDirs(d, s.cell)?.includes(s.dir)) };
}

export type BeginResult = { ok: true; drag: LineDrag } | { ok: false; reason: string };

/**
 * One finger drag drawing a line, with the same feel as playing: walk cell by
 * cell, back up over your own line to shorten it, and push through other lines
 * to cut them (they come back if you retract before letting go). Teleporters
 * jump, warps wrap, bridges cross, tunnels go straight and rotators turn.
 */
export class LineDrag {
  readonly g: BoardGraph;
  readonly color: number;
  private readonly base: CustomDraft;
  private readonly baseNodes: number[][];
  private path: number[];
  private viewNodes: number[][] = [];

  private constructor(g: BoardGraph, base: CustomDraft, baseNodes: number[][], color: number, path: number[]) {
    this.g = g;
    this.base = base;
    this.baseNodes = baseNodes;
    this.color = color;
    this.path = path;
    this.recompute();
  }

  /** Starts on a line (picking it up, shortened to this square) or on an empty plain square with `color`. */
  static begin(d: CustomDraft, color: number, cell: Cell, g: BoardGraph = draftGraph(d)): BeginResult {
    const nodes = nodesAt(g, cell);
    if (nodes.length === 0) return { ok: false, reason: "Lines can't go through walls." };
    const baseNodes = d.lines.map((l) => (l.length ? (cellsToNodes(g, l) ?? []) : []));
    const owners = baseNodes.flatMap((p, i) => (p.some((n) => sameCell(g, n, cell)) ? [i] : []));
    if (owners.length) {
      const pair = owners.includes(color) ? color : owners[0];
      const p = baseNodes[pair];
      let idx = -1;
      for (let i = p.length - 1; i >= 0; i--) if (sameCell(g, p[i], cell)) { idx = i; break; }
      let path: number[];
      if (idx === p.length - 1) path = p;
      else if (idx === 0) path = [...p].reverse();
      else {
        const partner = g.partner[p[idx]];
        const throughGate = partner !== -1 && p[idx - 1] !== partner && p[idx + 1] === partner;
        path = p.slice(0, idx + (throughGate ? 2 : 1));
      }
      return { ok: true, drag: new LineDrag(g, d, baseNodes, pair, path) };
    }
    if (!isPlain(g, d, cell)) return { ok: false, reason: 'Lines must start on an empty square.' };
    return { ok: true, drag: new LineDrag(g, d, baseNodes, color, [nodes[0]]) };
  }

  get dragging(): number {
    return this.color;
  }

  /** Node paths per color as currently shown. */
  view(): number[][] {
    return this.viewNodes;
  }

  isComplete(): boolean {
    return false;
  }

  /** Moves the head one step toward `cell`. With `extendOnly`, a step back onto the line is ignored. */
  dragTo(cell: Cell, extendOnly = false): GameEvent[] {
    const g = this.g;
    let path = this.path;
    let head = path[path.length - 1];
    if (sameCell(g, head, cell)) return [];
    let adjacent = g.adj[head].filter((n) => sameCell(g, n, cell));
    // A rotator head was entered on one of two corners; switch to the one that leaves toward `cell`.
    if (adjacent.length === 0 && g.isOption[head] && path.length > 1) {
      const prev = path[path.length - 2];
      const alt = g.cellNodes[g.nodeCellIdx[head]].find(
        (s) => s !== head && g.adj[prev].includes(s) && g.adj[s].some((n) => sameCell(g, n, cell)),
      );
      if (alt !== undefined) {
        path = [...path.slice(0, -1), alt];
        head = alt;
        adjacent = g.adj[head].filter((n) => sameCell(g, n, cell));
      }
    }
    const events: GameEvent[] = [];
    let n = adjacent.find((x) => path.includes(x)) ?? -1;
    if (n === -1) {
      const units = new Set(path.map((x) => g.nodeUnit[x]));
      const free = adjacent.filter((x) => !units.has(g.nodeUnit[x]));
      if (free.length) n = free[0];
      else {
        for (let i = path.length - 1; i >= 0; i--) if (sameCell(g, path[i], cell)) { n = path[i]; break; }
        if (n === -1) return adjacent.length ? [{ type: 'invalid', cell }] : [];
      }
    }
    const idx = path.indexOf(n);
    if (idx >= 0) {
      if (extendOnly) return [];
      const trimmed = trimGate(g, path.slice(0, idx + 1));
      this.path = trimmed.length ? trimmed : path.slice(0, 1);
      events.push({ type: 'retract', pair: this.color });
    } else {
      const next = [...path, n];
      events.push({ type: 'extend', pair: this.color, node: n, length: next.length });
      if (isWarpStep(g, head, n)) events.push({ type: 'warp', pair: this.color, from: head, to: n });
      const out = g.partner[n];
      if (out !== -1 && out !== head) {
        if (path.some((x) => g.nodeUnit[x] === g.nodeUnit[out])) return [{ type: 'invalid', cell }];
        next.push(out);
        events.push({ type: 'extend', pair: this.color, node: out, length: next.length });
        events.push({ type: 'teleport', pair: this.color, from: n, to: out });
      }
      this.path = next;
    }
    const before = this.viewNodes.map((p) => p.length);
    this.recompute();
    this.viewNodes.forEach((p, i) => {
      if (i !== this.color && p.length < before[i]) events.push({ type: 'cut', pair: i });
    });
    return events;
  }

  /** Other lines lose the part that clashes with the dragged line, keeping their longer side. */
  private recompute(): void {
    const g = this.g;
    const taken = new Set(this.path.map((n) => g.nodeUnit[n]));
    this.viewNodes = this.baseNodes.map((p, i) => {
      if (i === this.color) return this.path;
      const hits = p.flatMap((n, j) => (taken.has(g.nodeUnit[n]) ? [j] : []));
      if (!hits.length) return p;
      const head = trimGate(g, p.slice(0, hits[0]));
      const tail = trimGate(g, p.slice(hits[hits.length - 1] + 1).reverse()).reverse();
      const keep = head.length >= tail.length ? head : tail;
      return keep.length >= 2 ? keep : [];
    });
  }

  /** The draft as shown, for previews (the dragged line may still be a single square). */
  preview(): CustomDraft {
    return { ...this.base, lines: this.viewNodes.map((p) => nodesToCells(this.g, p)) };
  }

  /** Commits the drag; line ends are pulled back onto plain squares. */
  finish(): CustomDraft {
    const g = this.g;
    return { ...this.base, lines: this.viewNodes.map((p) => nodesToCells(g, settle(g, this.base, p))) };
  }
}
