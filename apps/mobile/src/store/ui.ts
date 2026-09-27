import { create } from 'zustand';

interface UiState {
  theme: string;
  setTheme: (theme: string) => void;
}

/** Active background theme; the root layout renders it behind every screen. */
export const useUi = create<UiState>((set) => ({
  theme: 'dawn',
  setTheme: (theme) => set({ theme }),
}));
