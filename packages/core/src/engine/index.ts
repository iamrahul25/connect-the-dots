import {
  ROTATOR_LAYERS,
  TUNNEL_LAYERS,
  buildGraph,
  cellsToNodes,
  endpointNodes,
  isWarpStep,
  nodesAt,
  sameCell,
  specOf,
  type BoardGraph,
  type Layer,
} from '../graph';
import type { Cell, Level, Puzzle } from '../types';

export type GameEvent =
  | { type: 'start'; pair: number }
  | { type: 'extend'; pair: number; node: number; length: number }
  | { type: 'retract'; pair: number }
  | { type: 'connect'; pair: number }
  | { type: 'disconnect'; pair: number }
  | { type: 'cut'; pair: number }
  | { type: 'invalid'; cell: Cell }
  | { type: 'warp'; pair: number; from: number; to: number }
  | { type: 'teleport'; pair: number; from: number; to: number }
  | { type: 'rotate'; cell: Cell; dir: Layer }
  | { type: 'door'; lock: number; open: boolean }
  | { type: 'win' };

interface Snapshot {
  paths: number[][];
  orient: Layer[];
  moves: number;
  lastPair: number;
}

interface Drag {
  pair: number;
  base: number[][];
  path: number[];
  view: number[][];
}

export interface SavedGame {
  paths: number[][];
  moves: number;
  hinted: number[];
  /** Orientation per tunnel / rotator, in graph `optionCells` order. */
  orient?: Layer[];
}

/**
 * Game rules. Paths are stored per pair (dot index) as node lists starting at
 * one of the pair's endpoints. During a drag the view is recomputed from the
 * drag-start snapshot, so paths cut by the drag restore themselves if the
 * player retracts before releasing.
 *
 * Tunnels and rotators only accept the orientation they are currently turned
 * to. Entering a teleporter gate always continues out of its partner gate. A
 * door is open while a completed path that needs no closed door runs through
 * its key; when a door closes, paths through it are cut at the door.
 */
export class Game {
  readonly g: BoardGraph;
  readonly puzzle: Puzzle;
  readonly endpoints: [number, number][];
  /** Pair index for endpoint nodes, -1 otherwise. */
  readonly endpointPair: Int16Array;
  /** Lock index for door nodes, -1 otherwise. */
  private readonly doorLock: Int16Array;
  private readonly isEndpointUnit: Uint8Array;
  private readonly optionIndex = new Map<number, number>();
  private readonly startOrient: Layer[];
  private orient: Layer[];
  private committed: number[][];
  private openDoors: boolean[];
  private drag: Drag | null = null;
  /** State before the last drag; only that one drag can be undone. */
  private lastDrag: Snapshot | null = null;
  moves = 0;
  private lastPair = -1;
  readonly hinted = new Set<number>();

  constructor(puzzle: Puzzle) {
    this.puzzle = puzzle;
    this.g = buildGraph(specOf(puzzle));
    this.endpoints = endpointNodes(this.g, puzzle);
    this.endpointPair = new Int16Array(this.g.nodeCount).fill(-1);
    this.isEndpointUnit = new Uint8Array(this.g.unitCount);
    this.endpoints.forEach(([a, b], p) => {
      this.endpointPair[a] = p;
      this.endpointPair[b] = p;
      this.isEndpointUnit[this.g.nodeUnit[a]] = 1;
      this.isEndpointUnit[this.g.nodeUnit[b]] = 1;
    });
    this.doorLock = new Int16Array(this.g.nodeCount).fill(-1);
    this.g.locks.forEach((l, i) => (this.doorLock[l.door] = i));
    const starts = new Map<number, Layer>();
    for (const t of [...(puzzle.tunnels ?? []), ...(puzzle.rotators ?? [])]) {
      starts.set(t.cell[0] * this.g.width + t.cell[1], t.start);
    }
    this.startOrient = this.g.optionCells.map((ci, i) => {
      this.optionIndex.set(ci, i);
      return starts.get(ci) ?? this.g.nodeLayer[this.g.cellNodes[ci][0]];
    });
    this.orient = [...this.startOrient];
    this.committed = puzzle.dots.map(() => []);
    this.openDoors = this.g.locks.map(() => false);
  }

  get pairCount(): number {
    return this.endpoints.length;
  }

  get dragging(): number {
    return this.drag ? this.drag.pair : -1;
  }

  /** Current paths as displayed (drag applied). */
  view(): number[][] {
    return this.drag ? this.drag.view : this.committed;
  }

  /** Remainders of paths cut by the active drag (rendered as ghosts). */
  ghosts(): number[][] {
    if (!this.drag) return this.committed.map(() => []);
    const { base, view } = this.drag;
    return base.map((p, i) => (i === this.drag!.pair ? [] : p.slice(view[i].length)));
  }

  /** Current orientation of the tunnel / rotator at `cell`, or null. */
  orientationAt(cell: Cell): Layer | null {
    const i = this.optionIndex.get(cell[0] * this.g.width + cell[1]);
    return i === undefined ? null : this.orient[i];
  }

  /** Open state per lock for the displayed paths. */
  doors(): boolean[] {
    return this.drag ? this.doorState(this.drag.view) : this.openDoors;
  }

  /** Whether node n can be entered with the current orientations. */
  isActive(n: number): boolean {
    if (!this.g.isOption[n]) return true;
    return this.orient[this.optionIndex.get(this.g.nodeCellIdx[n])!] === this.g.nodeLayer[n];
  }

  isComplete(pair: number, paths = this.view()): boolean {
    const p = paths[pair];
    if (p.length < 2) return false;
    const [a, b] = this.endpoints[pair];
    const s = p[0];
    const e = p[p.length - 1];
    return (s === a && e === b) || (s === b && e === a);
  }

  connectedCount(paths = this.view()): number {
    let n = 0;
    for (let p = 0; p < this.pairCount; p++) if (this.isComplete(p, paths)) n++;
    return n;
  }

  /** Fraction of non-endpoint fill units covered by paths (a tunnel / rotator is one unit). */
  fillRatio(paths = this.view()): number {
    const covered = new Uint8Array(this.g.unitCount);
    for (const p of paths) for (const n of p) covered[this.g.nodeUnit[n]] = 1;
    let c = 0;
    let total = 0;
    for (let u = 0; u < this.g.unitCount; u++) {
      if (this.isEndpointUnit[u]) continue;
      total++;
      if (covered[u]) c++;
    }
    return total ? c / total : 1;
  }

  isSolved(paths = this.committed): boolean {
    return (
      this.connectedCount(paths) === this.pairCount &&
      this.fillRatio(paths) === 1 &&
      this.doorState(paths).every(Boolean)
    );
  }

  /** Owner pair of each node in the given paths (-1 = empty). */
  ownerMap(paths = this.view()): Int16Array {
    const owner = new Int16Array(this.g.nodeCount).fill(-1);
    paths.forEach((p, i) => p.forEach((n) => (owner[n] = i)));
    return owner;
  }

  /**
   * Doors open in dependency order: a door opens when a completed path runs
   * through its key and that path passes no door that is still closed.
   */
  doorState(paths: number[][]): boolean[] {
    const locks = this.g.locks;
    const open = locks.map(() => false);
    if (locks.length === 0) return open;
    const owner = this.ownerMap(paths);
    for (let changed = true; changed; ) {
      changed = false;
      locks.forEach((l, k) => {
        if (open[k]) return;
        const p = owner[l.key];
        if (p < 0 || !this.isComplete(p, paths)) return;
        if (paths[p].some((n) => this.doorLock[n] !== -1 && !open[this.doorLock[n]])) return;
        open[k] = true;
        changed = true;
      });
    }
    return open;
  }

  /** Drops a trailing gate that was entered from the grid (it must always be followed by its partner). */
  private trimGate(p: number[]): number[] {
    let out = p;
    while (out.length > 1) {
      const last = out[out.length - 1];
      const partner = this.g.partner[last];
      if (partner === -1 || out[out.length - 2] === partner) break;
      out = out.slice(0, -1);
    }
    return out;
  }

  /** Cuts every path (except `keep`) at the first closed door it passes, until stable. */
  private enforceLocks(paths: number[][], keep = -1): { paths: number[][]; open: boolean[] } {
    let ps = paths;
    for (;;) {
      const open = this.doorState(ps);
      let changed = false;
      ps = ps.map((p, i) => {
        if (i === keep) return p;
        const j = p.findIndex((n) => this.doorLock[n] !== -1 && !open[this.doorLock[n]]);
        if (j < 0) return p;
        changed = true;
        return this.trimGate(p.slice(0, j));
      });
      if (!changed) return { paths: ps, open };
    }
  }

  private doorEvents(before: boolean[], after: boolean[]): GameEvent[] {
    const out: GameEvent[] = [];
    after.forEach((o, lock) => o !== before[lock] && out.push({ type: 'door', lock, open: o }));
    return out;
  }

  private snapshot(): Snapshot {
    return { paths: this.committed, orient: [...this.orient], moves: this.moves, lastPair: this.lastPair };
  }

  /** Commits paths outside a drag: applies lock cuts and clears single-node stubs. */
  private commit(paths: number[][]): GameEvent[] {
    const before = this.openDoors;
    const locked = this.enforceLocks(paths);
    this.committed = locked.paths.map((p) => (p.length <= 1 ? [] : p));
    this.openDoors = this.doorState(this.committed);
    return this.doorEvents(before, this.openDoors);
  }

  beginDrag(cell: Cell): GameEvent[] {
    this.drag = null;
    const nodes = nodesAt(this.g, cell);
    if (nodes.length === 0) return [];
    let pair = -1;
    let path: number[] = [];
    const ep = this.endpointPair[nodes[0]];
    if (ep !== -1) {
      pair = ep;
      path = [nodes[0]];
    } else {
      let bestIdx = -1;
      for (let p = 0; p < this.pairCount; p++) {
        const cp = this.committed[p];
        for (const n of nodes) {
          const i = cp.indexOf(n);
          if (i < 0) continue;
          const isHead = i === cp.length - 1;
          if (pair === -1 || isHead) {
            pair = p;
            bestIdx = i;
          }
        }
      }
      if (pair === -1) return [];
      const cp = this.committed[pair];
      const partner = this.g.partner[cp[bestIdx]];
      const throughGate = partner !== -1 && cp[bestIdx - 1] !== partner && cp[bestIdx + 1] === partner;
      path = cp.slice(0, bestIdx + (throughGate ? 2 : 1));
    }
    this.drag = { pair, base: this.committed, path, view: [] };
    this.recomputeView();
    return [{ type: 'start', pair }];
  }

  private recomputeView(): void {
    const d = this.drag!;
    const inDrag = new Uint8Array(this.g.nodeCount);
    for (const n of d.path) inDrag[n] = 1;
    const view = d.base.map((p, i) => {
      if (i === d.pair) return d.path;
      for (let j = 0; j < p.length; j++) if (inDrag[p[j]]) return this.trimGate(p.slice(0, j));
      return p;
    });
    d.view = this.enforceLocks(view, d.pair).paths;
  }

  private closedDoorOn(path: number[], open: boolean[]): boolean {
    return path.some((n) => this.doorLock[n] !== -1 && !open[this.doorLock[n]]);
  }

  /**
   * Moves the drag head toward `cell`. The caller feeds cells one step at a time.
   * With `extendOnly`, a step that would retract onto the path is ignored.
   */
  dragTo(cell: Cell, extendOnly = false): GameEvent[] {
    const d = this.drag;
    if (!d) return [];
    const path = d.path;
    const head = path[path.length - 1];
    if (sameCell(this.g, head, cell)) return [];

    const before = d.view.map((p) => p.length);
    const doorsBefore = this.doorState(d.view);
    const wasComplete = this.isComplete(d.pair);
    const events: GameEvent[] = [];
    const adjacent = this.g.adj[head].filter((n) => sameCell(this.g, n, cell));
    const usable = adjacent.filter((n) => this.isActive(n));
    let n = usable.find((x) => path.includes(x)) ?? usable[0] ?? -1;

    if (n === -1) {
      let idx = -1;
      for (let i = path.length - 1; i >= 0; i--) if (sameCell(this.g, path[i], cell)) { idx = i; break; }
      if (idx < 0) return adjacent.length ? [{ type: 'invalid', cell }] : [];
      n = path[idx];
    }

    const idx = path.indexOf(n);
    if (idx >= 0 && extendOnly) return [];
    if (idx >= 0) {
      d.path = this.trimGate(path.slice(0, idx + 1));
      events.push({ type: 'retract', pair: d.pair });
      if (wasComplete) events.push({ type: 'disconnect', pair: d.pair });
    } else {
      if (wasComplete) return [];
      const ep = this.endpointPair[n];
      if (ep !== -1 && ep !== d.pair) return [{ type: 'invalid', cell }];
      if (this.closedDoorOn([n], doorsBefore)) return [{ type: 'invalid', cell }];
      const next = [...path, n];
      events.push({ type: 'extend', pair: d.pair, node: n, length: next.length });
      if (isWarpStep(this.g, head, n)) events.push({ type: 'warp', pair: d.pair, from: head, to: n });
      const out = this.g.partner[n];
      if (out !== -1 && out !== head) {
        if (path.includes(out)) return [{ type: 'invalid', cell }];
        next.push(out);
        events.push({ type: 'extend', pair: d.pair, node: out, length: next.length });
        events.push({ type: 'teleport', pair: d.pair, from: n, to: out });
      }
      if (ep === d.pair) events.push({ type: 'connect', pair: d.pair });
      d.path = next;
    }
    this.recomputeView();
    const doorsAfter = this.doorState(d.view);
    if (this.closedDoorOn(d.path, doorsAfter)) {
      // The step would close a door this path already goes through.
      d.path = path;
      this.recomputeView();
      return [{ type: 'invalid', cell }];
    }
    d.view.forEach((p, i) => {
      if (i !== d.pair && p.length < before[i]) {
        events.push({ type: 'cut', pair: i });
        if (this.isComplete(i, d.base) && !this.isComplete(i)) events.push({ type: 'disconnect', pair: i });
      }
    });
    events.push(...this.doorEvents(doorsBefore, doorsAfter));
    return events;
  }

  endDrag(): GameEvent[] {
    const d = this.drag;
    if (!d) return [];
    this.drag = null;
    const next = d.view.map((p) => (p.length === 1 ? [] : p));
    const changed = next.some((p, i) => !samePath(p, this.committed[i]));
    if (!changed) return [];
    this.lastDrag = this.snapshot();
    if (d.pair !== this.lastPair) this.moves++;
    this.lastPair = d.pair;
    this.committed = next;
    this.openDoors = this.doorState(next);
    return this.isSolved() ? [{ type: 'win' }] : [];
  }

  cancelDrag(): void {
    this.drag = null;
  }

  /**
   * Turns the tunnel / rotator at `cell` one step clockwise. A path running
   * through it is cut at the piece. Rotating is not a move for stars.
   */
  rotate(cell: Cell): GameEvent[] {
    if (this.drag) return [];
    const ci = cell[0] * this.g.width + cell[1];
    const oi = this.optionIndex.get(ci);
    if (oi === undefined) return [];
    const layers: readonly Layer[] = this.g.cellKind[ci] === 'tunnel' ? TUNNEL_LAYERS : ROTATOR_LAYERS;
    const dir = layers[(layers.indexOf(this.orient[oi]) + 1) % layers.length];
    this.lastDrag = null;
    const piece = new Set(this.g.cellNodes[ci]);
    const events: GameEvent[] = [{ type: 'rotate', cell, dir }];
    const paths = this.committed.map((p, i) => {
      const j = p.findIndex((n) => piece.has(n));
      if (j < 0) return p;
      events.push({ type: 'cut', pair: i });
      if (this.isComplete(i, this.committed)) events.push({ type: 'disconnect', pair: i });
      return this.trimGate(p.slice(0, j));
    });
    this.orient[oi] = dir;
    events.push(...this.commit(paths));
    return events;
  }

  canUndo(): boolean {
    return this.lastDrag !== null;
  }

  /**
   * Reverts the last drag, including its move count. Only one step: rotations
   * and hints can't be undone, and they also clear the pending undo.
   */
  undo(): boolean {
    const s = this.lastDrag;
    if (!s) return false;
    this.lastDrag = null;
    this.drag = null;
    this.committed = s.paths;
    this.orient = [...s.orient];
    this.openDoors = this.doorState(this.committed);
    this.moves = s.moves;
    this.lastPair = s.lastPair;
    return true;
  }

  restart(): void {
    this.drag = null;
    this.lastDrag = null;
    this.committed = this.puzzle.dots.map(() => []);
    this.orient = [...this.startOrient];
    this.openDoors = this.g.locks.map(() => false);
    this.moves = 0;
    this.lastPair = -1;
    this.hinted.clear();
  }

  /**
   * Replaces a pair's path with the given solution cells, turning tunnels and
   * rotators on it to match and cutting conflicting paths.
   */
  applySolutionPath(pair: number, cells: Cell[], asHint = true): GameEvent[] {
    const nodes = cellsToNodes(this.g, cells);
    if (!nodes) return [];
    this.drag = null;
    this.lastDrag = null;
    const taken = new Set(nodes);
    for (const n of nodes) {
      if (!this.g.isOption[n]) continue;
      this.orient[this.optionIndex.get(this.g.nodeCellIdx[n])!] = this.g.nodeLayer[n];
      for (const s of this.g.cellNodes[this.g.nodeCellIdx[n]]) taken.add(s);
    }
    const paths = this.committed.map((p, i) => {
      if (i === pair) return nodes;
      for (let j = 0; j < p.length; j++) if (taken.has(p[j])) return this.trimGate(p.slice(0, j));
      return p;
    });
    const events: GameEvent[] = [{ type: 'connect', pair }, ...this.commit(paths)];
    if (asHint) this.hinted.add(pair);
    if (this.isSolved()) events.push({ type: 'win' });
    return events;
  }

  /** First pair (keys before the doors that need them) whose current path differs from the solution. */
  hintPair(solution: Record<string, Cell[]>): number {
    const targets = Array.from({ length: this.pairCount }, (_, p) => cellsToNodes(this.g, solution[String(p)] ?? []));
    for (const p of hintOrder(this.g, targets)) {
      const target = targets[p];
      if (!target) continue;
      const cur = this.committed[p];
      if (!samePath(cur, target) && !samePath([...cur].reverse(), target)) return p;
    }
    return -1;
  }

  /** Serializable state for resuming. */
  save(): SavedGame {
    return { paths: this.committed, moves: this.moves, hinted: [...this.hinted], orient: [...this.orient] };
  }

  load(state: SavedGame): void {
    if (state.paths.length !== this.pairCount) return;
    if (state.paths.some((p) => p.some((n) => n < 0 || n >= this.g.nodeCount))) return;
    if (state.orient) {
      if (state.orient.length !== this.orient.length) return;
      this.orient = [...state.orient];
    }
    this.committed = state.paths;
    this.openDoors = this.doorState(this.committed);
    this.moves = state.moves;
    state.hinted.forEach((h) => this.hinted.add(h));
  }
}

/** Pair order where every key path comes before the door paths that depend on it. */
function hintOrder(g: BoardGraph, targets: (number[] | null)[]): number[] {
  const owner = new Int16Array(g.nodeCount).fill(-1);
  targets.forEach((p, i) => p?.forEach((n) => (owner[n] = i)));
  const after = targets.map(() => [] as number[]);
  for (const l of g.locks) {
    const k = owner[l.key];
    const d = owner[l.door];
    if (k >= 0 && d >= 0 && k !== d) after[d].push(k);
  }
  const out: number[] = [];
  const seen = new Uint8Array(targets.length);
  const visit = (p: number) => {
    if (seen[p]) return;
    seen[p] = 1;
    after[p].forEach(visit);
    out.push(p);
  };
  targets.forEach((_, p) => visit(p));
  return out;
}

function samePath(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function createGame(level: Level | Puzzle): Game {
  return new Game(level);
}
