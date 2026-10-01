import { StyleSheet } from 'react-native';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
import { resolveTheme, type Palette, type UiTheme } from './config';

/** The player's theme with the open pack's overrides; pass `pack` to preview a specific pack. */
export function useTheme(pack?: string): UiTheme {
  const themeId = useSettings((s) => s.theme);
  const current = useUi((s) => s.pack);
  return resolveTheme(themeId, pack ?? current);
}

/** Dot palette for the active theme, switching to the colorblind set when enabled. */
export function usePalette(pack?: string): Palette {
  const theme = useTheme(pack);
  const colorblind = useSettings((s) => s.colorblind);
  return colorblind ? theme.colorblindDots : theme.dots;
}

/** Theme-aware `StyleSheet.create`; each resolved theme builds its sheet once. */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(build: (t: UiTheme) => T) {
  const sheets = new WeakMap<UiTheme, T>();
  return function useStyles(): T {
    const theme = useTheme();
    let sheet = sheets.get(theme);
    if (!sheet) {
      sheet = StyleSheet.create(build(theme));
      sheets.set(theme, sheet);
    }
    return sheet;
  };
}
