import type { RankTier } from '../data/ranks';

export interface TierColors {
  /** Metal shades from highlight to shadow, used by the badge art. */
  light: string;
  mid: string;
  dark: string;
  deep: string;
  /** UI color for labels, borders and progress; reads on light and dark themes. */
  accent: string;
}

/** The same on every theme, like the pack card accents. */
export const TIER_COLORS: Record<RankTier, TierColors> = {
  bronze: { light: '#FFD7B0', mid: '#E58E4E', dark: '#B0581F', deep: '#6E3210', accent: '#D9752F' },
  silver: { light: '#FFFFFF', mid: '#D3DBE5', dark: '#93A1B2', deep: '#4F5B6A', accent: '#8796A8' },
  gold: { light: '#FFF4B8', mid: '#FFCB3D', dark: '#E09A00', deep: '#8A5A00', accent: '#E6A400' },
  platinum: { light: '#F2FFFD', mid: '#A6E3DB', dark: '#57ABA2', deep: '#22605A', accent: '#3AA598' },
  diamond: { light: '#E8FCFF', mid: '#74D8FF', dark: '#2B8FF0', deep: '#1A47A8', accent: '#2C9BF0' },
  emerald: { light: '#D9FFE8', mid: '#4FDB8F', dark: '#14A35A', deep: '#0B5E33', accent: '#1FB866' },
  master: { light: '#F3E6FF', mid: '#BE8CFF', dark: '#8047E0', deep: '#3F1C85', accent: '#9254F0' },
  grandmaster: { light: '#FFD9D9', mid: '#FF6B6B', dark: '#D62A3A', deep: '#6E0F1C', accent: '#E5384F' },
  legendary: { light: '#FFE9A8', mid: '#FFB52E', dark: '#E8641C', deep: '#8A3300', accent: '#F08A00' },
  mythic: { light: '#FFE3FA', mid: '#FF5CD1', dark: '#7C3AED', deep: '#2A0E5C', accent: '#E040C8' },
};
