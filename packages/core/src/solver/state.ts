import type { BoardGraph } from '../graph';

interface LogEntry {
  pair: number;
  side: number;
  node: number;
  join: boolean;
}

/** Owner value for the unused orientations of a resolved tunnel / rotator. */
export const DEAD = -2;

/**
 * Partial solution where every pair grows from both endpoints ("two heads").
 * A pair is finished when its two heads become adjacent and join.
 * Shared by the exact solver and the human-style solver.
 */
export class SolveState {
  readonly g: BoardGraph;
  readonly K: number;
  /** Pair owning each node, -1 when empty, DEAD for discarded orientations. */
  readonly owner: Int16Array;
  /** Pair whose *active* head sits on the node, -1 otherwise. */
  readonly headOf: Int16Array;
  /** heads[2p + side] */
  readonly heads: Int32Array;
  readonly done: Uint8Array;
  /** stacks[2p + side]: nodes grown from that endpoint, endpoint first. */
  readonly stacks: number[][];
  /** Uncovered fill units (an option cell is one unit). */
  emptyCount: number;
  doneCount = 0;
  private log: LogEntry[] = [];

  private compId: Int32Array;
  private queue: Int32Array;
  private readonly hasTeleports: boolean;

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
    this.emptyCount = g.unitCount - 2 * this.K;
    this.compId = new Int32Array(g.nodeCount);
    this.queue = new Int32Array(g.nodeCount);
    this.hasTeleports = g.partner.some((p) => p !== -1);
  }

  get depth(): number {
    return this.log.length;
  }

  /** A head standing on a gate it entered from the grid must jump to the partner gate. */
  private forcedNext(hi: number): number {
    const h = this.heads[hi];
    const p = this.g.partner[h];
    if (p === -1) return -1;
    const st = this.stacks[hi];
    return st.length > 1 && st[st.length - 2] === p ? -1 : p;
  }

  /** Whether head (pair, side) may step onto node n (n empty, or the other head = join). */
  canStep(pair: number, side: number, n: number): boolean {
    const hi = 2 * pair + side;
    const other = this.heads[2 * pair + 1 - side];
    if (!this.hasTeleports) return n === other || this.owner[n] === -1;
    const f = this.forcedNext(hi);
    if (f !== -1 && n !== f) return false;
    const h = this.heads[hi];
    if (n === other) {
      const fo = this.forcedNext(2 * pair + 1 - side);
      return fo === -1 || fo === h;
    }
    if (this.owner[n] !== -1) return false;
    const pn = this.g.partner[n];
    return pn === -1 || pn === h || pn === other || this.owner[pn] === -1;
  }

  /** Legal targets for head (pair, side): empty neighbors, or the other head (join). */
  legalMoves(pair: number, side: number, out: number[]): number[] {
    out.length = 0;
    const h = this.heads[2 * pair + side];
    for (const n of this.g.adj[h]) if (this.canStep(pair, side, n)) out.push(n);
    return out;
  }

  countMoves(pair: number, side: number): number {
    const h = this.heads[2 * pair + side];
    let k = 0;
    for (const n of this.g.adj[h]) if (this.canStep(pair, side, n)) k++;
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
    if (this.g.isOption[node]) {
      for (const s of this.g.cellNodes[this.g.nodeCellIdx[node]]) if (s !== node) this.owner[s] = DEAD;
    }
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
    if (this.g.isOption[e.node]) {
      for (const s of this.g.cellNodes[this.g.nodeCellIdx[e.node]]) this.owner[s] = -1;
    }
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

  private availCount(v: number): number {
    let avail = 0;
    for (const n of this.g.adj[v]) if (this.owner[n] === -1 || this.headOf[n] !== -1) avail++;
    return avail;
  }

  /** Orientations of an unresolved option cell that still have both sides available. */
  private viableOptions(ci: number, out: number[]): number[] {
    out.length = 0;
    const ns = this.g.cellNodes[ci];
    if (ns.some((n) => this.owner[n] !== -1)) return out;
    for (const n of ns) if (this.availCount(n) >= 2) out.push(n);
    return out;
  }

  private optBuf: number[] = [];

  /**
   * An empty node that must be covered: every non-option node, plus the only
   * viable orientation left in an option cell.
   */
  isMandatory(v: number): boolean {
    if (!this.g.isOption[v]) return true;
    const opts = this.viableOptions(this.g.nodeCellIdx[v], this.optBuf);
    return opts.length === 1 && opts[0] === v;
  }

  /** No path may need a door that only it can open (lock dependencies stay acyclic). */
  locksOk(): boolean {
    const L = this.g.locks;
    if (L.length === 0) return true;
    const edges: [number, number][] = [];
    for (const l of L) {
      const ko = this.owner[l.key];
      const dn = this.owner[l.door];
      if (ko < 0 || dn < 0) continue;
      if (ko === dn) return false;
      edges.push([dn, ko]);
    }
    if (edges.length < 2) return true;
    const reaches = (from: number, to: number, seen: Set<number>): boolean => {
      if (from === to) return true;
      if (seen.has(from)) return false;
      seen.add(from);
      return edges.some(([a, b]) => a === from && reaches(b, to, seen));
    };
    return !edges.some(([a, b]) => reaches(b, a, new Set()));
  }

  /** Local check: every empty node can still get 2 edges, every head can still move. */
  degreeOk(): boolean {
    const { g, owner, headOf } = this;
    for (let v = 0; v < g.nodeCount; v++) {
      if (owner[v] !== -1 || g.isOption[v]) continue;
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
    for (const ci of g.optionCells) {
      if (owner[g.cellNodes[ci][0]] !== -1) continue;
      if (this.viableOptions(ci, this.optBuf).length === 0) return false;
    }
    return this.locksOk();
  }

  /**
   * Full check: degree constraints plus region reasoning. Every empty region
   * holding a mandatory node must be fillable by some pair whose two heads both
   * touch it, and every unfinished pair must still be able to connect.
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
    if (g.optionCells.length === 0) {
      for (let c = 0; c < comps; c++) if (!ok[c]) return false;
      return true;
    }
    for (let v = 0; v < g.nodeCount; v++) {
      if (owner[v] === -1 && !g.isOption[v] && !ok[compId[v]]) return false;
    }
    for (const ci of g.optionCells) {
      const ns = g.cellNodes[ci];
      if (owner[ns[0]] !== -1) continue;
      if (!ns.some((n) => ok[compId[n]])) return false;
    }
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
