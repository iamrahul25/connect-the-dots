import type { BoardGraph } from '../graph';

interface LogEntry {
  pair: number;
  side: number;
  node: number;
  join: boolean;
}

/**
 * Partial solution where every pair grows from both endpoints ("two heads").
 * A pair is finished when its two heads become adjacent and join.
 * Shared by the exact solver and the human-style solver.
 */
export class SolveState {
  readonly g: BoardGraph;
  readonly K: number;
  /** Pair owning each node, -1 when empty. */
  readonly owner: Int16Array;
  /** Pair whose *active* head sits on the node, -1 otherwise. */
  readonly headOf: Int16Array;
  /** heads[2p + side] */
  readonly heads: Int32Array;
  readonly done: Uint8Array;
  /** stacks[2p + side]: nodes grown from that endpoint, endpoint first. */
  readonly stacks: number[][];
  emptyCount: number;
  doneCount = 0;
  private log: LogEntry[] = [];

  private compId: Int32Array;
  private queue: Int32Array;

  constructor(g: BoardGraph, endpoints: [number, number][]) {
    this.g = g;
    this.K = endpoints.length;
    this.owner = new Int16Array(g.nodeCount).fill(-1);
    this.headOf = new Int16Array(g.nodeCount).fill(-1);
    this.heads = new Int32Array(this.K * 2);
    this.done = new Uint8Array(this.K);
    this.stacks = [];
    endpoints.forEach(([a, b], p) => {
      this.owner[a] = p;
      this.owner[b] = p;
      this.headOf[a] = p;
      this.headOf[b] = p;
      this.heads[2 * p] = a;
      this.heads[2 * p + 1] = b;
      this.stacks.push([a], [b]);
    });
    this.emptyCount = g.nodeCount - 2 * this.K;
    this.compId = new Int32Array(g.nodeCount);
    this.queue = new Int32Array(g.nodeCount);
  }

  get depth(): number {
    return this.log.length;
  }

  /** Legal targets for head (pair, side): empty neighbors, or the other head (join). */
  legalMoves(pair: number, side: number, out: number[]): number[] {
    out.length = 0;
    const h = this.heads[2 * pair + side];
    const other = this.heads[2 * pair + 1 - side];
    for (const n of this.g.adj[h]) {
      if (n === other || this.owner[n] === -1) out.push(n);
    }
    return out;
  }

  countMoves(pair: number, side: number): number {
    const h = this.heads[2 * pair + side];
    const other = this.heads[2 * pair + 1 - side];
    let k = 0;
    for (const n of this.g.adj[h]) if (n === other || this.owner[n] === -1) k++;
    return k;
  }

  apply(pair: number, side: number, node: number): void {
    const hi = 2 * pair + side;
    const h = this.heads[hi];
    const other = this.heads[2 * pair + 1 - side];
    if (node === other) {
      this.done[pair] = 1;
      this.doneCount++;
      this.headOf[h] = -1;
      this.headOf[other] = -1;
      this.log.push({ pair, side, node, join: true });
      return;
    }
    this.owner[node] = pair;
    this.emptyCount--;
    this.headOf[h] = -1;
    this.headOf[node] = pair;
    this.heads[hi] = node;
    this.stacks[hi].push(node);
    this.log.push({ pair, side, node, join: false });
  }

  undo(): void {
    const e = this.log.pop();
    if (!e) return;
    const hi = 2 * e.pair + e.side;
    if (e.join) {
      this.done[e.pair] = 0;
      this.doneCount--;
      this.headOf[this.heads[hi]] = e.pair;
      this.headOf[this.heads[2 * e.pair + 1 - e.side]] = e.pair;
      return;
    }
    const stack = this.stacks[hi];
    stack.pop();
    const prev = stack[stack.length - 1];
    this.owner[e.node] = -1;
    this.emptyCount++;
    this.headOf[e.node] = -1;
    this.headOf[prev] = e.pair;
    this.heads[hi] = prev;
  }

  undoTo(depth: number): void {
    while (this.log.length > depth) this.undo();
  }

  sideOfHead(pair: number, node: number): number {
    return this.heads[2 * pair] === node ? 0 : 1;
  }

  /** Local check: every empty node can still get 2 edges, every head can still move. */
  degreeOk(): boolean {
    const { g, owner, headOf } = this;
    for (let v = 0; v < g.nodeCount; v++) {
      if (owner[v] !== -1) continue;
      let avail = 0;
      for (const n of g.adj[v]) {
        if (owner[n] === -1 || headOf[n] !== -1) {
          avail++;
          if (avail >= 2) break;
        }
      }
      if (avail < 2) return false;
    }
    for (let p = 0; p < this.K; p++) {
      if (this.done[p]) continue;
      if (this.countMoves(p, 0) === 0 || this.countMoves(p, 1) === 0) return false;
    }
    return true;
  }

  /**
   * Full check: degree constraints plus region reasoning. Every empty region
   * must be fillable by some pair whose two heads both touch it, and every
   * unfinished pair must still be able to connect.
   */
  consistent(): boolean {
    if (!this.degreeOk()) return false;
    const { g, owner, compId, queue } = this;
    compId.fill(-1);
    let comps = 0;
    for (let v = 0; v < g.nodeCount; v++) {
      if (owner[v] !== -1 || compId[v] !== -1) continue;
      let qh = 0;
      let qt = 0;
      queue[qt++] = v;
      compId[v] = comps;
      while (qh < qt) {
        const x = queue[qh++];
        for (const n of g.adj[x]) {
          if (owner[n] === -1 && compId[n] === -1) {
            compId[n] = comps;
            queue[qt++] = n;
          }
        }
      }
      comps++;
    }
    if (comps === 0) return true;
    const ok = new Uint8Array(comps);
    const touchA: number[] = [];
    for (let p = 0; p < this.K; p++) {
      if (this.done[p]) continue;
      const a = this.heads[2 * p];
      const b = this.heads[2 * p + 1];
      let proceed = g.adj[a].includes(b);
      touchA.length = 0;
      for (const n of g.adj[a]) if (owner[n] === -1) touchA.push(compId[n]);
      for (const n of g.adj[b]) {
        if (owner[n] !== -1) continue;
        const c = compId[n];
        if (touchA.includes(c)) {
          ok[c] = 1;
          proceed = true;
        }
      }
      if (!proceed) return false;
    }
    for (let c = 0; c < comps; c++) if (!ok[c]) return false;
    return true;
  }

  /** Full node paths per pair (start endpoint to end endpoint). Only valid when solved. */
  extractPaths(): number[][] {
    const out: number[][] = [];
    for (let p = 0; p < this.K; p++) {
      out.push([...this.stacks[2 * p], ...[...this.stacks[2 * p + 1]].reverse()]);
    }
    return out;
  }
}
