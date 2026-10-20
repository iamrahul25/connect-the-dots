import { mechanicsOf } from './generator';
import type { Obstacle, Puzzle } from './types';

/** Canonical order: pack ids, names and glyph rows always list obstacles in this order. */
export const OBSTACLES: readonly Obstacle[] = ['walls', 'bridges', 'warps', 'teleporters', 'tunnels', 'rotators', 'locks'];

export const OBSTACLE_LABELS: Record<Obstacle, string> = {
  walls: 'Walls',
  bridges: 'Bridges',
  warps: 'Warps',
  teleporters: 'Teleporters',
  tunnels: 'Tunnels',
  rotators: 'Rotators',
  locks: 'Keys & Doors',
};

export function isObstacle(v: unknown): v is Obstacle {
  return typeof v === 'string' && (OBSTACLES as readonly string[]).includes(v);
}

export function sortObstacles(list: readonly Obstacle[]): Obstacle[] {
  return OBSTACLES.filter((o) => list.includes(o));
}

/** Obstacle types present on the board, in canonical order. */
export function obstaclesOf(p: Puzzle): Obstacle[] {
  const m = mechanicsOf(p);
  return OBSTACLES.filter((o) => (m[o] ?? 0) > 0);
}

export function sameObstacles(a: readonly Obstacle[], b: readonly Obstacle[]): boolean {
  return packIdFor(a) === packIdFor(b);
}

/** Stable pack id for an obstacle set: `none`, `all`, or the types joined by `-` (`walls-bridges`). */
export function packIdFor(list: readonly Obstacle[]): string {
  if (list.length === 0) return 'none';
  if (list.length === OBSTACLES.length) return 'all';
  return sortObstacles(list).join('-');
}

export function packNameFor(list: readonly Obstacle[]): string {
  if (list.length === 0) return 'No Obstacles';
  if (list.length === OBSTACLES.length) return `All ${OBSTACLES.length} Obstacles`;
  return sortObstacles(list).map((o) => OBSTACLE_LABELS[o]).join(' + ');
}

/** `walls-bridges` + 7 -> `walls-bridges-007`. */
export function packLevelId(packId: string, index: number): string {
  return `${packId}-${String(index).padStart(3, '0')}`;
}
