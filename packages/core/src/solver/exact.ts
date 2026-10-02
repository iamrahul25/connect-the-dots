import type { BoardGraph } from '../graph';
import { SolveState } from './state';

export interface ExactOptions {
  /** Stop after this many solutions (2 = uniqueness check). */
  maxSolutions?: number;
  /** Search node budget; exceeding it sets `aborted`. */
  maxNodes?: number;
}

export interface ExactResult {
  solutions: number[][][];
  nodes: number;
  aborted: boolean;
}

/**
 * Exact backtracking solver over the two-headed path model. Always extends
 * the most constrained head, so every solution is reached exactly once and
 * solution counting is correct.
 */
export function solveExact(
  g: BoardGraph,
  endpoints: [number, number][],
  opts: ExactOptions = {},
): ExactResult {
  const maxSolutions = opts.maxSolutions ?? 2;
  const maxNodes = opts.maxNodes ?? 2_000_000;
  const s = new SolveState(g, endpoints);
  const solutions: number[][][] = [];
  let nodes = 0;
  let aborted = false;
  const K = s.K;
  const moveBufs: number[][] = [];

  const emptyNeighbors = (v: number) => {
    let k = 0;
    for (const n of g.adj[v]) if (s.owner[n] === -1) k++;
    return k;
  };

  const dfs = (depth: number): void => {
    if (aborted || solutions.length >= maxSolutions) return;
    if (++nodes > maxNodes) {
      aborted = true;
      return;
    }
    if (!s.consistent()) return;
    if (s.doneCount === K) {
      if (s.emptyCount === 0) solutions.push(s.extractPaths());
      return;
    }
    // An empty cell with exactly two possible neighbors must use both, so a
    // neighboring head is forced into it.
    for (let v = 0; v < g.nodeCount; v++) {
      if (s.owner[v] !== -1 || !s.isMandatory(v)) continue;
      let avail = 0;
      let headNb = -1;
      for (const n of g.adj[v]) {
        if (s.owner[n] === -1) avail++;
        else if (s.headOf[n] !== -1) {
          avail++;
          headNb = n;
        }
      }
      if (avail === 2 && headNb !== -1) {
        const pair = s.headOf[headNb];
        const side = s.sideOfHead(pair, headNb);
        // v must take the edge to this head, so an illegal step is a contradiction.
        if (!s.canStep(pair, side, v)) return;
        s.apply(pair, side, v);
        dfs(depth + 1);
        s.undo();
        return;
      }
    }

    let bestPair = -1;
    let bestSide = 0;
    let best = 99;
    for (let p = 0; p < K && best > 1; p++) {
      if (s.done[p]) continue;
      for (let side = 0; side < 2; side++) {
        const m = s.countMoves(p, side);
        if (m < best) {
          best = m;
          bestPair = p;
          bestSide = side;
          if (m <= 1) break;
        }
      }
    }
    if (bestPair < 0 || best === 0) return;
    const buf = (moveBufs[depth] ??= []);
    s.legalMoves(bestPair, bestSide, buf);
    const other = s.heads[2 * bestPair + 1 - bestSide];
    const moves = buf
      .map((n) => ({ n, w: n === other ? -1 : emptyNeighbors(n) }))
      .sort((a, b) => a.w - b.w);
    for (const { n } of moves) {
      s.apply(bestPair, bestSide, n);
      dfs(depth + 1);
      s.undo();
      if (aborted || solutions.length >= maxSolutions) return;
    }
  };

  dfs(0);
  return { solutions, nodes, aborted };
}
