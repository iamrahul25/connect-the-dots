import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage } from '../services/storage';
import { DEFAULT_THEME } from '../theme/config';

export interface SettingsState {
  /** Key into `themes` in theme/ui-config.json. */
  theme: string;
  music: boolean;
  sfx: boolean;
  haptics: boolean;
  colorblind: boolean;
  reduceMotion: boolean;
  idleHints: boolean;
  unlockAll: boolean;
  unlimitedHints: boolean;
  set: (patch: Partial<Omit<SettingsState, 'set'>>) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: DEFAULT_THEME,
      music: true,
      sfx: true,
      haptics: true,
      colorblind: true,
      reduceMotion: false,
      idleHints: true,
      unlockAll: false,
      unlimitedHints: false,
      set: (patch) => set(patch),
    }),
    {
      name: 'settings.v1',
      storage: persistStorage,
      version: 2,
      migrate: (persisted, version) => {
        const s = persisted as Partial<SettingsState>;
        return (version < 2 ? { ...s, colorblind: true } : s) as SettingsState;
      },
    },
  ),
);

/** Developer override that bypasses pack/level locks. Ignored in production builds. */
export function unlockAllActive(): boolean {
  return __DEV__ && useSettings.getState().unlockAll;
}

/** Developer override that makes hints free. Ignored in production builds. */
export function unlimitedHintsActive(): boolean {
  return __DEV__ && useSettings.getState().unlimitedHints;
}
