import raw from './ui-config.json';

export type UiTheme = (typeof raw.themes)[keyof typeof raw.themes];
export type DotStyle = UiTheme['dots'][number];
export type Palette = readonly DotStyle[];
export type ThemeId = keyof typeof raw.themes;

export const THEME_IDS = Object.keys(raw.themes) as ThemeId[];
export const DEFAULT_THEME = raw.defaultTheme as ThemeId;

export function isThemeId(id: string | undefined): id is ThemeId {
  return !!id && id in raw.themes;
}

/** Same id always returns the same object, so it is safe to key memo caches on it. */
export function resolveTheme(themeId: string | undefined): UiTheme {
  return raw.themes[isThemeId(themeId) ? themeId : DEFAULT_THEME];
}

/** Accent for a pack's card on the Packs screen; falls back to the theme accent. */
export function packCardAccent(theme: UiTheme, pack: string): string {
  return (raw.packCards as Record<string, string>)[pack] ?? theme.accent.color;
}

export function themeName(id: ThemeId): string {
  return raw.themes[id].name;
}
