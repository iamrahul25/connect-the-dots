import { DEFAULT_PALETTE, type Level } from '@ctd/core';

const ansi = (hex: string, text: string, bg = false) => {
  const v = parseInt(hex.slice(1), 16);
  return `\x1b[${bg ? 48 : 38};2;${(v >> 16) & 255};${(v >> 8) & 255};${v & 255}m${text}\x1b[0m`;
};

/** Renders a level in the terminal with truecolor ANSI codes. */
export function renderLevel(level: Level, withSolution = false): string {
  const { width: W, height: H } = level.size;
  const grid: string[][] = Array.from({ length: H }, () => Array.from({ length: W }, () => ' · '));
  if (withSolution) {
    Object.entries(level.solution).forEach(([k, cells]) => {
      const hex = DEFAULT_PALETTE[level.dots[Number(k)].color];
      for (const [r, c] of cells) grid[r][c] = ansi(hex, '   ', true);
    });
  }
  for (const [r, c] of level.walls) grid[r][c] = '███';
  for (const [r, c] of level.bridges) grid[r][c] = withSolution ? grid[r][c].replace('   ', ' + ') : ' + ';
  level.dots.forEach((d, i) => {
    const hex = DEFAULT_PALETTE[d.color];
    const ch = String.fromCharCode(65 + i);
    for (const [r, c] of [d.start, d.end]) grid[r][c] = withSolution ? ansi('#000000', ansi(hex, ` ${ch} `, true)) : ansi(hex, ` ${ch} `);
  });
  const warpRows = new Set(level.warps.filter((w) => w.axis === 'row').map((w) => w.index));
  const warpCols = new Set(level.warps.filter((w) => w.axis === 'col').map((w) => w.index));
  const top = '   ' + Array.from({ length: W }, (_, c) => (warpCols.has(c) ? ' ⇅ ' : '   ')).join('');
  const lines = [top];
  for (let r = 0; r < H; r++) {
    const m = warpRows.has(r) ? '⇆' : ' ';
    lines.push(` ${m} ${grid[r].join('')} ${m}`);
  }
  lines.push(top);
  const d = level.difficulty;
  lines.push(
    `${level.id}  ${W}x${H}  colors=${level.dots.length}  score=${d.score} (${d.band})  tier=${d.metrics.maxSolverTier}  ` +
      `walls=${level.walls.length} bridges=${level.bridges.length} warps=${level.warps.length}`,
  );
  return lines.join('\n');
}
