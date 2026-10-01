import type { Cell } from '@ctd/core';

export interface BoardGeom {
  size: number;
  pad: number;
  cell: number;
  ox: number;
  oy: number;
  W: number;
  H: number;
}

/** Inset between a tile's edge and the inner edge of the board border. */
export const BORDER_INSET = 5;

/** Tile gap inside each cell; Board draws tiles with this inset. */
export function cellGapPx(cell: number, cellGap: number): number {
  return Math.max(1.5, cell * cellGap);
}

/**
 * Without `frame` the board keeps a margin wide enough for warp portals.
 * With `frame` the margin only fits the border, so it touches the canvas edge.
 */
export function makeGeom(W: number, H: number, size: number, frame?: { borderWidth: number; cellGap: number }): BoardGeom {
  const n = Math.max(W, H);
  const pad = frame
    ? Math.max(0, frame.borderWidth + BORDER_INSET - cellGapPx(size / n, frame.cellGap))
    : Math.max(10, size * 0.04);
  const cell = (size - pad * 2) / n;
  return {
    size,
    pad,
    cell,
    ox: pad + ((Math.max(W, H) - W) * cell) / 2,
    oy: pad + ((Math.max(W, H) - H) * cell) / 2,
    W,
    H,
  };
}

export function cellCenter(g: BoardGeom, r: number, c: number): [number, number] {
  return [g.ox + (c + 0.5) * g.cell, g.oy + (r + 0.5) * g.cell];
}

/** Cell under a point, unclamped (may be outside the grid). */
export function cellAtRaw(g: BoardGeom, x: number, y: number): Cell {
  return [Math.floor((y - g.oy) / g.cell), Math.floor((x - g.ox) / g.cell)];
}

export function clampCell(g: BoardGeom, [r, c]: Cell): Cell {
  return [Math.max(0, Math.min(g.H - 1, r)), Math.max(0, Math.min(g.W - 1, c))];
}
