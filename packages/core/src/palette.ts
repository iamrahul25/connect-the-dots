/**
 * Default path palette, ordered so that the first N entries are the most
 * mutually distinct. Levels store indices into this list.
 */
export const DEFAULT_PALETTE = [
  '#FF5A6E', // red
  '#4DA3FF', // blue
  '#3DDC84', // green
  '#FFD23F', // yellow
  '#B76BFF', // purple
  '#FF8A3D', // orange
  '#2EE6E6', // cyan
  '#FF6FD8', // pink
  '#A6E22E', // lime
  '#8C6BFF', // indigo
  '#F5F5F5', // white
  '#C08457', // bronze
] as const;

export const MAX_COLORS = DEFAULT_PALETTE.length;

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** "Redmean" perceptual approximation, good enough for picking contrasting neighbors. */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  const rm = (r1 + r2) / 2;
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}
