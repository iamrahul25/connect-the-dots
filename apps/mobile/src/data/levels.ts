import {
  dailyParams,
  generateLevel,
  obstacleCount,
  toLevel,
  type DailyTier,
  type GenParams,
  type Level,
  type ManifestPack,
  type ManifestSuite,
  type SuiteId,
} from '@ctd/core';
import { dailyBanks, legacyLevelIds, levels, manifest } from '@ctd/levels';

export { manifest, legacyLevelIds };

export type Pack = ManifestPack;
export type Suite = ManifestSuite;

/** Every pack, in suite order; packs without levels yet are "coming soon". */
export const allPacks: Pack[] = manifest.suites.flatMap((s) => s.packs);

export function getLevel(id: string): Level | undefined {
  return levels[id];
}

export function getSuite(suiteId: SuiteId): Suite | undefined {
  return manifest.suites.find((s) => s.id === suiteId);
}

export function getPack(packId: string): Pack | undefined {
  return allPacks.find((p) => p.id === packId);
}

export function suiteOfPack(packId: string): Suite | undefined {
  return manifest.suites.find((s) => s.packs.some((p) => p.id === packId));
}

export function packOfLevel(id: string): Pack | undefined {
  return allPacks.find((p) => p.levels.includes(id));
}

export const allLevelIds: string[] = allPacks.flatMap((p) => p.levels);

/** Smallest and largest board in a pack, e.g. `7×7 – 10×10`. */
export function packGridRange(pack: Pack): string {
  const sizes = pack.levels.flatMap((id) => {
    const l = levels[id];
    return l ? [l.size] : [];
  });
  if (!sizes.length) return '';
  const area = (s: { width: number; height: number }) => s.width * s.height;
  const sorted = [...sizes].sort((a, b) => area(a) - area(b));
  const fmt = (s: { width: number; height: number }) => `${s.width}×${s.height}`;
  const lo = fmt(sorted[0]);
  const hi = fmt(sorted[sorted.length - 1]);
  return lo === hi ? lo : `${lo} – ${hi}`;
}

/** 1-based level number within its pack. */
export function levelNumber(id: string): number {
  return (packOfLevel(id)?.levels.indexOf(id) ?? -1) + 1;
}

export function nextLevelId(id: string): string | undefined {
  const i = allLevelIds.indexOf(id);
  return i >= 0 ? allLevelIds[i + 1] : undefined;
}

export function maxStars(packId?: string): number {
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
    if (c) return toLevel(c, { id: `daily-${key}-${tier}`, pack: 'daily', index: Number(key.slice(8)), params });
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
