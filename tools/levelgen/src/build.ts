import path from 'node:path';
import fs from 'node:fs';
import {
  canonicalKey,
  emptyStats,
  hashSeed,
  toLevel,
  type Candidate,
  type GenParams,
  type Manifest,
} from '@ctd/core';
import { LEVELS_DIR, levelFile, levelId, readJson, writeIndex, writeJson } from './io';
import { AttemptPool, defaultWorkerCount } from './pool';

type Count = number | [number, number];

export interface GroupConfig {
  /** Level indices within the pack, 1-based and inclusive. */
  range: [number, number];
  /** Board width; also the height unless `height` is set. */
  size: number;
  height?: number;
  colors: [number, number];
  difficulty: [number, number];
  walls?: Count;
  bridges?: Count;
  warps?: Count;
  teleporters?: Count;
  tunnels?: Count;
  rotators?: Count;
  locks?: Count;
  maxSolverTier?: number;
  /** Generation attempts per level in the group (default 250). */
  attemptsPerLevel?: number;
  tutorial?: boolean;
  introduces?: string;
  showcase?: boolean;
}

export interface PackConfig {
  id: number;
  name: string;
  theme: string;
  /** Built and validated, but left out of manifest.json / index.ts (the app can't render it yet). */
  hidden?: boolean;
  groups: GroupConfig[];
}

export interface BuildConfig {
  generatorVersion: string;
  packs: PackConfig[];
}

export const packLength = (pack: PackConfig) => Math.max(...pack.groups.map((g) => g.range[1]));

function groupParams(g: GroupConfig, seed: number): GenParams {
  return {
    seed,
    width: g.size,
    ...(g.height !== undefined && { height: g.height }),
    colors: g.colors,
    walls: g.walls,
    bridges: g.bridges,
    warps: g.warps,
    teleporters: g.teleporters,
    tunnels: g.tunnels,
    rotators: g.rotators,
    locks: g.locks,
    maxSolverTier: g.maxSolverTier ?? 4,
    targetDifficulty: g.difficulty,
  };
}

const inBand = (c: Candidate, band: [number, number]) =>
  c.difficulty.score >= band[0] && c.difficulty.score <= band[1];
const dist = (c: Candidate, band: [number, number]) =>
  c.difficulty.score < band[0] ? band[0] - c.difficulty.score : Math.max(0, c.difficulty.score - band[1]);

/** Picks `count` candidates spread across the band, falling back to the closest ones. */
function select(pool: Candidate[], count: number, band: [number, number], preferHard: boolean): Candidate[] {
  let good = pool.filter((c) => inBand(c, band)).sort((a, b) => a.difficulty.score - b.difficulty.score);
  // Prefer levels whose tunnels / rotators / locks actually matter for the logic.
  const bearing = good.filter((c) => c.loadBearing !== false);
  if (bearing.length >= count) good = bearing;
  let chosen: Candidate[];
  if (good.length >= count) {
    chosen = [];
    for (let i = 0; i < count; i++) {
      const idx = count === 1 ? (preferHard ? good.length - 1 : Math.floor(good.length / 2)) : Math.round((i * (good.length - 1)) / (count - 1));
      chosen.push(good[idx]);
    }
    chosen = [...new Set(chosen)];
    for (const c of good) if (chosen.length < count && !chosen.includes(c)) chosen.push(c);
  } else {
    const rest = pool.filter((c) => !inBand(c, band)).sort((a, b) => dist(a, band) - dist(b, band));
    chosen = [...good, ...rest.slice(0, count - good.length)];
  }
  return chosen.sort((a, b) => a.difficulty.score - b.difficulty.score);
}

/**
 * Sawtooth ordering: within each block of 5 the difficulty ramps up and the
 * 5th level is a breather, except blocks ending on a multiple of 10, whose
 * last level is a harder "showcase". Mechanic intros start with the easiest.
 */
function sawtooth(sorted: Candidate[], firstLevel: number, g: GroupConfig): Candidate[] {
  const out: Candidate[] = [];
  for (let i = 0; i < sorted.length; i += 5) {
    const block = sorted.slice(i, i + 5);
    const lastLevel = firstLevel + i + block.length - 1;
    const ascending = block.length < 5 || lastLevel % 10 === 0 || g.tutorial || (g.introduces && i === 0);
    out.push(...(ascending ? block : [...block.slice(1), block[0]]));
  }
  return out;
}

export interface BuildOptions {
  packs?: number[];
  /** Only groups that start inside this range of level indices. */
  levels?: [number, number];
  /** Regenerate groups whose level files already exist (by default they are kept as they are). */
  force?: boolean;
  /** Worker threads running generation attempts (default: one per logical CPU). */
  workers?: number;
  log?: (msg: string) => void;
}

const groupIndices = (g: GroupConfig) => Array.from({ length: g.range[1] - g.range[0] + 1 }, (_, i) => g.range[0] + i);

export async function buildAll(config: BuildConfig, opts: BuildOptions = {}): Promise<void> {
  const log = opts.log ?? console.log;
  const todo = new Map<PackConfig, GroupConfig[]>();
  for (const pack of config.packs) {
    if (opts.packs && !opts.packs.includes(pack.id)) continue;
    const groups = pack.groups.filter(
      (g) =>
        (!opts.levels || (g.range[0] >= opts.levels[0] && g.range[0] <= opts.levels[1])) &&
        (opts.force || groupIndices(g).some((i) => !fs.existsSync(levelFile(pack.id, i)))),
    );
    if (groups.length) todo.set(pack, groups);
  }

  // Seed the dedupe set with every level that is not being regenerated.
  const seen = new Set<string>();
  for (const pack of config.packs) {
    const rebuilt = new Set((todo.get(pack) ?? []).flatMap(groupIndices));
    for (let i = 1; i <= packLength(pack); i++) {
      const f = levelFile(pack.id, i);
      if (!rebuilt.has(i) && fs.existsSync(f)) seen.add(canonicalKey(readJson(f)));
    }
  }

  if (todo.size) {
    const workers = new AttemptPool(opts.workers ?? defaultWorkerCount());
    log(`using ${workers.size} worker threads`);
    try {
      for (const [pack, groups] of todo) {
        for (const g of groups) await buildGroup(workers, pack, g, seen, log);
      }
    } finally {
      await workers.close();
    }
  }
  writeManifest(config);
  writeIndex();
}

async function buildGroup(
  workers: AttemptPool,
  pack: PackConfig,
  g: GroupConfig,
  seen: Set<string>,
  log: (msg: string) => void,
): Promise<void> {
  const count = g.range[1] - g.range[0] + 1;
  const target = count * 3;
  const maxAttempts = count * (g.attemptsPerLevel ?? 250);
  const pool: Candidate[] = [];
  const found = new Map<Candidate, { attempt: number; atMs: number; ms: number }>();
  let good = 0;
  const stats = emptyStats();
  const t0 = Date.now();
  const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
  log(`pack ${pack.id} levels ${g.range[0]}-${g.range[1]} (${g.size}x${g.height ?? g.size}): up to ${maxAttempts} attempts`);
  await workers.run(
    groupParams(g, 0),
    (a) => hashSeed('pack', pack.id, 'group', g.range[0], a),
    maxAttempts,
    ({ candidate: c, reject, ms }, attempt) => {
      stats.attempts++;
      if (!c) {
        if (reject) stats.rejects[reject]++;
        return false;
      }
      const key = canonicalKey(c.puzzle);
      if (seen.has(key)) return false;
      seen.add(key);
      pool.push(c);
      found.set(c, { attempt, atMs: Date.now() - t0, ms });
      const ok = inBand(c, g.difficulty) && c.loadBearing !== false;
      if (ok) good++;
      log(
        `  candidate ${pool.length} at ${secs(Date.now() - t0)} (attempt ${attempt + 1}/${maxAttempts}, ` +
          `score ${c.difficulty.score}${ok ? '' : ', outside band or not load-bearing'})`,
      );
      return good >= target;
    },
  );
  const chosen = sawtooth(select(pool, count, g.difficulty, !!g.showcase), g.range[0], g);
  if (chosen.length < count) throw new Error(`group ${g.range.join('-')}: only ${chosen.length}/${count} levels`);
  chosen.forEach((c, i) => {
    const index = g.range[0] + i;
    const level = toLevel(c, {
      id: levelId(pack.id, index),
      pack: pack.id,
      index,
      params: groupParams(g, c.seed),
    });
    writeJson(levelFile(pack.id, index), { $schema: '../schema/level.schema.json', ...level });
    const f = found.get(c)!;
    log(
      `  ${level.id}: score ${c.difficulty.score}, found after ${secs(f.atMs)} ` +
        `(attempt ${f.attempt + 1}, ${secs(f.ms)} compute for that attempt)`,
    );
  });
  const scores = chosen.map((c) => c.difficulty.score).join(', ');
  const bearing = chosen.filter((c) => c.loadBearing).length;
  log(
    `pack ${pack.id} levels ${g.range[0]}-${g.range[1]} (${g.size}x${g.height ?? g.size}): ${stats.attempts} attempts, ` +
      `${pool.length} candidates, ${((Date.now() - t0) / 1000).toFixed(1)}s  scores: ${scores}` +
      (chosen.some((c) => c.loadBearing !== undefined) ? `  load-bearing: ${bearing}/${count}` : '') +
      `  rejects: ${JSON.stringify(stats.rejects)}`,
  );
}

export function writeManifest(config: BuildConfig): void {
  const manifest: Manifest = {
    formatVersion: 1,
    packs: config.packs
      .filter((p) => !p.hidden)
      .map((p) => ({
        id: p.id,
        name: p.name,
        theme: p.theme,
        levels: Array.from({ length: packLength(p) }, (_, i) => levelId(p.id, i + 1)),
      })),
  };
  writeJson(path.join(LEVELS_DIR, 'manifest.json'), manifest);
}
