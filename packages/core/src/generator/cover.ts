import type { BoardGraph } from '../graph';
import type { Rng } from '../rng';

export interface CoverOptions {
  kMin: number;
  kMax: number;
  minLen: number;
  maxLen: number;
  /** Warp edges ([a, b] node pairs) that at least one path must traverse. */
  warpEdges: [number, number][];
  /** Teleporter edges: their two gates must be consecutive in one path. */
  teleportEdges?: [number, number][];
  maxIterations: number;
}

interface Eval {
  energy: number;
  pid: Int32Array;
  pos: Int32Array;
}

/**
 * Energy of a path cover; 0 means every hard constraint holds:
 * path count in range, lengths in range, no self-touching paths,
 * no endpoint on a bridge or gate, bridges crossed by two different paths,
 * every warp used, and every teleporter taken gate-to-gate.
 */
function evaluate(g: BoardGraph, paths: number[][], o: CoverOptions, pid: Int32Array, pos: Int32Array): number {
  for (let p = 0; p < paths.length; p++) {
    const P = paths[p];
    for (let i = 0; i < P.length; i++) {
      pid[P[i]] = p;
      pos[P[i]] = i;
    }
  }
  let e = 0;
  const k = paths.length;
  if (k > o.kMax) e += (k - o.kMax) * 5;
  if (k < o.kMin) e += (o.kMin - k) * 5;
  for (let p = 0; p < k; p++) {
    const P = paths[p];
    const L = P.length;
    if (L < o.minLen) e += (o.minLen - L) * 4;
    if (L > o.maxLen) e += (L - o.maxLen) * 2;
    if (g.nodeLayer[P[0]] !== 'n') e += 6;
    if (g.nodeLayer[P[L - 1]] !== 'n') e += 6;
    if (g.partner[P[0]] !== -1) e += 6;
    if (g.partner[P[L - 1]] !== -1) e += 6;
    for (let i = 0; i < L; i++) {
      const u = P[i];
      for (const v of g.adj[u]) {
        if (pid[v] === p && Math.abs(pos[v] - i) > 1) e += 1.5;
      }
    }
  }
  for (let i = 0; i < g.cellNodes.length; i++) {
    const ns = g.cellNodes[i];
    if (ns.length === 2 && pid[ns[0]] === pid[ns[1]]) e += 2;
  }
  for (const [a, b] of o.warpEdges) {
    if (!(pid[a] === pid[b] && Math.abs(pos[a] - pos[b]) === 1)) e += 4;
  }
  for (const [a, b] of o.teleportEdges ?? []) {
    if (!(pid[a] === pid[b] && Math.abs(pos[a] - pos[b]) === 1)) e += 4;
  }
  return e;
}

function propose(g: BoardGraph, rng: Rng, paths: number[][], cur: Eval, o: CoverOptions): number[][] | null {
  const k = paths.length;
  const splitChance = k < o.kMin ? 0.25 : 0.04;
  if (rng.next() < splitChance) {
    const p = rng.int(k);
    const P = paths[p];
    if (P.length < 2) return null;
    const cut = 1 + rng.int(P.length - 1);
    const next = paths.slice();
    next[p] = P.slice(0, cut);
    next.push(P.slice(cut));
    return next;
  }

  const p = rng.int(k);
  const P = paths[p];
  const atEnd = rng.next() < 0.5;
  const Pe = atEnd ? P : [...P].reverse();
  const e = Pe[Pe.length - 1];
  const nbrs = g.adj[e];
  if (nbrs.length === 0) return null;
  const n = nbrs[rng.int(nbrs.length)];
  const q = cur.pid[n];

  if (q === p) {
    // Backbite: re-route the path through a self-adjacency; endpoint moves.
    const i = Pe.indexOf(n);
    if (i < 0 || i >= Pe.length - 2) return null;
    const np = Pe.slice(0, i + 1).concat(Pe.slice(i + 1).reverse());
    const next = paths.slice();
    next[p] = np;
    return next;
  }

  // Steal: split the neighbor path at n and attach one side to our endpoint.
  const Q = paths[q];
  const i = cur.pos[n];
  let np: number[];
  let rest: number[];
  if (rng.next() < 0.5) {
    np = Pe.concat(Q.slice(0, i + 1).reverse());
    rest = Q.slice(i + 1);
  } else {
    np = Pe.concat(Q.slice(i));
    rest = Q.slice(0, i);
  }
  const next: number[][] = [];
  for (let j = 0; j < k; j++) {
    if (j === p) next.push(np);
    else if (j === q) {
      if (rest.length) next.push(rest);
    } else next.push(paths[j]);
  }
  return next;
}

/**
 * Random partition of every graph node into simple paths ("fill the box"),
 * found by simulated annealing over merge / steal / backbite / split moves.
 */
export function randomCover(g: BoardGraph, rng: Rng, o: CoverOptions): number[][] | null {
  const N = g.nodeCount;
  let paths: number[][] = [];
  for (let v = 0; v < N; v++) paths.push([v]);

  let cur: Eval = { energy: 0, pid: new Int32Array(N), pos: new Int32Array(N) };
  cur.energy = evaluate(g, paths, o, cur.pid, cur.pos);
  let scratch: Eval = { energy: 0, pid: new Int32Array(N), pos: new Int32Array(N) };

  let T = 1.5;
  const decay = Math.pow(0.05 / 1.5, 1 / o.maxIterations);
  let shuffleLeft = -1;

  for (let it = 0; it < o.maxIterations; it++) {
    if (cur.energy === 0) {
      if (shuffleLeft < 0) shuffleLeft = N * 3;
      if (shuffleLeft-- === 0) return paths;
    }
    const next = propose(g, rng, paths, cur, o);
    if (!next) continue;
    const ne = evaluate(g, next, o, scratch.pid, scratch.pos);
    const accept =
      shuffleLeft >= 0 ? ne === 0 : ne <= cur.energy || rng.next() < Math.exp((cur.energy - ne) / T);
    if (accept) {
      paths = next;
      scratch.energy = ne;
      const t = cur;
      cur = scratch;
      scratch = t;
    }
    T *= decay;
  }
  return cur.energy === 0 ? paths : null;
}
