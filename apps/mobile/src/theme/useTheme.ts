import { StyleSheet } from 'react-native';
import { useSettings } from '../store/settings';
import { resolveTheme, type Palette, type UiTheme } from './config';
import { makeScaler, useScale, type Scaler } from './scale';

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

/**
 * Theme- and screen-size-aware `StyleSheet.create`. `s(n)` scales a base phone size for the
 * current window; each theme × scale step builds its sheet once.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(build: (t: UiTheme, s: Scaler) => T) {
  const sheets = new WeakMap<UiTheme, Map<number, T>>();
  return function useStyles(): T {
    const theme = useTheme();
    const { scale } = useScale();
    let byScale = sheets.get(theme);
    if (!byScale) {
      byScale = new Map();
      sheets.set(theme, byScale);
    }
    let sheet = byScale.get(scale);
    if (!sheet) {
      sheet = StyleSheet.create(build(theme, makeScaler(scale)));
      byScale.set(scale, sheet);
    }
    return sheet;
  };
}
