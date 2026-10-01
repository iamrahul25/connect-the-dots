import raw from './ui-config.json';

type RawTheme = (typeof raw.themes)[keyof typeof raw.themes];

/** A fully resolved theme: the base theme with the open pack's overrides merged in. */
export type UiTheme = Omit<RawTheme, 'packs'>;
export type DotStyle = UiTheme['dots'][number];
export type Palette = readonly DotStyle[];
export type ThemeId = keyof typeof raw.themes;

export const THEME_IDS = Object.keys(raw.themes) as ThemeId[];
export const DEFAULT_THEME = raw.defaultTheme as ThemeId;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Objects merge key by key; arrays and primitives in `over` replace the base value. */
function deepMerge<T>(base: T, over: unknown): T {
  if (!isObject(base) || !isObject(over)) return (over === undefined ? base : over) as T;
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(over)) out[k] = deepMerge(out[k], v);
  return out as T;
}

export function isThemeId(id: string | undefined): id is ThemeId {
  return !!id && id in raw.themes;
}

const cache = new Map<string, UiTheme>();

/** Same inputs always return the same object, so it is safe to key memo caches on it. */
export function resolveTheme(themeId: string | undefined, packId?: string): UiTheme {
  const id = isThemeId(themeId) ? themeId : DEFAULT_THEME;
  const key = `${id}/${packId ?? ''}`;
  let theme = cache.get(key);
  if (!theme) {
    const { packs, ...base } = raw.themes[id];
    const override = packId ? (packs as Record<string, unknown>)[packId] : undefined;
    theme = deepMerge(base as UiTheme, override);
    cache.set(key, theme);
  }
  return theme;
}

export function themeName(id: ThemeId): string {
  return raw.themes[id].name;
}
