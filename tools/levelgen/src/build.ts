import path from 'node:path';
import fs from 'node:fs';
import {
  canonicalKey,
  emptyStats,
  hashSeed,
  obstaclesOf,
  OBSTACLES,
  packIdFor,
  packLevelId,
  sameObstacles,
  toLevel,
  type Candidate,
  type GenParams,
  type Level,
  type Manifest,
  type Obstacle,
  type SuiteId,
} from '@ctd/core';
import { existingLevelCount, LEVEL_SCHEMA_REF, LEVELS_DIR, levelFile, readJson, writeIndex, writeJson } from './io';
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
  /** For `single` / `multi` packs this must be `packIdFor(obstacles)`. */
  id: string;
  name: string;
  theme: string;
  obstacles: Obstacle[];
  /** Built and validated, but left out of manifest.json / index.ts (the app can't render it yet). */
  hidden?: boolean;
  /** Recipes for levels to generate. Level files already on disk are kept, so groups only need to cover new levels. */
  groups: GroupConfig[];
}

export interface SuiteConfig {
  id: SuiteId;
  name: string;
  packs: PackConfig[];
}

export interface BuildConfig {
  generatorVersion: string;
  suites: SuiteConfig[];
}

interface PackRef {
  suite: SuiteConfig;
  pack: PackConfig;
}

const packRefs = (config: BuildConfig): PackRef[] => config.suites.flatMap((suite) => suite.packs.map((pack) => ({ suite, pack })));

/** Generated suites guarantee every level uses exactly the pack's obstacle types; handcrafted packs may mix freely. */
const isExact = (suite: SuiteConfig) => suite.id !== 'handcrafted';

export const packLength = ({ suite, pack }: PackRef) =>
  Math.max(existingLevelCount(suite.id, pack.id), ...pack.groups.map((g) => g.range[1]));

const countMin = (c: Count | undefined) => (c === undefined ? 0 : typeof c === 'number' ? c : c[0]);
const countMax = (c: Count | undefined) => (c === undefined ? 0 : typeof c === 'number' ? c : c[1]);

/** Rejects recipes that could produce a level outside the pack's obstacle set. */
export function checkConfig(config: BuildConfig): void {
  const ids = new Set<string>();
  for (const { suite, pack } of packRefs(config)) {
    if (ids.has(pack.id)) throw new Error(`duplicate pack id "${pack.id}"`);
    ids.add(pack.id);
    if (!isExact(suite)) continue;
    if (pack.id !== packIdFor(pack.obstacles)) throw new Error(`pack "${pack.id}" should be named "${packIdFor(pack.obstacles)}"`);
    if (suite.id === 'single' && pack.obstacles.length > 1) throw new Error(`single-obstacle pack "${pack.id}" lists ${pack.obstacles.length} obstacles`);
    if (suite.id === 'multi' && pack.obstacles.length < 2) throw new Error(`multi-obstacle pack "${pack.id}" lists fewer than 2 obstacles`);
    for (const g of pack.groups) {
      for (const o of OBSTACLES) {
        const wanted = pack.obstacles.includes(o);
        if (wanted && countMin(g[o]) < 1) throw new Error(`pack "${pack.id}" levels ${g.range.join('-')}: ${o} needs at least 1`);
        if (!wanted && countMax(g[o]) > 0) throw new Error(`pack "${pack.id}" levels ${g.range.join('-')}: ${o} is not part of this pack`);
      }
    }
  }
}

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
  /** Pack ids, e.g. `walls-bridges`. */
  packs?: string[];
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
  checkConfig(config);
  const refs = packRefs(config);
  const unknown = opts.packs?.filter((id) => !refs.some((r) => r.pack.id === id));
  if (unknown?.length) throw new Error(`unknown pack id(s): ${unknown.join(', ')}`);
  const todo = new Map<PackRef, GroupConfig[]>();
  for (const ref of refs) {
    const { suite, pack } = ref;
    if (opts.packs && !opts.packs.includes(pack.id)) continue;
    const groups = pack.groups.filter(
      (g) =>
        (!opts.levels || (g.range[0] >= opts.levels[0] && g.range[0] <= opts.levels[1])) &&
        (opts.force || groupIndices(g).some((i) => !fs.existsSync(levelFile(suite.id, pack.id, i)))),
    );
    if (groups.length) todo.set(ref, groups);
  }

  // Seed the dedupe set with every level that is not being regenerated.
  const seen = new Set<string>();
  for (const ref of refs) {
    const rebuilt = new Set((todo.get(ref) ?? []).flatMap(groupIndices));
    for (let i = 1; i <= packLength(ref); i++) {
      const f = levelFile(ref.suite.id, ref.pack.id, i);
      if (!rebuilt.has(i) && fs.existsSync(f)) seen.add(canonicalKey(readJson(f)));
    }
  }

  if (todo.size) {
    const workers = new AttemptPool(opts.workers ?? defaultWorkerCount());
    log(`using ${workers.size} worker threads`);
    try {
      for (const [ref, groups] of todo) {
        for (const g of groups) await buildGroup(workers, ref, g, seen, log);
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
  { suite, pack }: PackRef,
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
  let mismatched = 0;
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
      // The board builder can silently place fewer obstacles than asked for, dropping a type entirely.
      if (isExact(suite) && !sameObstacles(obstaclesOf(c.puzzle), pack.obstacles)) {
        mismatched++;
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
      id: packLevelId(pack.id, index),
      pack: pack.id,
      index,
      params: groupParams(g, c.seed),
    });
    writeJson(levelFile(suite.id, pack.id, index), { $schema: LEVEL_SCHEMA_REF, ...level });
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
      `  rejects: ${JSON.stringify({ ...stats.rejects, wrongObstacles: mismatched })}`,
  );
}

/**
 * Lists every level file on disk (packs without any are kept as "coming soon") and
 * checks each one sits in a pack whose obstacle types it matches exactly.
 */
export function writeManifest(config: BuildConfig): void {
  checkConfig(config);
  const manifest: Manifest = {
    formatVersion: 2,
    suites: config.suites.map((suite) => ({
      id: suite.id,
      name: suite.name,
      packs: suite.packs
        .filter((p) => !p.hidden)
        .map((p) => {
          const levels = Array.from({ length: existingLevelCount(suite.id, p.id) }, (_, i) => {
            const id = packLevelId(p.id, i + 1);
            const level = readJson<Level>(levelFile(suite.id, p.id, i + 1));
            if (level.id !== id) throw new Error(`${levelFile(suite.id, p.id, i + 1)}: id is "${level.id}", expected "${id}"`);
            if (isExact(suite) && !sameObstacles(obstaclesOf(level), p.obstacles)) {
              throw new Error(`${id} uses [${obstaclesOf(level).join(', ')}], which does not match pack "${p.id}"`);
            }
            return id;
          });
          return { id: p.id, name: p.name, theme: p.theme, obstacles: p.obstacles, levels };
        }),
    })),
  };
  writeJson(path.join(LEVELS_DIR, 'manifest.json'), manifest);
}
