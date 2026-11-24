import { useSyncExternalStore } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { persistStorage } from '../services/storage';
import { DEFAULT_THEME } from '../theme/config';

export type TourSpeed = 0.5 | 1 | 2 | 4;
/** Tour speeds in the order the speed button cycles through them. */
export const TOUR_SPEEDS: TourSpeed[] = [0.5, 1, 2, 4];

export interface SettingsState {
  /** Key into `themes` in theme/ui-config.json. */
  theme: string;
  music: boolean;
  sfx: boolean;
  haptics: boolean;
  colorblind: boolean;
  reduceMotion: boolean;
  idleHints: boolean;
  /** Shows the Handcrafted level editor on the home screen. */
  handcrafted: boolean;
  unlockAll: boolean;
  unlimitedHints: boolean;
  /** The animated intro tour has been shown (it plays once, on first launch). */
  tourSeen: boolean;
  /** Playback speed of the tour: 0.5x (default, relaxed), 1x, 2x or 4x. */
  tourSpeed: TourSpeed;
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
      handcrafted: false,
      unlockAll: false,
      unlimitedHints: false,
      tourSeen: false,
      tourSpeed: 0.5,
      set: (patch) => set(patch),
    }),
    {
      name: 'settings.v1',
      storage: persistStorage,
      version: 3,
      migrate: (persisted, version) => {
        let s = persisted as Partial<SettingsState>;
        if (version < 2) s = { ...s, colorblind: true };
        // Players from before the tour already know the game; only new installs get it on launch.
        if (version < 3) s = { ...s, tourSeen: true };
        return s as SettingsState;
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

/** True once persisted settings have loaded, so first-launch checks don't fire on defaults. */
export function useSettingsHydrated(): boolean {
  return useSyncExternalStore(
    (onChange) => useSettings.persist.onFinishHydration(onChange),
    () => useSettings.persist.hasHydrated(),
  );
}
