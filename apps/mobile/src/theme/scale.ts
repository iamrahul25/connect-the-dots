import { useWindowDimensions } from 'react-native';

/** Reference phone (logical dp) the base sizes in every stylesheet were designed on. */
const BASE_W = 390;
const BASE_H = 844;
const MIN_SCALE = 0.85;
const MAX_SCALE = 1.5;
/** Scales are snapped to this step so stylesheets are cached per step, not per pixel of window size. */
const STEP = 0.05;

/** Turns a base (phone) size into the size for the current screen. */
export type Scaler = (n: number) => number;

/**
 * UI scale for a window: grows on tablets, shrinks a little on short phones. Limited by the
 * tighter axis so scaled layouts still fit vertically.
 */
export function scaleFor(width: number, height: number): number {
  const raw = Math.min(width / BASE_W, height / BASE_H);
  const clamped = Math.min(MAX_SCALE, Math.max(MIN_SCALE, raw));
  return Math.round(clamped / STEP) * STEP;
}

export function makeScaler(scale: number): Scaler {
  return (n) => Math.round(n * scale);
}

export function useScale(): { scale: number; s: Scaler } {
  const { width, height } = useWindowDimensions();
  const scale = scaleFor(width, height);
  return { scale, s: makeScaler(scale) };
}
