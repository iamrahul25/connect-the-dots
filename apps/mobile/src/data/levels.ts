import { dailyParams, generateLevel, obstacleCount, toLevel, type DailyTier, type GenParams, type Level } from '@ctd/core';
import { dailyBanks, levels, manifest } from '@ctd/levels';

export { manifest };

export const LEVELS_PER_PACK = 20;
export const PACK_STAR_REQUIREMENTS: Record<number, number> = {
  1: 0, 2: 30, 3: 70, 4: 110, 5: 150, 6: 190, 7: 230, 8: 270, 9: 310, 10: 350,
};

export type Pack = (typeof manifest.packs)[number];

export function getLevel(id: string): Level | undefined {
  return levels[id];
}

export function getPack(packId: number): Pack | undefined {
  return manifest.packs.find((p) => p.id === packId);
}

export function packOfLevel(id: string): Pack | undefined {
  return manifest.packs.find((p) => p.levels.includes(id));
}

export const allLevelIds: string[] = manifest.packs.flatMap((p) => p.levels);

/** 1-based level number across all packs. */
export function globalNumber(id: string): number {
  return allLevelIds.indexOf(id) + 1;
}

export function nextLevelId(id: string): string | undefined {
  const i = allLevelIds.indexOf(id);
  return i >= 0 ? allLevelIds[i + 1] : undefined;
}

export function maxStars(packId?: number): number {
  const count = packId ? (getPack(packId)?.levels.length ?? 0) : allLevelIds.length;
  return count * 3;
}

/** Daily puzzle from the bundled bank, or generated on-device as a fallback. */
export function dailyFromBank(key: string, tier: DailyTier): Level | undefined {
  return dailyBanks[key.slice(0, 7)]?.days[key]?.[tier];
}

const DAILY_TIME_BUDGET_MS: Record<DailyTier, number> = { easy: 4000, medium: 6000, hard: 12000 };

export function generateDaily(key: string, tier: DailyTier): Level | null {
  const deadline = Date.now() + DAILY_TIME_BUDGET_MS[tier];
  for (let attempt = 0; Date.now() < deadline; attempt++) {
    const params = { ...dailyParams(key, tier, attempt), timeBudgetMs: deadline - Date.now(), maxAttempts: 200 };
    const c = generateLevel(params);
    if (c) return toLevel(c, { id: `daily-${key}-${tier}`, pack: 0, index: Number(key.slice(8)), params });
  }
  return null;
}

/** Board size and obstacle count shown before the puzzle is opened. */
export function dailyPreview(key: string, tier: DailyTier): { size: number; obstacles: number } {
  const level = dailyFromBank(key, tier);
  if (level) return { size: level.size.width, obstacles: obstacleCount(level) };
  const p = dailyParams(key, tier);
  const n = (v: GenParams['walls']) => (typeof v === 'number' ? v : 0);
  return { size: p.width, obstacles: n(p.walls) + n(p.bridges) + n(p.warps) + n(p.teleporters) + n(p.tunnels) + n(p.rotators) + n(p.locks) };
}
