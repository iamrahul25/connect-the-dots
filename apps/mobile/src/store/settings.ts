import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage } from '../services/storage';

export interface SettingsState {
  music: boolean;
  sfx: boolean;
  haptics: boolean;
  colorblind: boolean;
  reduceMotion: boolean;
  idleHints: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      music: true,
      sfx: true,
      haptics: true,
      colorblind: false,
      reduceMotion: false,
      idleHints: true,
      set: (patch) => set(patch),
    }),
    { name: 'settings.v1', storage: persistStorage, version: 1 },
  ),
);
