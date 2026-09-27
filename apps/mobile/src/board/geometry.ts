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

export function makeGeom(W: number, H: number, size: number): BoardGeom {
  const pad = Math.max(10, size * 0.04);
  const cell = (size - pad * 2) / Math.max(W, H);
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
