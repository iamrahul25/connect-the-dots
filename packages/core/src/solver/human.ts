import type { BoardGraph } from '../graph';
import { SolveState } from './state';

/**
 * Human-style solver used for difficulty rating. Techniques by tier:
 *  1 Forced   - a head with one legal move, or an empty cell with exactly two
 *               possible neighbors where one of them is a head.
 *  2 Local    - a move is ruled out because it creates a dead end.
 *  3 Regional - a move is ruled out because it strands a region or cuts a pair off.
 *  4 Lookahead- a move is ruled out after trying it and propagating forced moves.
 *  5 Search   - none of the above make progress (guessing required).
 */
export interface HumanResult {
  /**
   * True when solved by deductions alone. Every deduction is forced, so a
   * solved result also proves the solution is unique.
   */
  solved: boolean;
  maxTier: number;
  /** Uses of tiers 1..4. */
  tierCounts: [number, number, number, number];
  steps: number;
  /** Node paths per pair when solved. */
  paths: number[][] | null;
}

interface Move {
  pair: number;
  side: number;
  node: number;
}

export function tier1(s: SolveState): Move | null {
  const { g, K } = s;
  const buf: number[] = [];
  for (let p = 0; p < K; p++) {
    if (s.done[p]) continue;
    for (let side = 0; side < 2; side++) {
      s.legalMoves(p, side, buf);
      if (buf.length === 1) return { pair: p, side, node: buf[0] };
    }
  }
  for (let v = 0; v < g.nodeCount; v++) {
    if (s.owner[v] !== -1) continue;
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
      return { pair, side: s.sideOfHead(pair, headNb), node: v };
    }
  }
  return null;
}

/** Applies tier-1 moves to a fixpoint; returns false on contradiction. State is restored. */
function propagateForced(s: SolveState): boolean {
  const mark = s.depth;
  let ok = true;
  for (let guard = 0; guard < s.g.nodeCount * 2; guard++) {
    if (!s.consistent()) {
      ok = false;
      break;
    }
    if (s.doneCount === s.K) break;
    const m = tier1(s);
    if (!m) break;
    s.apply(m.pair, m.side, m.node);
  }
  s.undoTo(mark);
  return ok;
}

function testTier(s: SolveState, tier: number): boolean {
  if (tier === 2) return s.degreeOk();
  if (tier === 3) return s.consistent();
  return propagateForced(s);
}

/** Finds a head whose legal moves reduce to exactly one under the given tier's test. */
function eliminate(s: SolveState, tier: number): Move | 'contradiction' | null {
  const buf: number[] = [];
  for (let p = 0; p < s.K; p++) {
    if (s.done[p]) continue;
    for (let side = 0; side < 2; side++) {
      s.legalMoves(p, side, buf);
      if (buf.length < 2) continue;
      const moves = [...buf];
      let valid = 0;
      let last = -1;
      for (const n of moves) {
        s.apply(p, side, n);
        const ok = testTier(s, tier);
        s.undo();
        if (ok) {
          valid++;
          last = n;
          if (valid > 1) break;
        }
      }
      if (valid === 0) return 'contradiction';
      if (valid === 1) return { pair: p, side, node: last };
    }
  }
  return null;
}

export function solveHuman(
  g: BoardGraph,
  endpoints: [number, number][],
  opts: { maxTier?: number } = {},
): HumanResult {
  const maxTier = opts.maxTier ?? 4;
  const s = new SolveState(g, endpoints);
  const counts: [number, number, number, number] = [0, 0, 0, 0];
  let steps = 0;
  let usedTier = 1;

  const fail = (): HumanResult => ({ solved: false, maxTier: 5, tierCounts: counts, steps, paths: null });

  while (s.doneCount < s.K) {
    if (!s.consistent()) return fail();
    let move: Move | null = tier1(s);
    let tier = 1;
    for (let t = 2; !move && t <= maxTier; t++) {
      const r = eliminate(s, t);
      if (r === 'contradiction') return fail();
      if (r) {
        move = r;
        tier = t;
      }
    }
    if (!move) return fail();
    counts[tier - 1]++;
    usedTier = Math.max(usedTier, tier);
    s.apply(move.pair, move.side, move.node);
    steps++;
  }
  if (s.emptyCount !== 0) return fail();
  return { solved: true, maxTier: usedTier, tierCounts: counts, steps, paths: s.extractPaths() };
}
