import { buildCustomLevel, draftFromLevel, draftShapeError, type Level, type Uniqueness } from '@ctd/core';

export const LEVEL_FILE_FORMAT = 'connect-the-dots/level';
const LEVEL_FILE_VERSION = 1;
const MAX_NAME = 40;

/** The JSON people pass around: a wrapper with a name and author around the level itself. */
export interface SharedLevelFile {
  format: typeof LEVEL_FILE_FORMAT;
  version: number;
  name: string;
  author: string;
  level: Level;
}

export type ImportResult =
  | { ok: true; name: string; author: string; level: Level; uniqueness: Uniqueness }
  | { ok: false; error: string };

export function encodeSharedLevel(level: Level, name: string, author: string, pretty = false): string {
  const file: SharedLevelFile = { format: LEVEL_FILE_FORMAT, version: LEVEL_FILE_VERSION, name, author, level };
  return JSON.stringify(file, null, pretty ? 2 : undefined);
}

const cleanText = (v: unknown, fallback: string) =>
  typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, MAX_NAME) : fallback;

/**
 * Parses shared level JSON (the wrapper, or a bare level) and re-checks it with
 * the Level Creator's own rules, so a hand-edited or broken file can't load.
 * Runs the solver, so it can take a moment on big boards.
 */
export function importSharedLevel(text: string): ImportResult {
  let data: unknown;
  try {
    data = JSON.parse(text.trim());
  } catch {
    return { ok: false, error: "That isn't level data. Make sure you copied all of it." };
  }
  if (!data || typeof data !== 'object') return { ok: false, error: "That isn't level data." };
  const obj = data as Partial<SharedLevelFile> & Partial<Level>;
  let raw: Partial<Level>;
  let name = 'Shared level';
  let author = '';
  if (obj.format === LEVEL_FILE_FORMAT) {
    if (typeof obj.version === 'number' && obj.version > LEVEL_FILE_VERSION) {
      return { ok: false, error: 'This level was made with a newer version of the game. Update the app to play it.' };
    }
    raw = obj.level ?? {};
    name = cleanText(obj.name, name);
    author = cleanText(obj.author, '');
  } else {
    raw = obj;
  }
  if (!raw.size || !Array.isArray(raw.dots) || !raw.solution) return { ok: false, error: "That isn't level data." };
  const draft = draftFromLevel(raw as Level);
  const shape = draft ? draftShapeError(draft) : 'Level data is incomplete';
  if (!draft || shape) return { ok: false, error: `This level is broken: ${shape}.` };
  const built = buildCustomLevel(draft);
  if (!built.ok) return { ok: false, error: `This level isn't playable: ${built.issue.message}.` };
  return { ok: true, name, author, level: built.level, uniqueness: built.uniqueness };
}

/** `My Level!` → `my-level.json` */
export function levelFileName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return `${slug || 'level'}.json`;
}
