import { create } from 'zustand';

interface UiState {
  pack: string;
  setPack: (pack: string) => void;
}

/** Pack whose color overrides are applied on top of the player's theme. */
export const useUi = create<UiState>((set) => ({
  pack: 'dawn',
  setPack: (pack) => set({ pack }),
}));
