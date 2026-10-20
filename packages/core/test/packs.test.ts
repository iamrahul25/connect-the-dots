import { describe, expect, it } from 'vitest';
import { obstaclesOf, packIdFor, packLevelId, packNameFor, sameObstacles, type Puzzle } from '../src';

const board = (extra: Partial<Puzzle> = {}): Puzzle => ({
  size: { width: 5, height: 5 },
  dots: [],
  walls: [],
  bridges: [],
  warps: [],
  ...extra,
});

describe('packs', () => {
  it('lists obstacle types in canonical order', () => {
    expect(obstaclesOf(board())).toEqual([]);
    expect(
      obstaclesOf(
        board({
          locks: [{ key: [0, 0], door: [1, 1] }],
          walls: [[2, 2]],
          warps: [{ axis: 'row', index: 1 }],
        }),
      ),
    ).toEqual(['walls', 'warps', 'locks']);
  });

  it('derives stable pack ids and names regardless of input order', () => {
    expect(packIdFor([])).toBe('none');
    expect(packIdFor(['bridges', 'walls'])).toBe('walls-bridges');
    expect(packIdFor(['locks', 'rotators', 'tunnels', 'teleporters', 'warps', 'bridges', 'walls'])).toBe('all');
    expect(packNameFor(['locks', 'rotators'])).toBe('Rotators + Keys & Doors');
    expect(packNameFor([])).toBe('No Obstacles');
    expect(sameObstacles(['warps', 'walls'], ['walls', 'warps'])).toBe(true);
    expect(sameObstacles(['walls'], ['walls', 'warps'])).toBe(false);
  });

  it('pads level ids to three digits', () => {
    expect(packLevelId('walls-bridges', 7)).toBe('walls-bridges-007');
  });
});
