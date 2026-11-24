import type { Level, SuiteId } from '@ctd/core';
import { getLevel, getPack, manifest } from '../data/levels';
import obstacleLevels from './obstacleLevels.json';

/** First level in `packId` whose board is `width` wide, preferring the most pairs; falls back to any. */
function pick(packId: string, width: number): Level | undefined {
  const ids = getPack(packId)?.levels ?? [];
  const all = ids.map(getLevel).filter((l): l is Level => !!l);
  const sized = all.filter((l) => l.size.width === width && l.size.height === width);
  const pool = sized.length ? sized : all;
  return [...pool].sort((a, b) => b.dots.length - a.dots.length)[0];
}

/** Real levels the tour plays. Resolved lazily so a missing pack can never crash the app at import. */
export function tourLevels() {
  return {
    /** Scene 2: a friendly board, solved flow by flow with real drags. */
    gameplay: pick('none', 5),
    /** Finale: a bigger board where every flow grows at once. */
    finale: pick('none', 7),
    /** Scene 4: boards getting bigger and busier. */
    growth: [pick('none', 5), pick('walls-bridges', 8), pick('all', 12)].filter((l): l is Level => !!l),
  };
}

/**
 * For each obstacle: a 4×4 intro board with exactly that one obstacle, used by its solution. The packs
 * start at 5×5, so these were made with the level generator (3 colors, unique solution) and saved here.
 * Falls back to the easiest 5×5 level of the obstacle's own pack.
 */
export function obstacleLevel(packId: string): Level | undefined {
  const intro = (obstacleLevels as unknown as Record<string, Level | undefined>)[packId];
  if (intro) return intro;
  const all = (getPack(packId)?.levels ?? []).map(getLevel).filter((l): l is Level => !!l);
  return all.find((l) => l.size.width === 5 && l.size.height === 5) ?? [...all].sort((a, b) => a.size.width - b.size.width)[0];
}

export interface SuiteStat {
  id: SuiteId;
  packs: number;
  levels: number;
}

/** Packs and levels that are playable today, per suite and in total, straight from the manifest. */
export function libraryStats(): { suites: SuiteStat[]; levels: number } {
  const suites = manifest.suites.map((s) => {
    const ready = s.packs.filter((p) => p.levels.length > 0);
    return { id: s.id, packs: ready.length, levels: ready.reduce((n, p) => n + p.levels.length, 0) };
  });
  return { suites, levels: suites.reduce((n, s) => n + s.levels, 0) };
}
