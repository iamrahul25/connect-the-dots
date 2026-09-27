import { darken, lighten, mix } from '../board/color';
import { colors } from './tokens';

export interface ThemeGlow {
  color: string;
  /** Center and radius as fractions of the screen width/height. */
  x: number;
  y: number;
  r: number;
}

export interface Theme {
  id: string;
  name: string;
  /** Background gradient, top to bottom, evenly spaced stops. */
  gradient: readonly [string, string, ...string[]];
  /** Soft radial light pools painted over the gradient. */
  glows: readonly ThemeGlow[];
  accent: string;
  /** Accent ramp for meters and highlights: shadow, base, highlight. */
  accentRamp: readonly [string, string, string];
  /** Soft bokeh particle tint. */
  bokeh: string;
  music: string;
}

const ramp = (accent: string): [string, string, string] => [darken(accent, 0.18), accent, lighten(accent, 0.25)];

const glowsFor = (accent: string): ThemeGlow[] => [
  { color: mix(accent, '#000000', 0.62), x: 0.05, y: 0.95, r: 0.7 },
  { color: mix(accent, '#000000', 0.72), x: 1, y: 0.1, r: 0.55 },
];

const bg = colors.background;

export const THEMES: Record<string, Theme> = {
  dawn: {
    id: 'dawn',
    name: 'Dawn',
    gradient: [bg.top, bg.primary, bg.lower, bg.bottomGlow],
    glows: [
      { color: bg.pinkGlow, x: 0.0, y: 0.92, r: 0.75 },
      { color: bg.blueGlow, x: 1.0, y: 0.08, r: 0.6 },
      { color: bg.accent, x: 1.0, y: 0.62, r: 0.45 },
    ],
    accent: colors.orange,
    accentRamp: [colors.meter.fillShadow, colors.meter.fill, colors.meter.fillHighlight],
    bokeh: colors.glow.violet,
    music: 'dawn',
  },
  lagoon: { id: 'lagoon', name: 'Lagoon', gradient: ['#06283D', '#0B4F6C', '#127A8A'], glows: glowsFor('#5EF2D6'), accent: '#5EF2D6', accentRamp: ramp('#5EF2D6'), bokeh: '#5EF2D6', music: 'lagoon' },
  ember: { id: 'ember', name: 'Ember', gradient: ['#1A0F14', '#3D1A1F', '#6E2A20'], glows: glowsFor('#FF8A3D'), accent: '#FFB547', accentRamp: ramp('#FFB547'), bokeh: '#FF8A3D', music: 'ember' },
  aurora: { id: 'aurora', name: 'Aurora', gradient: ['#07131F', '#0F2E3A', '#1D4B4A'], glows: glowsFor('#7CFFB2'), accent: '#7CFFB2', accentRamp: ramp('#7CFFB2'), bokeh: '#7CFFB2', music: 'aurora' },
  cosmos: { id: 'cosmos', name: 'Cosmos', gradient: ['#05030F', '#160B36', '#2D1363'], glows: glowsFor('#B48CFF'), accent: '#B48CFF', accentRamp: ramp('#B48CFF'), bokeh: '#B48CFF', music: 'cosmos' },
  daily: {
    id: 'daily',
    name: 'Daily',
    gradient: ['#120C02', '#3A2A0A', '#6B4A12'],
    glows: glowsFor('#FFCA28'),
    accent: colors.button.badge,
    accentRamp: [colors.goldShadow, colors.button.badge, colors.button.badgeHighlight],
    bokeh: colors.glow.yellow,
    music: 'dawn',
  },
};

export const PACK_ICONS: Record<string, string> = {
  dawn: 'partly-sunny',
  lagoon: 'water',
  ember: 'flame',
  aurora: 'sparkles',
  cosmos: 'planet',
  daily: 'calendar',
};

/** Full neon treatment for one flow color. */
export interface FlowStyle {
  /** Bead body; also the key used by palettes. */
  base: string;
  bright: string;
  shadow: string;
  pipe: string;
  pipeHighlight: string;
  pipeShadow: string;
  glow: string;
  /** Solid fill for board cells the flow occupies. */
  tint: string;
}

const FLOWS: FlowStyle[] = [
  { base: '#F42C57', bright: '#FF587E', shadow: '#C71945', pipe: '#F42C57', pipeHighlight: '#FF6688', pipeShadow: '#C91C45', glow: '#FF285D', tint: '#5C183D' },
  { base: '#0AA0F9', bright: '#48C7FF', shadow: '#0870C9', pipe: '#0A9FF0', pipeHighlight: '#62CEFF', pipeShadow: '#0875D0', glow: '#008CFF', tint: '#092E60' },
  { base: '#00E877', bright: '#33FBA2', shadow: '#00A857', pipe: '#00E877', pipeHighlight: '#56FFB0', pipeShadow: '#00A957', glow: '#00FF9A', tint: '#063F38' },
  { base: '#F7C91E', bright: '#FFE56A', shadow: '#D99E00', pipe: '#F7C91E', pipeHighlight: '#FFE56A', pipeShadow: '#D99E00', glow: '#FFC400', tint: '#594314' },
  { base: '#AC3DF8', bright: '#D66FFD', shadow: '#7926C8', pipe: '#B94CF5', pipeHighlight: '#DD82FF', pipeShadow: '#822CCB', glow: '#C044FF', tint: '#432263' },
  { base: '#FF9B70', bright: '#FFB184', shadow: '#E66E4F', pipe: '#FF9B70', pipeHighlight: '#FFB184', pipeShadow: '#E66E4F', glow: '#FF8A54', tint: deriveTint('#FF9B70') },
];

function deriveTint(base: string): string {
  return mix(base, colors.board.bg, 0.72);
}

function deriveFlow(base: string): FlowStyle {
  return {
    base,
    bright: lighten(base, 0.3),
    shadow: darken(base, 0.22),
    pipe: base,
    pipeHighlight: lighten(base, 0.38),
    pipeShadow: darken(base, 0.2),
    glow: base,
    tint: deriveTint(base),
  };
}

/** Palette indices match `@ctd/core` DEFAULT_PALETTE: red, blue, green, yellow, purple, orange, cyan, pink, lime, indigo, white, bronze. */
const FLOW_STYLES: FlowStyle[] = [
  ...FLOWS,
  ...['#2EE6E6', '#FF6FD8', '#A6E22E', '#8C6BFF', '#F5F2FF', '#C08457'].map(deriveFlow),
];

export const PALETTE: readonly string[] = FLOW_STYLES.map((f) => f.base);

/** Okabe–Ito based, extended to 12 with distinct luminance steps. */
export const COLORBLIND_PALETTE: readonly string[] = [
  '#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00',
  '#CC79A7', '#FFFFFF', '#999999', '#7FD4FF', '#B8860B', '#9467BD',
];

const STYLE_BY_BASE = new Map<string, FlowStyle>(FLOW_STYLES.map((f) => [f.base, f]));

export function flowStyle(color: string): FlowStyle {
  return STYLE_BY_BASE.get(color) ?? deriveFlow(color);
}

export function themeFor(id: string | undefined): Theme {
  return (id && THEMES[id]) || THEMES.dawn;
}
