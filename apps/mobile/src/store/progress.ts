import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DAILY_TIERS, dateKey, parseDateKey, type DailyTier, type Layer } from '@ctd/core';
import { persistStorage } from '../services/storage';
import { getPack, manifest, PACK_STAR_REQUIREMENTS } from '../data/levels';
import { unlimitedHintsActive, unlockAllActive } from './settings';

export interface LevelRecord {
  stars: number;
  bestMoves: number;
  solvedAt: number;
  usedHint: boolean;
}

export interface SavedBoard {
  paths: number[][];
  moves: number;
  hinted: number[];
  /** Tunnel / rotator orientations; absent for levels without them. */
  orient?: Layer[];
}

export interface CompletionResult {
  stars: number;
  isNewBest: boolean;
  firstSolve: boolean;
  hintsEarned: number;
  packCompleted: boolean;
}

export interface DailyCompletionResult extends CompletionResult {
  /** This solve finished the last of the day's three tiers. */
  perfectDay: boolean;
}

export interface DailyResult {
  stars: number;
  moves: number;
}

export type DailyDay = Partial<Record<DailyTier, DailyResult>>;

interface ProgressState {
  levels: Record<string, LevelRecord>;
  hints: number;
  daily: {
    completed: Record<string, DailyDay>;
    streak: number;
    bestStreak: number;
    lastDate: string | null;
  };
  inProgress: Record<string, SavedBoard>;
  lastPlayed: string | null;
  completedPacks: number[];

  completeLevel: (id: string, stars: number, moves: number, usedHint: boolean) => CompletionResult;
  completeDaily: (key: string, tier: DailyTier, stars: number, moves: number) => DailyCompletionResult;
  spendHint: () => boolean;
  saveBoard: (id: string, board: SavedBoard | null) => void;
  setLastPlayed: (id: string) => void;
  reset: () => void;
}

const initial = {
  levels: {},
  hints: 5,
  daily: { completed: {}, streak: 0, bestStreak: 0, lastDate: null },
  inProgress: {},
  lastPlayed: null,
  completedPacks: [],
};

export const useProgress = create<ProgressState>()(
  persist(
    (set, get) => ({
      ...initial,

      completeLevel: (id, stars, moves, usedHint) => {
        const prev = get().levels[id];
        const firstSolve = !prev;
        const bestStars = Math.max(prev?.stars ?? 0, stars);
        const isNewBest = !prev || moves < prev.bestMoves;
        let hintsEarned = 0;
        if (stars === 3 && (prev?.stars ?? 0) < 3) hintsEarned += 1;

        const levels = {
          ...get().levels,
          [id]: {
            stars: bestStars,
            bestMoves: prev ? Math.min(prev.bestMoves, moves) : moves,
            solvedAt: Date.now(),
            usedHint: (prev?.usedHint ?? false) || usedHint,
          },
        };

        let packCompleted = false;
        const pack = manifest.packs.find((p) => p.levels.includes(id));
        const completedPacks = [...get().completedPacks];
        if (pack && !completedPacks.includes(pack.id) && pack.levels.every((l) => levels[l])) {
          packCompleted = true;
          completedPacks.push(pack.id);
          hintsEarned += 3;
        }
        const inProgress = { ...get().inProgress };
        delete inProgress[id];
        set({ levels, completedPacks, inProgress, hints: get().hints + hintsEarned });
        return { stars, isNewBest, firstSolve, hintsEarned, packCompleted };
      },

      completeDaily: (key, tier, stars, moves) => {
        const d = get().daily;
        const day = d.completed[key] ?? {};
        const prev = day[tier];
        let { streak, bestStreak, lastDate } = d;
        let hintsEarned = 0;
        // Any one tier keeps the streak; only the day's first solve counts. Back-filling
        // an older day from the calendar leaves the current streak alone.
        if (!isDaySolved(day)) {
          hintsEarned = 1;
          if (!lastDate || key > lastDate) {
            const yesterday = parseDateKey(key);
            yesterday.setDate(yesterday.getDate() - 1);
            streak = lastDate === dateKey(yesterday) ? streak + 1 : 1;
            bestStreak = Math.max(bestStreak, streak);
            lastDate = key;
          }
        }
        const nextDay: DailyDay = {
          ...day,
          [tier]: { stars: Math.max(prev?.stars ?? 0, stars), moves: prev ? Math.min(prev.moves, moves) : moves },
        };
        const completed = { ...d.completed, [key]: nextDay };
        set({ daily: { completed, streak, bestStreak, lastDate }, hints: get().hints + hintsEarned });
        return {
          stars,
          isNewBest: !prev || moves < prev.moves,
          firstSolve: !prev,
          hintsEarned,
          packCompleted: false,
          perfectDay: !prev && isPerfectDay(nextDay),
        };
      },

      spendHint: () => {
        if (unlimitedHintsActive()) return true;
        if (get().hints <= 0) return false;
        set({ hints: get().hints - 1 });
        return true;
      },

      saveBoard: (id, board) => {
        const inProgress = { ...get().inProgress };
        if (board) inProgress[id] = board;
        else delete inProgress[id];
        set({ inProgress });
      },

      setLastPlayed: (id) => set({ lastPlayed: id }),

      reset: () => set({ ...initial }),
    }),
    {
      name: 'progress.v1',
      storage: persistStorage,
      version: 2,
      migrate: (persisted, version) => {
        const s = persisted as ProgressState;
        if (version < 2 && s?.daily) {
          s.daily = { ...s.daily, completed: upgradeLegacyDaily(s.daily.completed as unknown as Record<string, DailyResult>) };
          s.inProgress = dropLegacyDailyBoards(s.inProgress ?? {});
        }
        return s;
      },
    },
  ),
);

/** Before tiers existed each day had one puzzle; those solves count as the Medium tier. */
export function upgradeLegacyDaily(completed: Record<string, DailyResult>): Record<string, DailyDay> {
  return Object.fromEntries(Object.entries(completed).map(([key, r]) => [key, { medium: r }]));
}

export function dropLegacyDailyBoards(boards: Record<string, SavedBoard>): Record<string, SavedBoard> {
  return Object.fromEntries(Object.entries(boards).filter(([id]) => !/^daily-\d{4}-\d{2}-\d{2}$/.test(id)));
}

export function daySolvedCount(day: DailyDay | undefined): number {
  return day ? DAILY_TIERS.filter((t) => day[t]).length : 0;
}

export function isDaySolved(day: DailyDay | undefined): boolean {
  return daySolvedCount(day) > 0;
}

export function isPerfectDay(day: DailyDay | undefined): boolean {
  return daySolvedCount(day) === DAILY_TIERS.length;
}

export function totalStars(levels: Record<string, LevelRecord>): number {
  return Object.values(levels).reduce((a, l) => a + l.stars, 0);
}

export function packStars(levels: Record<string, LevelRecord>, packId: number): number {
  const pack = getPack(packId);
  return pack ? pack.levels.reduce((a, id) => a + (levels[id]?.stars ?? 0), 0) : 0;
}

export function packSolved(levels: Record<string, LevelRecord>, packId: number): number {
  const pack = getPack(packId);
  return pack ? pack.levels.filter((id) => levels[id]).length : 0;
}

export function isPackUnlocked(levels: Record<string, LevelRecord>, packId: number): boolean {
  if (packId <= 1 || unlockAllActive()) return true;
  const prev = getPack(packId - 1);
  if (prev && prev.levels.every((id) => levels[id])) return true;
  return totalStars(levels) >= (PACK_STAR_REQUIREMENTS[packId] ?? Infinity);
}

export function isLevelUnlocked(levels: Record<string, LevelRecord>, id: string): boolean {
  const pack = manifest.packs.find((p) => p.levels.includes(id));
  if (!pack || !isPackUnlocked(levels, pack.id)) return false;
  if (unlockAllActive()) return true;
  const i = pack.levels.indexOf(id);
  return i === 0 || !!levels[pack.levels[i - 1]] || !!levels[id];
}

/** First unsolved, unlocked level (the "Play" button target). */
export function nextToPlay(levels: Record<string, LevelRecord>): string {
  for (const p of manifest.packs) {
    if (!isPackUnlocked(levels, p.id)) continue;
    for (const id of p.levels) if (!levels[id] && isLevelUnlocked(levels, id)) return id;
  }
  return manifest.packs[0].levels[0];
}

export function starsFor(moves: number, perfect: number, twoStar: number, usedHint: boolean): number {
  const s = moves <= perfect ? 3 : moves <= twoStar ? 2 : 1;
  return usedHint ? Math.min(2, s) : s;
}
