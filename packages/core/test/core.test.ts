import { describe, expect, it } from 'vitest';
import {
  buildGraph,
  canonicalKey,
  createRng,
  DAILY_TIER_SPECS,
  DAILY_TIERS,
  dailyParams,
  endpointNodes,
  Game,
  generateAttempt,
  generateLevel,
  hashSeed,
  isValidSolution,
  nodesAt,
  obstacleCount,
  solveExact,
  solveHuman,
  specOf,
  toLevel,
  validateLevel,
  type GenParams,
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

  it('ignores retracting steps when extendOnly is set', () => {
    const game = new Game(strip);
    game.beginDrag([0, 0]);
    game.dragTo([0, 1]);
    game.dragTo([0, 2]);
    expect(game.isComplete(0)).toBe(true);
    expect(game.dragTo([0, 1], true)).toEqual([]);
    expect(game.isComplete(0)).toBe(true);
    expect(game.dragTo([0, 1]).some((e) => e.type === 'disconnect')).toBe(true);
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

  it('undoes the last move and rewinds the move count', () => {
    const game = new Game(tiny);
    game.beginDrag([0, 0]);
    game.dragTo([1, 0]);
    game.endDrag();
    expect(game.moves).toBe(1);
    expect(game.canUndo()).toBe(true);
    expect(game.undo()).toBe(true);
    expect(game.view()[0]).toEqual([]);
    expect(game.moves).toBe(0);
    expect(game.canUndo()).toBe(false);
    expect(game.undo()).toBe(false);
    expect(game.moves).toBe(0);
  });

  it('undoes only one step', () => {
    const game = new Game(tiny);
    game.beginDrag([0, 0]);
    game.dragTo([1, 0]);
    game.endDrag();
    game.beginDrag([1, 0]);
    game.dragTo([1, 1]);
    game.endDrag();
    expect(game.undo()).toBe(true);
    expect(game.view()[0].length).toBe(2);
    expect(game.undo()).toBe(false);
    expect(game.view()[0].length).toBe(2);
    game.beginDrag([1, 0]);
    game.dragTo([1, 1]);
    game.endDrag();
    expect(game.canUndo()).toBe(true);
  });

  it('keeps the same-pair streak across undo', () => {
    const game = new Game(tiny);
    game.beginDrag([0, 0]);
    game.dragTo([1, 0]);
    game.endDrag();
    game.beginDrag([1, 0]);
    game.dragTo([1, 1]);
    game.endDrag();
    expect(game.moves).toBe(1);
    game.undo();
    expect(game.moves).toBe(1);
    game.beginDrag([1, 0]);
    game.dragTo([1, 1]);
    game.endDrag();
    expect(game.moves).toBe(1);
  });

  it('counts each hint as one move', () => {
    const game = new Game(tiny);
    game.applySolutionPath(0, [[0, 0], [1, 0], [2, 0]]);
    expect(game.moves).toBe(1);
    game.applySolutionPath(1, [[0, 2], [1, 2], [2, 2]]);
    expect(game.moves).toBe(2);
    game.applySolutionPath(1, [[0, 2], [1, 2], [2, 2]], false);
    expect(game.moves).toBe(2);
  });
});

describe('new mechanics', () => {
  const count = (p: Puzzle) => {
    const g = buildGraph(specOf(p));
    return solveExact(g, endpointNodes(g, p), { maxSolutions: 3 }).solutions.length;
  };

  it('models tunnels and rotators as one-of orientation nodes', () => {
    const g = buildGraph({ ...plain(3, 3), tunnels: [[1, 1]], rotators: [[0, 1]] });
    const cellOf = (n: number) => `${g.nodeRow[n]},${g.nodeCol[n]}`;
    const [h, v] = nodesAt(g, [1, 1]);
    expect(g.adj[h].map(cellOf).sort()).toEqual(['1,0', '1,2']);
    expect(g.adj[v].map(cellOf).sort()).toEqual(['0,1', '0,1', '2,1']);
    const [ne, se, sw, nw] = nodesAt(g, [0, 1]);
    expect(g.adj[ne].map(cellOf)).toEqual(['0,2']);
    expect(g.adj[se].map(cellOf).sort()).toEqual(['0,2', '1,1']);
    expect(g.adj[sw].map(cellOf).sort()).toEqual(['0,0', '1,1']);
    expect(g.adj[nw].map(cellOf)).toEqual(['0,0']);
    expect(g.unitCount).toBe(9);
  });

  it('tunnels, rotators and locks prune solutions', () => {
    expect(count(strip)).toBe(2);
    expect(count({ ...strip, tunnels: [{ cell: [0, 1], start: 'v' }] })).toBe(1);
    expect(count({ ...strip, rotators: [{ cell: [0, 1], start: 'ne' }] })).toBe(1);
    expect(count({ ...strip, locks: [{ key: [1, 1], door: [2, 1] }] })).toBe(1);
    const both = { ...strip, tunnels: [{ cell: [0, 1] as [number, number], start: 'v' as const }], locks: [{ key: [1, 1] as [number, number], door: [2, 1] as [number, number] }] };
    expect(count(both)).toBe(0);
  });

  it('forces travel through teleporters', () => {
    const line: Puzzle = {
      size: { width: 6, height: 1 },
      dots: [{ color: 0, start: [0, 0], end: [0, 5] }],
      walls: [],
      bridges: [],
      warps: [],
    };
    expect(count(line)).toBe(1);
    expect(count({ ...line, teleporters: [{ a: [0, 1], b: [0, 4] }] })).toBe(0);
  });

  it('teleports the drag head and retracts through the gate', () => {
    const p: Puzzle = {
      size: { width: 5, height: 1 },
      dots: [{ color: 0, start: [0, 0], end: [0, 4] }],
      walls: [],
      bridges: [],
      warps: [],
      teleporters: [{ a: [0, 1], b: [0, 3] }],
    };
    const game = new Game(p);
    game.beginDrag([0, 0]);
    const ev = game.dragTo([0, 1]);
    expect(ev.some((e) => e.type === 'teleport')).toBe(true);
    expect(game.view()[0].map((n) => game.g.nodeCol[n])).toEqual([0, 1, 3]);
    expect(game.dragTo([0, 4]).some((e) => e.type === 'connect')).toBe(true);
    game.dragTo([0, 3]);
    game.dragTo([0, 1]);
    expect(game.view()[0].map((n) => game.g.nodeCol[n])).toEqual([0]);
  });

  it('tunnels accept only their current orientation and rotating cuts paths', () => {
    const p: Puzzle = { ...tiny, tunnels: [{ cell: [0, 1], start: 'v' }] };
    const game = new Game(p);
    game.beginDrag([0, 0]);
    expect(game.dragTo([0, 1])[0].type).toBe('invalid');
    game.endDrag();
    expect(game.rotate([0, 1])[0]).toEqual({ type: 'rotate', cell: [0, 1], dir: 'h' });
    game.beginDrag([0, 0]);
    game.dragTo([0, 1]);
    game.dragTo([1, 1]);
    game.endDrag();
    expect(game.view()[0].length).toBe(2);
    const ev = game.rotate([0, 1]);
    expect(ev.some((e) => e.type === 'cut' && e.pair === 0)).toBe(true);
    expect(game.view()[0]).toEqual([]);
    expect(game.orientationAt([0, 1])).toBe('v');
    expect(game.canUndo()).toBe(false);
    expect(game.undo()).toBe(false);
    expect(game.orientationAt([0, 1])).toBe('v');
  });

  it('opens doors with completed key paths and re-locks them', () => {
    const p: Puzzle = {
      ...tiny,
      dots: [
        { color: 0, start: [0, 0], end: [0, 2] },
        { color: 1, start: [2, 0], end: [2, 2] },
      ],
      locks: [{ key: [0, 1], door: [2, 1] }],
    };
    const game = new Game(p);
    game.beginDrag([2, 0]);
    expect(game.dragTo([2, 1])[0].type).toBe('invalid');
    game.endDrag();
    game.beginDrag([0, 0]);
    game.dragTo([0, 1]);
    const ev = game.dragTo([0, 2]);
    expect(ev).toContainEqual({ type: 'door', lock: 0, open: true });
    game.endDrag();
    game.beginDrag([2, 0]);
    game.dragTo([2, 1]);
    game.dragTo([2, 2]);
    game.endDrag();
    expect(game.connectedCount()).toBe(2);
    // Breaking the key path closes the door and cuts the path through it.
    game.beginDrag([0, 0]);
    expect(game.doors()).toEqual([false]);
    expect(game.view()[1].length).toBe(1);
    game.dragTo([1, 0]);
    game.endDrag();
    expect(game.view()[1]).toEqual([]);
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

  it('produces valid, unique levels with the new mechanics', () => {
    const cases = [
      { width: 8, colors: [6, 8] as [number, number], teleporters: 1 },
      { width: 8, colors: [6, 8] as [number, number], tunnels: 2 },
      { width: 8, colors: [6, 8] as [number, number], rotators: 2 },
      { width: 8, colors: [6, 8] as [number, number], locks: 1 },
      { width: 9, colors: [7, 9] as [number, number], walls: 1, bridges: 1, warps: 1, teleporters: 1, tunnels: 1, rotators: 1, locks: 1 },
    ];
    cases.forEach((params, s) => {
      const c = generateLevel({ ...params, seed: 300 + s, maxAttempts: 400 });
      expect(c).not.toBeNull();
      const level = toLevel(c!, { id: `n-${s}`, pack: 0, index: s, params: { ...params, seed: 300 + s } });
      expect(level.formatVersion).toBe(2);
      expect(validateLevel(level).errors).toEqual([]);
      expect(level.teleporters!.length).toBe(params.teleporters ?? 0);
      expect(level.tunnels!.length).toBe(params.tunnels ?? 0);
      expect(level.rotators!.length).toBe(params.rotators ?? 0);
      expect(level.locks!.length).toBe(params.locks ?? 0);
      const again = generateAttempt({ ...params, seed: 0 }, level.meta.seed);
      expect(again?.puzzle).toEqual(c!.puzzle);
      // Playing the stored solution through the engine wins.
      const game = new Game(level);
      for (const t of [...level.tunnels!, ...level.rotators!]) expect(game.orientationAt(t.cell)).toBe(t.start);
      let pair = game.hintPair(level.solution);
      let events: ReturnType<Game['applySolutionPath']> = [];
      for (let guard = 0; pair !== -1 && guard < 50; guard++) {
        events = game.applySolutionPath(pair, level.solution[String(pair)]);
        pair = game.hintPair(level.solution);
      }
      expect(events.some((e) => e.type === 'win')).toBe(true);
    });
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

describe('daily tiers', () => {
  const MECHANICS = ['walls', 'bridges', 'warps', 'teleporters', 'tunnels', 'rotators', 'locks'] as const;
  const total = (p: GenParams) => MECHANICS.reduce((a, m) => a + ((p[m] as number | undefined) ?? 0), 0);

  it('params follow each tier spec and are deterministic', () => {
    for (const tier of DAILY_TIERS) {
      const spec = DAILY_TIER_SPECS[tier];
      for (let d = 1; d <= 28; d++) {
        const key = `2026-10-${String(d).padStart(2, '0')}`;
        const p = dailyParams(key, tier);
        expect(dailyParams(key, tier)).toEqual(p);
        expect(spec.sizes).toContain(p.width);
        expect(total(p)).toBeGreaterThanOrEqual(spec.obstacles[0]);
        expect(total(p)).toBeLessThanOrEqual(spec.obstacles[1]);
        for (const m of MECHANICS) if (p[m]) expect(spec.weights[m]).toBeDefined();
        if (spec.featured) expect(spec.featured.some((m) => p[m])).toBe(true);
      }
    }
  });

  it('tiers of the same day get different seeds', () => {
    const seeds = DAILY_TIERS.map((t) => dailyParams('2026-10-04', t).seed);
    expect(new Set(seeds).size).toBe(3);
  });

  it('generates an easy daily with the requested obstacles', () => {
    const p = dailyParams('2026-10-04', 'easy');
    const c = generateLevel(p);
    expect(c).not.toBeNull();
    expect(obstacleCount(c!.puzzle)).toBe(total(p));
  });
});
