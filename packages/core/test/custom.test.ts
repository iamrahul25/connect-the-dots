import { describe, expect, it } from 'vitest';
import {
  buildCustomLevel,
  draftFromLevel,
  emptyDraft,
  eraseAt,
  Game,
  LineDrag,
  placeLock,
  placeTeleporter,
  resizeDraft,
  rotatePiece,
  toggleObstacle,
  toggleWarp,
  validateLevel,
  type Cell,
  type CustomDraft,
} from '../src';

/** Feeds a drag one cell at a time, like the editor's pointer does. */
function draw(d: CustomDraft, color: number, cells: Cell[]): CustomDraft {
  const begin = LineDrag.begin(d, color, cells[0]);
  if (!begin.ok) throw new Error(begin.reason);
  for (const c of cells.slice(1)) begin.drag.dragTo(c);
  return begin.drag.finish();
}

const ok = <T extends { ok: boolean }>(r: T) => {
  if (!r.ok) throw new Error(JSON.stringify(r));
  return r as Extract<T, { ok: true }>;
};

/** Three straight columns on a 3×3 board: the only full cover. */
function columns(): CustomDraft {
  let d = emptyDraft(3, 3, 3);
  d = draw(d, 0, [[0, 0], [1, 0], [2, 0]]);
  d = draw(d, 1, [[0, 1], [1, 1], [2, 1]]);
  d = draw(d, 2, [[0, 2], [1, 2], [2, 2]]);
  return d;
}

describe('custom level build', () => {
  it('builds a valid, unique level from drawn lines', () => {
    const r = ok(buildCustomLevel(columns()));
    expect(r.uniqueness).toBe('unique');
    expect(r.level.dots).toEqual([
      { color: 0, start: [0, 0], end: [2, 0] },
      { color: 1, start: [0, 1], end: [2, 1] },
      { color: 2, start: [0, 2], end: [2, 2] },
    ]);
    expect(r.level.id).toMatch(/^custom-/);
    expect(validateLevel(r.level).errors).toEqual([]);
  });

  it('reports missing lines and empty squares', () => {
    const d = emptyDraft(3, 3, 2);
    const missing = buildCustomLevel(d);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.issue.message).toBe('2 colors have no line yet');

    let partial = draw(d, 0, [[0, 0], [1, 0], [2, 0]]);
    partial = draw(partial, 1, [[0, 1], [1, 1], [2, 1]]);
    const r = buildCustomLevel(partial);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issue.message).toBe('3 squares are still empty');
      expect(r.issue.cells).toHaveLength(3);
    }
  });

  it('flags levels with more than one solution', () => {
    // A . A / . . B / B . B: A could also run straight along the top.
    let d = draw(emptyDraft(3, 3, 2), 0, [[0, 0], [1, 0], [1, 1], [0, 1], [0, 2]]);
    d = draw(d, 1, [[2, 0], [2, 1], [2, 2], [1, 2]]);
    const r = ok(buildCustomLevel(d));
    expect(r.uniqueness).toBe('multiple');
  });

  it('round-trips through the shared level format', () => {
    const r = ok(buildCustomLevel(columns()));
    const again = ok(buildCustomLevel(draftFromLevel(JSON.parse(JSON.stringify(r.level)))!));
    expect(again.level).toEqual(r.level);
  });

  it('starts pieces turned away from the solution', () => {
    let d = emptyDraft(3, 3, 3);
    d = draw(d, 0, [[0, 0], [1, 0], [2, 0]]);
    d = draw(d, 1, [[0, 1], [1, 1], [2, 1]]);
    d = draw(d, 2, [[0, 2], [1, 2], [2, 2]]);
    d = ok(toggleObstacle(d, 'tunnel', [1, 1])).draft;
    const { level } = ok(buildCustomLevel(d));
    expect(level.formatVersion).toBe(2);
    expect(level.tunnels).toEqual([{ cell: [1, 1], start: 'h' }]);
    const game = new Game(level);
    level.dots.forEach((_, i) => game.applySolutionPath(i, level.solution[String(i)], false));
    expect(game.isSolved()).toBe(true);
  });

  it('lets the maker turn how pieces start, never into the solved way', () => {
    let d = emptyDraft(3, 3, 2);
    d = ok(toggleObstacle(d, 'rotator', [1, 1])).draft;
    // Line 0 turns west → north inside the rotator, so it is solved as 'nw'.
    d = draw(d, 0, [[0, 0], [1, 0], [1, 1], [0, 1], [0, 2]]);
    d = draw(d, 1, [[2, 0], [2, 1], [2, 2], [1, 2]]);
    const startOf = (x: CustomDraft) => ok(buildCustomLevel(x)).level.rotators![0].start;
    expect(startOf(d)).toBe('se');
    const turns: string[] = [];
    for (let i = 0; i < 3; i++) {
      d = ok(rotatePiece(d, [1, 1])).draft;
      turns.push(startOf(d));
    }
    expect(turns).toEqual(['sw', 'ne', 'se']);
    const { level } = ok(buildCustomLevel(d));
    expect(validateLevel(level).errors.filter((e) => e.includes('starts already solved'))).toEqual([]);
    expect(ok(buildCustomLevel(draftFromLevel(JSON.parse(JSON.stringify(level)))!)).level).toEqual(level);

    const crossed = ok(toggleObstacle(columns(), 'tunnel', [1, 1])).draft;
    expect(rotatePiece(crossed, [1, 1]).ok).toBe(false);
    const open = ok(toggleObstacle(emptyDraft(3, 3, 1), 'tunnel', [1, 1])).draft;
    expect(ok(rotatePiece(open, [1, 1])).draft.starts).toEqual([{ cell: [1, 1], dir: 'v' }]);
    expect(eraseAt(d, [1, 1])!.starts).toEqual([]);
  });
});

describe('line drawing', () => {
  it('extends, retracts and cuts like play', () => {
    let d = emptyDraft(4, 4, 2);
    d = draw(d, 0, [[1, 0], [1, 1], [1, 2], [1, 3]]);
    const b = LineDrag.begin(d, 1, [0, 1]);
    if (!b.ok) throw new Error(b.reason);
    b.drag.dragTo([1, 1]);
    b.drag.dragTo([2, 1]);
    // Line 0 is cut at [1,1]; its longer side survives.
    expect(b.drag.preview().lines[0]).toEqual([[1, 2], [1, 3]]);
    b.drag.dragTo([1, 1]);
    b.drag.dragTo([0, 1]);
    // Retracting before release brings it back.
    expect(b.drag.preview().lines[0]).toEqual([[1, 0], [1, 1], [1, 2], [1, 3]]);
  });

  it('picks up an existing line from its end', () => {
    let d = emptyDraft(4, 4, 1);
    d = draw(d, 0, [[0, 0], [0, 1], [0, 2]]);
    d = draw(d, 0, [[0, 0], [1, 0]]);
    expect(d.lines[0]).toEqual([[0, 2], [0, 1], [0, 0], [1, 0]]);
  });

  it('jumps through teleporters and wraps through warps', () => {
    let d = emptyDraft(5, 3, 1);
    d = ok(placeTeleporter(d, [0, 1], [2, 3])).draft;
    d = draw(d, 0, [[0, 0], [0, 1], [2, 4]]);
    expect(d.lines[0]).toEqual([[0, 0], [0, 1], [2, 3], [2, 4]]);

    let w = emptyDraft(4, 3, 1);
    w = ok(toggleWarp(w, { axis: 'row', index: 1 })).draft;
    w = draw(w, 0, [[1, 1], [1, 0], [1, 3]]);
    expect(w.lines[0]).toEqual([[1, 1], [1, 0], [1, 3]]);
  });

  it('turns through a rotator in either direction', () => {
    let d = emptyDraft(4, 4, 1);
    d = ok(toggleObstacle(d, 'rotator', [1, 1])).draft;
    const down = draw(d, 0, [[1, 0], [1, 1], [2, 1]]);
    expect(down.lines[0]).toEqual([[1, 0], [1, 1], [2, 1]]);
    const up = draw(d, 0, [[1, 0], [1, 1], [0, 1]]);
    expect(up.lines[0]).toEqual([[1, 0], [1, 1], [0, 1]]);
  });

  it("won't start on obstacles and pulls ends off them", () => {
    let d = emptyDraft(5, 5, 1);
    d = ok(toggleObstacle(d, 'bridge', [2, 2])).draft;
    const b = LineDrag.begin(d, 0, [2, 2]);
    expect(b.ok).toBe(false);
    d = draw(d, 0, [[2, 0], [2, 1], [2, 2]]);
    expect(d.lines[0]).toEqual([[2, 0], [2, 1]]);
  });
});

describe('obstacle placement', () => {
  const crossing = () => {
    let d = emptyDraft(5, 5, 1);
    d = draw(d, 0, [[2, 0], [2, 1], [2, 2], [3, 2]]);
    return d;
  };

  it('rejects obstacles that clash with drawn lines', () => {
    const d = crossing();
    const wall = toggleObstacle(d, 'wall', [2, 1]);
    expect(wall.ok).toBe(false);
    const bridge = toggleObstacle(d, 'bridge', [2, 2]);
    expect(!bridge.ok && bridge.reason).toMatch(/straight/);
    const edge = toggleObstacle(d, 'bridge', [0, 2]);
    expect(!edge.ok && edge.reason).toMatch(/edge/);
    const tunnel = toggleObstacle(d, 'tunnel', [2, 2]);
    expect(!tunnel.ok && tunnel.reason).toMatch(/straight/);
    const rotator = toggleObstacle(d, 'rotator', [2, 1]);
    expect(!rotator.ok && rotator.reason).toMatch(/turns/);
    const end = toggleObstacle(d, 'tunnel', [2, 0]);
    expect(!end.ok && end.reason).toMatch(/Dots/);
  });

  it('accepts obstacles that fit the lines', () => {
    const d = crossing();
    expect(toggleObstacle(d, 'bridge', [2, 1]).ok).toBe(true);
    expect(toggleObstacle(d, 'tunnel', [2, 1]).ok).toBe(true);
    expect(toggleObstacle(d, 'rotator', [2, 2]).ok).toBe(true);
    expect(toggleObstacle(d, 'wall', [0, 0]).ok).toBe(true);
  });

  it('checks teleporter gates and locks', () => {
    const d = crossing();
    expect(placeTeleporter(d, [0, 0], [0, 1]).ok).toBe(false);
    expect(placeTeleporter(d, [2, 1], [0, 4]).ok).toBe(false);
    expect(placeTeleporter(d, [0, 0], [4, 4]).ok).toBe(true);
    const same = placeLock(d, [2, 1], [2, 2]);
    expect(!same.ok && same.reason).toMatch(/same line/);
    expect(placeLock(d, [0, 0], [2, 1]).ok).toBe(true);
  });

  it('repairs lines when obstacles go away or the board shrinks', () => {
    let d = emptyDraft(5, 5, 2);
    d = ok(toggleObstacle(d, 'bridge', [2, 2])).draft;
    d = draw(d, 0, [[2, 0], [2, 1], [2, 2], [2, 3], [2, 4]]);
    d = draw(d, 1, [[0, 2], [1, 2], [2, 2], [3, 2], [4, 2]]);
    const erased = eraseAt(d, [2, 2])!;
    expect(erased.lines[0]).toEqual([[2, 0], [2, 1], [2, 2], [2, 3], [2, 4]]);
    expect(erased.lines[1]).toEqual([[0, 2], [1, 2]]);

    const small = resizeDraft(d, 3, 5);
    expect(small.bridges).toEqual([]);
    expect(small.lines[0]).toEqual([[2, 0], [2, 1], [2, 2]]);
  });
});
