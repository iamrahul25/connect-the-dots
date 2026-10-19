import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CustomDraft, Level, Uniqueness } from '@ctd/core';
import { persistStorage } from '../services/storage';

/** A level the player is making (or has made) in the Level Creator. */
export interface MyLevel {
  id: string;
  name: string;
  draft: CustomDraft;
  /** The last generated level; cleared whenever the draft changes. */
  level: Level | null;
  uniqueness: Uniqueness | null;
  updatedAt: number;
}

/** A level someone else made and shared. Keyed by its level id, so importing twice doesn't duplicate it. */
export interface CommunityLevel {
  id: string;
  name: string;
  author: string;
  level: Level;
  uniqueness: Uniqueness;
  importedAt: number;
}

export interface CustomResult {
  stars: number;
  bestMoves: number;
}

interface CustomLevelsState {
  mine: MyLevel[];
  community: CommunityLevel[];
  /** Best result per level id. */
  results: Record<string, CustomResult>;
  /** Name put on shared levels. */
  author: string;

  createMine: (name: string, draft: CustomDraft) => string;
  updateDraft: (id: string, draft: CustomDraft) => void;
  renameMine: (id: string, name: string) => void;
  setGenerated: (id: string, level: Level, uniqueness: Uniqueness) => void;
  deleteMine: (id: string) => void;
  /** False when the same level was already imported. */
  addCommunity: (entry: Omit<CommunityLevel, 'importedAt'>) => boolean;
  deleteCommunity: (id: string) => void;
  recordResult: (levelId: string, stars: number, moves: number) => void;
  setAuthor: (name: string) => void;
}

export const useCustomLevels = create<CustomLevelsState>()(
  persist(
    (set, get) => ({
      mine: [],
      community: [],
      results: {},
      author: '',

      createMine: (name, draft) => {
        const id = `mine-${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
        set({ mine: [{ id, name, draft, level: null, uniqueness: null, updatedAt: Date.now() }, ...get().mine] });
        return id;
      },

      updateDraft: (id, draft) =>
        set({ mine: get().mine.map((m) => (m.id === id ? { ...m, draft, level: null, uniqueness: null, updatedAt: Date.now() } : m)) }),

      renameMine: (id, name) => set({ mine: get().mine.map((m) => (m.id === id ? { ...m, name, updatedAt: Date.now() } : m)) }),

      setGenerated: (id, level, uniqueness) =>
        set({ mine: get().mine.map((m) => (m.id === id ? { ...m, level, uniqueness, updatedAt: Date.now() } : m)) }),

      deleteMine: (id) => set({ mine: get().mine.filter((m) => m.id !== id) }),

      addCommunity: (entry) => {
        if (get().community.some((c) => c.id === entry.id)) return false;
        set({ community: [{ ...entry, importedAt: Date.now() }, ...get().community] });
        return true;
      },

      deleteCommunity: (id) => set({ community: get().community.filter((c) => c.id !== id) }),

      recordResult: (levelId, stars, moves) => {
        const prev = get().results[levelId];
        set({
          results: {
            ...get().results,
            [levelId]: { stars: Math.max(prev?.stars ?? 0, stars), bestMoves: prev ? Math.min(prev.bestMoves, moves) : moves },
          },
        });
      },

      setAuthor: (author) => set({ author }),
    }),
    { name: 'custom-levels.v1', storage: persistStorage, version: 1 },
  ),
);

/** The playable level for a play-route id: one of mine (generated) or a community level. */
export function findCustomLevel(s: Pick<CustomLevelsState, 'mine' | 'community'>, levelId: string): { level: Level; name: string; mineId?: string } | null {
  const m = s.mine.find((x) => x.level?.id === levelId);
  if (m?.level) return { level: m.level, name: m.name, mineId: m.id };
  const c = s.community.find((x) => x.id === levelId);
  return c ? { level: c.level, name: c.name } : null;
}
