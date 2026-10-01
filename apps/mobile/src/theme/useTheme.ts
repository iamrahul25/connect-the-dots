import { StyleSheet } from 'react-native';
import { useSettings } from '../store/settings';
import { resolveTheme, type Palette, type UiTheme } from './config';

/** The player's selected theme. */
export function useTheme(): UiTheme {
  return resolveTheme(useSettings((s) => s.theme));
}

/** Dot palette for the active theme, switching to the colorblind set when enabled. */
export function usePalette(): Palette {
  const theme = useTheme();
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
