import path from 'node:path';
import {
  dailyParams,
  emptyStats,
  generateLevel,
  hashSeed,
  toLevel,
  validateLevel,
  type DailyBank,
  type GenParams,
  type Level,
} from '@ctd/core';
import { buildAll, type BuildConfig } from './build';
import { LEVELS_DIR, ROOT, listLevelFiles, loadLevelsFromFile, pad, readJson, writeIndex, writeJson } from './io';
import { renderLevel } from './show';

const HELP = `levelgen - Connect the Dots level generator

Usage:
  levelgen generate --size 7 --colors 6-8 [--walls 0-2] [--bridges 1] [--warps 1]
                    [--difficulty 35-50] [--count 20] [--seed 42] [--out levels/custom]
  levelgen build    --config tools/levelgen/levels.config.json [--pack 3]
  levelgen validate <dir|file>
  levelgen show     <file> [--solution]
  levelgen daily    --month 2026-10 [--out levels/daily]
  levelgen index    (regenerate levels/index.ts)
`;

function parseArgs(argv: string[]) {
  const positional: string[] = [];
  const flags: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else flags[key] = true;
    } else positional.push(a);
  }
  return { positional, flags };
}

function range(v: string | true | undefined): [number, number] | undefined {
  if (typeof v !== 'string') return undefined;
  const [a, b] = v.split('-').map(Number);
  return [a, b ?? a];
}

const resolve = (p: string) => (path.isAbsolute(p) ? p : path.resolve(process.cwd(), p));

function cmdGenerate(flags: Record<string, string | true>) {
  const size = Number(flags.size ?? 7);
  const params: Omit<GenParams, 'seed'> = {
    width: size,
    colors: range(flags.colors) ?? [Math.max(3, size - 2), size],
    walls: range(flags.walls),
    bridges: range(flags.bridges),
    warps: range(flags.warps),
    targetDifficulty: range(flags.difficulty),
    maxSolverTier: flags.tier ? Number(flags.tier) : 4,
  };
  const count = Number(flags.count ?? 1);
  const seed = Number(flags.seed ?? Date.now() % 100000);
  const out = resolve(String(flags.out ?? path.join(LEVELS_DIR, 'custom')));
  for (let i = 0; i < count; i++) {
    const stats = emptyStats();
    const p = { ...params, seed: hashSeed(seed, i) };
    const c = generateLevel(p, stats);
    if (!c) {
      console.error(`level ${i + 1}: failed after ${stats.attempts} attempts`, stats.rejects);
      continue;
    }
    const level = toLevel(c, { id: `custom-${pad(i + 1, 3)}`, pack: 0, index: i + 1, params: p });
    const file = path.join(out, `level-${pad(i + 1, 3)}.json`);
    writeJson(file, level);
    console.log(renderLevel(level));
    console.log(`→ ${path.relative(ROOT, file)}  (${stats.attempts} attempts)\n`);
  }
}

function cmdValidate(target: string) {
  const t = resolve(target);
  const files = t.endsWith('.json') ? [t] : listLevelFiles(t);
  let ok = 0;
  let bad = 0;
  for (const f of files) {
    for (const level of loadLevelsFromFile(f)) {
      const r = validateLevel(level);
      if (r.ok) ok++;
      else {
        bad++;
        console.error(`✗ ${level.id} (${path.relative(ROOT, f)}): ${r.errors.join('; ')}`);
      }
    }
  }
  console.log(`${ok} valid, ${bad} invalid`);
  if (bad) process.exit(1);
}

function cmdDaily(flags: Record<string, string | true>) {
  const month = String(flags.month ?? '');
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error('--month YYYY-MM is required');
  const [y, m] = month.split('-').map(Number);
  const days = new Date(y, m, 0).getDate();
  const bank: DailyBank = { month, levels: {} };
  for (let d = 1; d <= days; d++) {
    const key = `${month}-${pad(d)}`;
    const params = dailyParams(key);
    const c = generateLevel(params);
    if (!c) throw new Error(`daily ${key} failed`);
    bank.levels[key] = toLevel(c, { id: `daily-${key}`, pack: 0, index: d, params });
    process.stdout.write(`${key}: ${c.puzzle.size.width}x${c.puzzle.size.width} score=${c.difficulty.score}\n`);
  }
  const out = resolve(String(flags.out ?? path.join(LEVELS_DIR, 'daily')));
  writeJson(path.join(out, `${month}.json`), bank);
  writeIndex();
}

function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const { positional, flags } = parseArgs(rest);
  switch (cmd) {
    case 'generate':
      return cmdGenerate(flags);
    case 'build': {
      const config = readJson<BuildConfig>(resolve(String(flags.config ?? 'tools/levelgen/levels.config.json')));
      const packs = typeof flags.pack === 'string' ? flags.pack.split(',').map(Number) : undefined;
      return buildAll(config, { packs });
    }
    case 'validate':
      return cmdValidate(positional[0] ?? LEVELS_DIR);
    case 'show': {
      if (!positional[0]) throw new Error('show <file>');
      for (const level of loadLevelsFromFile(resolve(positional[0])) as Level[]) {
        console.log(renderLevel(level, !!flags.solution) + '\n');
      }
      return;
    }
    case 'daily':
      return cmdDaily(flags);
    case 'index':
      return writeIndex();
    default:
      console.log(HELP);
  }
}

main();
