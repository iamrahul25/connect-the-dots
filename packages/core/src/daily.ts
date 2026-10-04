import { createRng, hashSeed } from './rng';
import { mechanicsOf, type GenParams } from './generator';
import type { DailyTier, Puzzle } from './types';

export const DAILY_TIERS: readonly DailyTier[] = ['easy', 'medium', 'hard'];
export const DAILY_TIER_NAMES: Record<DailyTier, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };

type Obstacle = 'walls' | 'bridges' | 'warps' | 'teleporters' | 'tunnels' | 'rotators' | 'locks';

interface TierSpec {
  sizes: number[];
  obstacles: [number, number];
  /** Pick weight per obstacle type; types not listed never appear in this tier. */
  weights: Partial<Record<Obstacle, number>>;
  /** At least one obstacle is drawn from these. */
  featured?: Obstacle[];
  targetDifficulty: [number, number];
}

export const DAILY_TIER_SPECS: Record<DailyTier, TierSpec> = {
  easy: {
    sizes: [7, 8],
    obstacles: [1, 2],
    weights: { walls: 3, bridges: 2, warps: 1 },
    targetDifficulty: [20, 45],
  },
  medium: {
    sizes: [9, 10],
    obstacles: [3, 4],
    weights: { walls: 3, bridges: 2, warps: 1, teleporters: 2, tunnels: 2 },
    featured: ['teleporters', 'tunnels'],
    targetDifficulty: [38, 62],
  },
  hard: {
    sizes: [11, 12],
    obstacles: [5, 7],
    weights: { walls: 3, bridges: 2, warps: 1, teleporters: 2, tunnels: 2, rotators: 2, locks: 1 },
    featured: ['rotators', 'locks'],
    targetDifficulty: [55, 85],
  },
};

/** Per-board caps that keep the generator's success rate reasonable. */
const MAX_PER_TYPE: Record<Obstacle, number> = { walls: 7, bridges: 2, warps: 2, teleporters: 2, tunnels: 3, rotators: 3, locks: 1 };

const COLORS: Record<number, [number, number]> = {
  7: [6, 7],
  8: [6, 8],
  9: [7, 9],
  10: [7, 10],
  11: [9, 11],
  12: [10, 12],
};

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** YYYY-MM-DD in local time. */
export function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isDailyTier(v: unknown): v is DailyTier {
  return typeof v === 'string' && (DAILY_TIERS as readonly string[]).includes(v);
}

/** Teleporter and lock pairs count as one obstacle each. */
export function obstacleCount(p: Puzzle): number {
  return Object.values(mechanicsOf(p)).reduce((a, n) => a + n, 0);
}

/**
 * Deterministic generator params for one day and tier. Bump `attempt` to get a
 * different board size / obstacle mix when a combination fails to generate.
 */
export function dailyParams(key: string, tier: DailyTier, attempt = 0): GenParams {
  const spec = DAILY_TIER_SPECS[tier];
  const seed = hashSeed('daily', key, tier, attempt);
  const rng = createRng(seed);
  const width = rng.pick(spec.sizes);
  const total = rng.range(spec.obstacles[0], spec.obstacles[1]);
  const counts: Partial<Record<Obstacle, number>> = {};
  let placed = 0;
  const add = (pool: Obstacle[]) => {
    const open = pool.filter((o) => (counts[o] ?? 0) < MAX_PER_TYPE[o]);
    let x = rng.next() * open.reduce((a, o) => a + (spec.weights[o] ?? 0), 0);
    const pick = open.find((o) => (x -= spec.weights[o] ?? 0) < 0) ?? open[open.length - 1];
    counts[pick] = (counts[pick] ?? 0) + 1;
    placed++;
  };
  if (spec.featured) add(spec.featured);
  const all = Object.keys(spec.weights) as Obstacle[];
  while (placed < total) add(all);
  return { seed, width, colors: COLORS[width], ...counts, targetDifficulty: spec.targetDifficulty, maxAttempts: 400 };
}
