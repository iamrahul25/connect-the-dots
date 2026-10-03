import type { Layer } from '@ctd/core';
import { useProgress, totalStars, type LevelRecord, type SavedBoard } from '../store/progress';
import { useSettings, type SettingsState } from '../store/settings';
import { isThemeId } from '../theme/config';

const APP_ID = 'connect-the-dots';
const FORMAT = 1;
/**
 * Mixed into the checksum so hand-edited files are rejected. It ships in the bundle, so this
 * deters casual tampering only; changing it invalidates every previously exported file.
 */
const CHECKSUM_SALT = 'ctd-save:7f3a91c2e54b';

const SETTING_KEYS = ['theme', 'music', 'sfx', 'haptics', 'colorblind', 'reduceMotion', 'idleHints'] as const;
const LAYERS: readonly Layer[] = ['n', 'h', 'v', 'ne', 'se', 'sw', 'nw'];

type SavedSettings = Pick<SettingsState, (typeof SETTING_KEYS)[number]>;

interface SavedProgress {
  levels: Record<string, LevelRecord>;
  hints: number;
  daily: {
    completed: Record<string, { stars: number; moves: number }>;
    streak: number;
    bestStreak: number;
    lastDate: string | null;
  };
  inProgress: Record<string, SavedBoard>;
  lastPlayed: string | null;
  completedPacks: number[];
}

export interface SaveData {
  progress: SavedProgress;
  settings: SavedSettings;
}

export interface SaveSummary {
  levelsSolved: number;
  stars: number;
  hints: number;
  dailySolved: number;
  exportedAt: string | null;
}

export type ParseResult = { ok: true; data: SaveData; summary: SaveSummary } | { ok: false; error: string };

/** JSON with object keys sorted, so the checksum doesn't depend on key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** cyrb53: fast 53-bit string hash, rendered as 14 hex chars. */
function hash(str: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}

function checksum(data: SaveData): string {
  return hash(`${CHECKSUM_SALT}|${FORMAT}|${canonical(data)}`);
}

function snapshot(): SaveData {
  const p = useProgress.getState();
  const s = useSettings.getState();
  const settings = {} as Record<string, unknown>;
  for (const k of SETTING_KEYS) settings[k] = s[k];
  return {
    progress: {
      levels: p.levels,
      hints: p.hints,
      daily: p.daily,
      inProgress: p.inProgress,
      lastPlayed: p.lastPlayed,
      completedPacks: p.completedPacks,
    },
    settings: settings as SavedSettings,
  };
}

/** Current progress and settings as a pretty-printed, checksummed JSON string. */
export function exportSaveData(): string {
  const data = snapshot();
  return JSON.stringify({ app: APP_ID, format: FORMAT, exportedAt: new Date().toISOString(), checksum: checksum(data), data }, null, 2);
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isInt = (v: unknown, min = 0): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min;
const isIntArray = (v: unknown): v is number[] => Array.isArray(v) && v.every((n) => isInt(n));
const isDateKey = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

function validLevel(v: unknown): v is LevelRecord {
  return (
    isObj(v) &&
    isInt(v.stars) &&
    v.stars <= 3 &&
    isInt(v.bestMoves) &&
    typeof v.solvedAt === 'number' &&
    typeof v.usedHint === 'boolean'
  );
}

function validBoard(v: unknown): v is SavedBoard {
  return (
    isObj(v) &&
    Array.isArray(v.paths) &&
    v.paths.every(isIntArray) &&
    isInt(v.moves) &&
    isIntArray(v.hinted) &&
    (v.orient === undefined || (Array.isArray(v.orient) && v.orient.every((o) => LAYERS.includes(o as Layer))))
  );
}

function validRecord<T>(v: unknown, item: (x: unknown) => x is T, key: (k: string) => boolean = () => true): v is Record<string, T> {
  return isObj(v) && Object.entries(v).every(([k, x]) => key(k) && item(x));
}

function validProgress(v: unknown): v is SavedProgress {
  if (!isObj(v) || !isObj(v.daily)) return false;
  const d = v.daily;
  return (
    validRecord(v.levels, validLevel) &&
    isInt(v.hints) &&
    validRecord(d.completed, (x): x is { stars: number; moves: number } => isObj(x) && isInt(x.stars) && x.stars <= 3 && isInt(x.moves), isDateKey) &&
    isInt(d.streak) &&
    isInt(d.bestStreak) &&
    (d.lastDate === null || isDateKey(d.lastDate)) &&
    validRecord(v.inProgress, validBoard) &&
    (v.lastPlayed === null || typeof v.lastPlayed === 'string') &&
    isIntArray(v.completedPacks)
  );
}

function validSettings(v: unknown): v is SavedSettings {
  if (!isObj(v) || typeof v.theme !== 'string' || !isThemeId(v.theme)) return false;
  return SETTING_KEYS.every((k) => k === 'theme' || typeof v[k] === 'boolean');
}

function summarize(data: SaveData, exportedAt: string | null): SaveSummary {
  const p = data.progress;
  return {
    levelsSolved: Object.keys(p.levels).length,
    stars: totalStars(p.levels),
    hints: p.hints,
    dailySolved: Object.keys(p.daily.completed).length,
    exportedAt,
  };
}

/** Parses and verifies pasted save JSON. Never touches the stores. */
export function parseSaveData(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) return { ok: false, error: 'Paste your save data first.' };
  let file: unknown;
  try {
    file = JSON.parse(trimmed);
  } catch {
    return { ok: false, error: "That isn't valid JSON. Make sure you pasted the whole save file." };
  }
  if (!isObj(file) || file.app !== APP_ID || !isObj(file.data)) {
    return { ok: false, error: "This doesn't look like a Connect the Dots save file." };
  }
  if (!isInt(file.format, 1) || file.format > FORMAT) {
    return { ok: false, error: 'This save was made by a newer version of the game. Update the app and try again.' };
  }
  const data = file.data as Record<string, unknown>;
  if (!validProgress(data.progress) || !validSettings(data.settings)) {
    return { ok: false, error: 'The save file is incomplete or damaged.' };
  }
  const save: SaveData = { progress: data.progress, settings: data.settings };
  if (typeof file.checksum !== 'string' || file.checksum !== checksum(save)) {
    return { ok: false, error: 'This save file has been modified and cannot be imported.' };
  }
  return { ok: true, data: save, summary: summarize(save, typeof file.exportedAt === 'string' ? file.exportedAt : null) };
}

/** Replaces all progress and the exported settings with `data`. */
export function applySaveData(data: SaveData): void {
  const p = data.progress;
  useProgress.setState({
    levels: p.levels,
    hints: p.hints,
    daily: p.daily,
    inProgress: p.inProgress,
    lastPlayed: p.lastPlayed,
    completedPacks: p.completedPacks,
  });
  useSettings.getState().set(data.settings);
}
