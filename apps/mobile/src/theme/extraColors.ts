import type { DotStyle, Palette } from './config';

const GOLDEN_ANGLE = 137.508;
const cache = new WeakMap<Palette, Map<number, Palette>>();

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function generated(i: number): DotStyle {
  const hue = (i * GOLDEN_ANGLE + 20) % 360;
  // Alternate lightness bands so neighbours on the hue wheel still read apart.
  const band = [0.5, 0.38, 0.62][i % 3];
  const dot = hslToHex(hue, 0.78, band);
  const v = parseInt(dot.slice(1), 16);
  return {
    slot: `extra-${i}`,
    dot,
    line: hslToHex(hue, 0.85, Math.min(0.72, band + 0.1)),
    cellFill: `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},0.13)`,
  };
}

/** The theme palette with generated colors appended, for handcrafted levels using more colors than a theme has. */
export function extendPalette(palette: Palette, count: number): Palette {
  if (count <= palette.length) return palette;
  let byCount = cache.get(palette);
  if (!byCount) {
    byCount = new Map();
    cache.set(palette, byCount);
  }
  let out = byCount.get(count);
  if (!out) {
    out = [...palette, ...Array.from({ length: count - palette.length }, (_, i) => generated(i))];
    byCount.set(count, out);
  }
  return out;
}
