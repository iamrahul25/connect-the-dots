import { dailyParams, generateLevel, toLevel, type Level } from '@ctd/core';
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
export function dailyFromBank(key: string): Level | undefined {
  return dailyBanks[key.slice(0, 7)]?.levels[key];
}

export function generateDaily(key: string): Level | null {
  const params = { ...dailyParams(key), timeBudgetMs: 6000, maxAttempts: 200 };
  const capped = { ...params, width: Math.min(params.width, 10) };
  const c = generateLevel(capped);
  if (!c) return null;
  return toLevel(c, { id: `daily-${key}`, pack: 0, index: Number(key.slice(8)), params: capped });
}
