import { describe, expect, it } from 'vitest';
import {
  buildGraph,
  canonicalKey,
  createRng,
  endpointNodes,
  Game,
  generateAttempt,
  generateLevel,
  hashSeed,
  isValidSolution,
  nodesAt,
  solveExact,
  solveHuman,
  specOf,
  toLevel,
  validateLevel,
  type Puzzle,
} from '../src';

const plain = (w: number, h: number) => ({ width: w, height: h, walls: [], bridges: [], warps: [] });

/**
 *  A . B
 *  . . .
 *  A . B     -> used for drawing mechanics (not solvable).
 */
const tiny: Puzzle = {
  size: { width: 3, height: 3 },
  dots: [
    { color: 0, start: [0, 0], end: [2, 0] },
    { color: 1, start: [0, 2], end: [2, 2] },
  ],
  walls: [],
  bridges: [],
  warps: [],
};

/**
 *  A . A
 *  B . .
 *  . . B     -> two solutions (A may detour through the middle).
 */
const strip: Puzzle = {
  size: { width: 3, height: 3 },
  dots: [
    { color: 0, start: [0, 0], end: [0, 2] },
    { color: 1, start: [1, 0], end: [2, 2] },
  ],
  walls: [],
  bridges: [],
  warps: [],
};

/** Three straight columns: the only full cover. */
const columns: Puzzle = {
  size: { width: 3, height: 3 },
  dots: [
    { color: 0, start: [0, 0], end: [2, 0] },
    { color: 1, start: [0, 1], end: [2, 1] },
    { color: 2, start: [0, 2], end: [2, 2] },
  ],
  walls: [],
  bridges: [],
  warps: [],
};

describe('rng', () => {
  it('is deterministic', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
    expect(hashSeed('a', 1)).toBe(hashSeed('a', 1));
    expect(hashSeed('a', 1)).not.toBe(hashSeed('a', 2));
  });
});

describe('graph', () => {
  it('builds a plain grid', () => {
    const g = buildGraph(plain(3, 3));
    expect(g.nodeCount).toBe(9);
    expect(g.adj[4].length).toBe(4);
    expect(g.adj[0].length).toBe(2);
  });

  it('removes walls', () => {
    const g = buildGraph({ ...plain(3, 3), walls: [[1, 1]] });
    expect(g.nodeCount).toBe(8);
    expect(nodesAt(g, [1, 1])).toEqual([]);
  });

  it('splits bridges into straight-through layers', () => {
    const g = buildGraph({ ...plain(3, 3), bridges: [[1, 1]] });
    expect(g.nodeCount).toBe(10);
    const [h, v] = nodesAt(g, [1, 1]);
    const cellOf = (n: number) => `${g.nodeRow[n]},${g.nodeCol[n]}`;
    expect(g.adj[h].map(cellOf).sort()).toEqual(['1,0', '1,2']);
    expect(g.adj[v].map(cellOf).sort()).toEqual(['0,1', '2,1']);
  });

  it('adds warp edges', () => {
    const g = buildGraph({ ...plain(4, 4), warps: [{ axis: 'row', index: 1 }] });
    const a = nodesAt(g, [1, 0])[0];
    const b = nodesAt(g, [1, 3])[0];
    expect(g.adj[a]).toContain(b);
  });
});

describe('solver', () => {
  it('solves and proves uniqueness', () => {
    const g = buildGraph(specOf(columns));
    const eps = endpointNodes(g, columns);
    const exact = solveExact(g, eps, { maxSolutions: 2 });
    expect(exact.solutions.length).toBe(1);
    const human = solveHuman(g, eps);
    expect(human.solved).toBe(true);
    expect(isValidSolution(columns, human.paths!)).toBe(true);
    expect(human.paths).toEqual(exact.solutions[0]);

    const gs = buildGraph(specOf(strip));
    expect(solveExact(gs, endpointNodes(gs, strip), { maxSolutions: 2 }).solutions.length).toBe(2);
    expect(solveHuman(gs, endpointNodes(gs, strip)).solved).toBe(false);
  });

  it('reports unsolvable and multi-solution puzzles', () => {
    const g0 = buildGraph(specOf(tiny));
    expect(solveExact(g0, endpointNodes(g0, tiny)).solutions.length).toBe(0);
    expect(solveHuman(g0, endpointNodes(g0, tiny)).solved).toBe(false);

    const p: Puzzle = {
      size: { width: 3, height: 2 },
      dots: [{ color: 0, start: [0, 0], end: [1, 0] }],
      walls: [],
      bridges: [],
      warps: [],
    };
    const g = buildGraph(specOf(p));
    expect(solveExact(g, endpointNodes(g, p), { maxSolutions: 2 }).solutions.length).toBe(1);

    const q: Puzzle = { ...p, size: { width: 4, height: 4 }, dots: [{ color: 0, start: [0, 0], end: [0, 3] }] };
    const g2 = buildGraph(specOf(q));
    expect(solveExact(g2, endpointNodes(g2, q), { maxSolutions: 2 }).solutions.length).toBe(2);
    expect(solveHuman(g2, endpointNodes(g2, q)).solved).toBe(false);
  });
});

describe('engine', () => {
  it('draws, connects and wins', () => {
    const game = new Game(strip);
    expect(game.beginDrag([0, 0])[0]).toEqual({ type: 'start', pair: 0 });
    game.dragTo([0, 1]);
    const ev = game.dragTo([0, 2]);
    expect(ev.some((e) => e.type === 'connect')).toBe(true);
    expect(game.endDrag()).toEqual([]);
    expect(game.connectedCount()).toBe(1);

    game.beginDrag([1, 0]);
    for (const c of [[1, 1], [1, 2], [2, 2]] as [number, number][]) game.dragTo(c);
    expect(game.fillRatio()).toBeLessThan(1);
    game.endDrag();
    expect(game.connectedCount()).toBe(2);
    expect(game.isSolved()).toBe(false);

    // Redraw pair 1 through every remaining cell.
    game.beginDrag([1, 0]);
    expect(game.view()[1]).toEqual([nodesAt(game.g, [1, 0])[0]]);
    for (const c of [[2, 0], [2, 1], [1, 1], [1, 2], [2, 2]] as [number, number][]) game.dragTo(c);
    expect(game.endDrag()).toEqual([{ type: 'win' }]);
    expect(game.moves).toBe(2);
  });

  it('retracts when moving back', () => {
    const game = new Game(tiny);
    game.beginDrag([0, 0]);
    game.dragTo([0, 1]);
    game.dragTo([1, 1]);
    game.dragTo([0, 1]);
    expect(game.view()[0].length).toBe(2);
  });

  it('cuts other paths and restores them on retract', () => {
    const game = new Game(tiny);
    game.beginDrag([0, 2]);
    game.dragTo([0, 1]);
    game.dragTo([1, 1]);
    game.endDrag();
    expect(game.view()[1].length).toBe(3);

    game.beginDrag([0, 0]);
    const ev = game.dragTo([0, 1]);
    expect(ev.some((e) => e.type === 'cut' && e.pair === 1)).toBe(true);
    expect(game.view()[1].length).toBe(1);
    expect(game.ghosts()[1].length).toBe(2);
    game.dragTo([0, 0]);
    expect(game.view()[1].length).toBe(3);
    game.endDrag();
  });

  it('blocks other endpoints', () => {
    const game = new Game(tiny);
    game.beginDrag([0, 0]);
    game.dragTo([0, 1]);
    const ev = game.dragTo([0, 2]);
    expect(ev[0].type).toBe('invalid');
  });

  it('forces straight travel through bridges', () => {
    const p: Puzzle = { ...tiny, bridges: [[1, 1]], dots: [{ color: 0, start: [1, 0], end: [0, 0] }] };
    const game = new Game(p);
    game.beginDrag([1, 0]);
    game.dragTo([1, 1]);
    // Turning up from the horizontal layer is not adjacent -> ignored.
    expect(game.dragTo([0, 1])).toEqual([]);
    game.dragTo([1, 2]);
    expect(game.view()[0].length).toBe(3);
  });

  it('undoes moves', () => {
    const game = new Game(tiny);
    game.beginDrag([0, 0]);
    game.dragTo([1, 0]);
    game.endDrag();
    expect(game.undo()).toBe(true);
    expect(game.view()[0]).toEqual([]);
  });
});

describe('generator', () => {
  it('is deterministic', () => {
    const params = { seed: 7, width: 6, colors: [5, 6] as [number, number] };
    const a = generateLevel(params);
    const b = generateLevel(params);
    expect(a).not.toBeNull();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('produces valid, unique levels with mechanics', () => {
    const params = { width: 8, colors: [6, 8] as [number, number], walls: 2, bridges: 1, warps: 1 };
    for (let s = 0; s < 3; s++) {
      const c = generateLevel({ ...params, seed: 100 + s });
      expect(c).not.toBeNull();
      const level = toLevel(c!, { id: `t-${s}`, pack: 0, index: s, params: { ...params, seed: 100 + s } });
      const res = validateLevel(level);
      expect(res.errors).toEqual([]);
      expect(level.bridges.length).toBe(1);
      expect(level.warps.length).toBe(1);
      // Reproducible from its own seed.
      const again = generateAttempt({ ...params, seed: 0 }, level.meta.seed);
      expect(again?.puzzle.dots).toEqual(level.dots);
    }
  });

  it('canonical key is symmetry invariant', () => {
    const mirrored: Puzzle = {
      ...tiny,
      dots: [
        { color: 5, start: [0, 2], end: [2, 2] },
        { color: 3, start: [0, 0], end: [2, 0] },
      ],
    };
    expect(canonicalKey(tiny)).toBe(canonicalKey(mirrored));
  });
});
