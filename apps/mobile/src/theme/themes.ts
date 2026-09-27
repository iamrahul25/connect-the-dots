import { DEFAULT_PALETTE } from '@ctd/core';

export interface Theme {
  id: string;
  name: string;
  /** Background gradient, top to bottom. */
  gradient: [string, string, string];
  accent: string;
  /** Soft bokeh particle tint. */
  bokeh: string;
  music: string;
}

export const THEMES: Record<string, Theme> = {
  dawn: { id: 'dawn', name: 'Dawn', gradient: ['#1B1B3A', '#3A2352', '#6B3A5B'], accent: '#FFB38A', bokeh: '#FFB38A', music: 'dawn' },
  lagoon: { id: 'lagoon', name: 'Lagoon', gradient: ['#06283D', '#0B4F6C', '#127A8A'], accent: '#5EF2D6', bokeh: '#5EF2D6', music: 'lagoon' },
  ember: { id: 'ember', name: 'Ember', gradient: ['#1A0F14', '#3D1A1F', '#6E2A20'], accent: '#FFB547', bokeh: '#FF8A3D', music: 'ember' },
  aurora: { id: 'aurora', name: 'Aurora', gradient: ['#07131F', '#0F2E3A', '#1D4B4A'], accent: '#7CFFB2', bokeh: '#7CFFB2', music: 'aurora' },
  cosmos: { id: 'cosmos', name: 'Cosmos', gradient: ['#05030F', '#160B36', '#2D1363'], accent: '#B48CFF', bokeh: '#B48CFF', music: 'cosmos' },
  daily: { id: 'daily', name: 'Daily', gradient: ['#120C02', '#3A2A0A', '#6B4A12'], accent: '#FFC857', bokeh: '#FFD23F', music: 'dawn' },
};

export const PACK_ICONS: Record<string, string> = {
  dawn: 'partly-sunny',
  lagoon: 'water',
  ember: 'flame',
  aurora: 'sparkles',
  cosmos: 'planet',
  daily: 'calendar',
};

export const PALETTE: readonly string[] = DEFAULT_PALETTE;

/** Okabe–Ito based, extended to 12 with distinct luminance steps. */
export const COLORBLIND_PALETTE: readonly string[] = [
  '#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00',
  '#CC79A7', '#FFFFFF', '#999999', '#7FD4FF', '#B8860B', '#9467BD',
];

export function themeFor(id: string | undefined): Theme {
  return (id && THEMES[id]) || THEMES.dawn;
}
