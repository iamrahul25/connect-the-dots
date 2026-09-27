import {
  buildGraph,
  cellsToNodes,
  endpointNodes,
  isWarpStep,
  nodesAt,
  sameCell,
  specOf,
  type BoardGraph,
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
  | { type: 'win' };

interface Snapshot {
  paths: number[][];
  moves: number;
  lastPair: number;
}

interface Drag {
  pair: number;
  base: number[][];
  path: number[];
  view: number[][];
}

/**
 * Game rules. Paths are stored per pair (dot index) as node lists starting at
 * one of the pair's endpoints. During a drag the view is recomputed from the
 * drag-start snapshot, so paths cut by the drag restore themselves if the
 * player retracts before releasing.
 */
export class Game {
  readonly g: BoardGraph;
  readonly puzzle: Puzzle;
  readonly endpoints: [number, number][];
  /** Pair index for endpoint nodes, -1 otherwise. */
  readonly endpointPair: Int16Array;
  private committed: number[][];
  private drag: Drag | null = null;
  private undoStack: Snapshot[] = [];
  moves = 0;
  private lastPair = -1;
  readonly hinted = new Set<number>();

  constructor(puzzle: Puzzle) {
    this.puzzle = puzzle;
    this.g = buildGraph(specOf(puzzle));
    this.endpoints = endpointNodes(this.g, puzzle);
    this.endpointPair = new Int16Array(this.g.nodeCount).fill(-1);
    this.endpoints.forEach(([a, b], p) => {
      this.endpointPair[a] = p;
      this.endpointPair[b] = p;
    });
    this.committed = puzzle.dots.map(() => []);
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

  /** Fraction of non-endpoint nodes covered by paths. */
  fillRatio(paths = this.view()): number {
    const covered = new Uint8Array(this.g.nodeCount);
    for (const p of paths) for (const n of p) covered[n] = 1;
    let c = 0;
    let total = 0;
    for (let v = 0; v < this.g.nodeCount; v++) {
      if (this.endpointPair[v] !== -1) continue;
      total++;
      if (covered[v]) c++;
    }
    return total ? c / total : 1;
  }

  isSolved(paths = this.committed): boolean {
    return this.connectedCount(paths) === this.pairCount && this.fillRatio(paths) === 1;
  }

  /** Owner pair of each node in the given paths (-1 = empty). */
  ownerMap(paths = this.view()): Int16Array {
    const owner = new Int16Array(this.g.nodeCount).fill(-1);
    paths.forEach((p, i) => p.forEach((n) => (owner[n] = i)));
    return owner;
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
      path = this.committed[pair].slice(0, bestIdx + 1);
    }
    this.drag = { pair, base: this.committed, path, view: [] };
    this.recomputeView();
    return [{ type: 'start', pair }];
  }

  private recomputeView(): void {
    const d = this.drag!;
    const inDrag = new Uint8Array(this.g.nodeCount);
    for (const n of d.path) inDrag[n] = 1;
    d.view = d.base.map((p, i) => {
      if (i === d.pair) return d.path;
      for (let j = 0; j < p.length; j++) if (inDrag[p[j]]) return p.slice(0, j);
      return p;
    });
  }

  /** Moves the drag head toward `cell`. The caller feeds cells one step at a time. */
  dragTo(cell: Cell): GameEvent[] {
    const d = this.drag;
    if (!d) return [];
    const path = d.path;
    const head = path[path.length - 1];
    if (sameCell(this.g, head, cell)) return [];

    const before = d.view.map((p) => p.length);
    const wasComplete = this.isComplete(d.pair);
    const events: GameEvent[] = [];
    const adjacent = this.g.adj[head].filter((n) => sameCell(this.g, n, cell));
    let n = adjacent.find((x) => path.includes(x)) ?? adjacent[0] ?? -1;

    if (n === -1) {
      let idx = -1;
      for (let i = path.length - 1; i >= 0; i--) if (sameCell(this.g, path[i], cell)) { idx = i; break; }
      if (idx < 0) return [];
      n = path[idx];
    }

    const idx = path.indexOf(n);
    if (idx >= 0) {
      d.path = path.slice(0, idx + 1);
      events.push({ type: 'retract', pair: d.pair });
      if (wasComplete) events.push({ type: 'disconnect', pair: d.pair });
    } else {
      if (wasComplete) return [];
      const ep = this.endpointPair[n];
      if (ep !== -1 && ep !== d.pair) return [{ type: 'invalid', cell }];
      d.path = [...path, n];
      events.push({ type: 'extend', pair: d.pair, node: n, length: d.path.length });
      if (isWarpStep(this.g, head, n)) events.push({ type: 'warp', pair: d.pair, from: head, to: n });
      if (ep === d.pair) events.push({ type: 'connect', pair: d.pair });
    }
    this.recomputeView();
    d.view.forEach((p, i) => {
      if (i !== d.pair && p.length < before[i]) {
        events.push({ type: 'cut', pair: i });
        if (this.isComplete(i, d.base) && !this.isComplete(i)) events.push({ type: 'disconnect', pair: i });
      }
    });
    return events;
  }

  endDrag(): GameEvent[] {
    const d = this.drag;
    if (!d) return [];
    this.drag = null;
    const next = d.view.map((p) => (p.length === 1 ? [] : p));
    const changed = next.some((p, i) => !samePath(p, this.committed[i]));
    if (!changed) return [];
    this.undoStack.push({ paths: this.committed, moves: this.moves, lastPair: this.lastPair });
    if (d.pair !== this.lastPair) this.moves++;
    this.lastPair = d.pair;
    this.committed = next;
    return this.isSolved() ? [{ type: 'win' }] : [];
  }

  cancelDrag(): void {
    this.drag = null;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  undo(): boolean {
    const s = this.undoStack.pop();
    if (!s) return false;
    this.drag = null;
    this.committed = s.paths;
    this.moves = s.moves;
    this.lastPair = s.lastPair;
    return true;
  }

  restart(): void {
    this.drag = null;
    this.undoStack = [];
    this.committed = this.puzzle.dots.map(() => []);
    this.moves = 0;
    this.lastPair = -1;
    this.hinted.clear();
  }

  /** Replaces a pair's path with the given solution cells, cutting conflicting paths. */
  applySolutionPath(pair: number, cells: Cell[], asHint = true): GameEvent[] {
    const nodes = cellsToNodes(this.g, cells);
    if (!nodes) return [];
    this.drag = null;
    const set = new Set(nodes);
    this.undoStack.push({ paths: this.committed, moves: this.moves, lastPair: this.lastPair });
    this.committed = this.committed.map((p, i) => {
      if (i === pair) return nodes;
      for (let j = 0; j < p.length; j++) if (set.has(p[j])) return j <= 1 ? [] : p.slice(0, j);
      return p;
    });
    if (asHint) this.hinted.add(pair);
    const events: GameEvent[] = [{ type: 'connect', pair }];
    if (this.isSolved()) events.push({ type: 'win' });
    return events;
  }

  /** First pair whose current path differs from the solution. */
  hintPair(solution: Record<string, Cell[]>): number {
    for (let p = 0; p < this.pairCount; p++) {
      const target = cellsToNodes(this.g, solution[String(p)]);
      if (!target) continue;
      const cur = this.committed[p];
      if (!samePath(cur, target) && !samePath([...cur].reverse(), target)) return p;
    }
    return -1;
  }

  /** Serializable state for resuming. */
  save(): { paths: number[][]; moves: number; hinted: number[] } {
    return { paths: this.committed, moves: this.moves, hinted: [...this.hinted] };
  }

  load(state: { paths: number[][]; moves: number; hinted: number[] }): void {
    if (state.paths.length !== this.pairCount) return;
    if (state.paths.some((p) => p.some((n) => n < 0 || n >= this.g.nodeCount))) return;
    this.committed = state.paths;
    this.moves = state.moves;
    state.hinted.forEach((h) => this.hinted.add(h));
  }
}

function samePath(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function createGame(level: Level | Puzzle): Game {
  return new Game(level);
}
