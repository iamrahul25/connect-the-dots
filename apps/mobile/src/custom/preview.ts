import { cellsToNodes, nodeCell, pieceStart, type BoardGraph, type CustomDraft, type Layer, type Level, type LevelDot, type LineDrag, type Puzzle, type Rotator, type Tunnel } from '@ctd/core';
import type { BoardSource } from '../board/Board';

function draftPuzzle(d: CustomDraft, dots: LevelDot[]): Puzzle {
  return {
    size: d.size,
    dots,
    walls: d.walls,
    bridges: d.bridges,
    warps: d.warps,
    teleporters: d.teleporters,
    tunnels: d.tunnels.map((cell) => ({ cell, start: (pieceStart(d, cell) ?? 'h') as Tunnel['start'] })),
    rotators: d.rotators.map((cell) => ({ cell, start: (pieceStart(d, cell) ?? 'ne') as Rotator['start'] })),
    locks: d.locks,
  };
}

/**
 * The draft as the board draws it: obstacles, the drawn lines with a dot at
 * each end, tunnels and rotators facing the way players first see them, and
 * doors open when a line goes through them. While dragging, the dragged line
 * shows from one square.
 */
export function editorSource(d: CustomDraft, g: BoardGraph, drag: LineDrag | null): BoardSource {
  const nodes = drag ? drag.view() : d.lines.map((l) => (l.length ? (cellsToNodes(g, l) ?? []) : []));
  const min = drag ? 1 : 2;
  const shown = nodes.flatMap((p, c) => (p.length >= min ? [c] : []));
  const paths = shown.map((c) => nodes[c]);
  const dots = paths.map((p, i) => ({ color: shown[i], start: nodeCell(g, p[0]), end: nodeCell(g, p[p.length - 1]) }));
  const orient = new Map<number, Layer>();
  const covered = new Set<number>();
  for (const p of paths) {
    for (const n of p) {
      covered.add(g.nodeCellIdx[n]);
      if (g.isOption[n]) orient.set(g.nodeCellIdx[n], g.nodeLayer[n]);
    }
  }
  const W = d.size.width;
  return {
    g,
    puzzle: draftPuzzle(d, dots),
    dragging: drag ? shown.indexOf(drag.color) : -1,
    view: () => paths,
    ghosts: () => paths.map(() => []),
    isComplete: (p, ps = paths) => (ps[p]?.length ?? 0) >= 2,
    orientationAt: ([r, c]) => {
      const i = r * W + c;
      const first = g.cellNodes[i]?.[0];
      if (first === undefined || !g.isOption[first]) return null;
      return pieceStart(d, [r, c], orient.get(i)) ?? g.nodeLayer[first];
    },
    doors: () => d.locks.map((l) => covered.has(l.door[0] * W + l.door[1])),
  };
}

/** A level-shaped stand-in for thumbnails of unfinished drafts (dots where lines end). */
export function draftThumbnail(d: CustomDraft): Level {
  const dots = d.lines.flatMap((l, color) => (l.length >= 2 ? [{ color, start: l[0], end: l[l.length - 1] }] : []));
  return { ...draftPuzzle(d, dots), id: 'draft', pack: 'custom', index: 0, formatVersion: 2 } as Level;
}

/** Highest color index + 1 used by a level, for sizing the palette. */
export function colorCount(level: Pick<Puzzle, 'dots'>): number {
  return level.dots.reduce((m, d) => Math.max(m, d.color + 1), 0);
}
