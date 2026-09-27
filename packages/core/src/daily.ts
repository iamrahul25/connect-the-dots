import { hashSeed } from './rng';
import type { GenParams } from './generator';

/** Monday (easy) through Sunday (expert). Index = JS getDay() (0 = Sunday). */
const WEEKDAY_PARAMS: Omit<GenParams, 'seed'>[] = [
  { width: 10, colors: [8, 10], bridges: 1, warps: 1, targetDifficulty: [55, 80] }, // Sun
  { width: 6, colors: [5, 6], targetDifficulty: [10, 25] }, // Mon
  { width: 7, colors: [6, 7], targetDifficulty: [18, 32] }, // Tue
  { width: 7, colors: [5, 7], walls: [1, 3], targetDifficulty: [22, 38] }, // Wed
  { width: 8, colors: [6, 8], bridges: 1, targetDifficulty: [30, 45] }, // Thu
  { width: 8, colors: [6, 8], warps: 1, targetDifficulty: [34, 50] }, // Fri
  { width: 9, colors: [7, 9], walls: [0, 2], bridges: 1, targetDifficulty: [42, 60] }, // Sat
];

export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** YYYY-MM-DD in local time. */
export function dateKey(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function dailyParams(key: string): GenParams {
  const weekday = parseDateKey(key).getDay();
  return { ...WEEKDAY_PARAMS[weekday], seed: hashSeed('daily', key), maxAttempts: 400 };
}
