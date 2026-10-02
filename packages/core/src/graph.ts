import type { Cell, Lock, Puzzle, Teleporter, Warp } from './types';

/** `n` normal; `h`/`v` bridge or tunnel lanes; `ne`/`se`/`sw`/`nw` rotator orientations. */
export type Layer = 'n' | 'h' | 'v' | 'ne' | 'se' | 'sw' | 'nw';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type CellKind = 'cell' | 'wall' | 'bridge' | 'tunnel' | 'rotator';

export const TUNNEL_LAYERS = ['h', 'v'] as const;
/** Clockwise, so tapping a rotator advances one step through this list. */
export const ROTATOR_LAYERS = ['ne', 'se', 'sw', 'nw'] as const;

/** Sides of the cell each layer connects. */
export const PORTS: Record<Layer, Direction[]> = {
  n: ['up', 'down', 'left', 'right'],
  h: ['left', 'right'],
  v: ['up', 'down'],
  ne: ['up', 'right'],
  se: ['down', 'right'],
  sw: ['down', 'left'],
  nw: ['up', 'left'],
};

export const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export interface BoardSpec {
  width: number;
  height: number;
  walls: Cell[];
  bridges: Cell[];
  warps: Warp[];
  teleporters?: Teleporter[];
  tunnels?: Cell[];
  rotators?: Cell[];
  locks?: Lock[];
}

/**
 * The board as a graph. Walls are removed nodes, bridge cells are split into a
 * horizontal (`h`) and vertical (`v`) node, and warps add wrap-around edges.
 * Tunnels and rotators are "option cells": one node per orientation, of which
 * exactly one is used. Teleporter gates are normal nodes joined by an extra
 * edge that a path through either gate must take.
 */
export interface BoardGraph {
  width: number;
  height: number;
  nodeCount: number;
  nodeRow: number[];
  nodeCol: number[];
  nodeLayer: Layer[];
  /** Cell index (`r * width + c`) of each node. */
  nodeCellIdx: number[];
  adj: number[][];
  /** Node ids per cell index: [] for walls, [h, v] for bridges and tunnels, 4 nodes for rotators. */
  cellNodes: number[][];
  cellKind: CellKind[];
  isWall: boolean[];
  isBridge: boolean[];
  warpRows: boolean[];
  warpCols: boolean[];
  /** True for nodes of tunnel and rotator cells. */
  isOption: boolean[];
  /** Cell indices of tunnels and rotators. */
  optionCells: number[];
  /** Fill unit per node: option cells share one unit, every other node is its own unit. */
  nodeUnit: number[];
  unitCount: number;
  /** Teleporter partner node, -1 for non-gates. */
  partner: number[];
  /** Key and door node per lock. */
  locks: { key: number; door: number }[];
}

const DIRS: { d: Direction; dr: number; dc: number }[] = [
  { d: 'up', dr: -1, dc: 0 },
  { d: 'down', dr: 1, dc: 0 },
  { d: 'left', dr: 0, dc: -1 },
  { d: 'right', dr: 0, dc: 1 },
];

export function specOf(p: Puzzle): BoardSpec {
  return {
    width: p.size.width,
    height: p.size.height,
    walls: p.walls,
    bridges: p.bridges,
    warps: p.warps,
    teleporters: p.teleporters ?? [],
    tunnels: (p.tunnels ?? []).map((t) => t.cell),
    rotators: (p.rotators ?? []).map((t) => t.cell),
    locks: p.locks ?? [],
  };
}

export function buildGraph(spec: BoardSpec): BoardGraph {
  const { width: W, height: H } = spec;
  const cellKind = new Array<CellKind>(W * H).fill('cell');
  const warpRows = new Array<boolean>(H).fill(false);
  const warpCols = new Array<boolean>(W).fill(false);
  for (const [r, c] of spec.walls) cellKind[r * W + c] = 'wall';
  for (const [r, c] of spec.bridges) cellKind[r * W + c] = 'bridge';
  for (const [r, c] of spec.tunnels ?? []) cellKind[r * W + c] = 'tunnel';
  for (const [r, c] of spec.rotators ?? []) cellKind[r * W + c] = 'rotator';
  for (const w of spec.warps) {
    if (w.axis === 'row') warpRows[w.index] = true;
    else warpCols[w.index] = true;
  }

  const nodeRow: number[] = [];
  const nodeCol: number[] = [];
  const nodeLayer: Layer[] = [];
  const nodeCellIdx: number[] = [];
  const nodeUnit: number[] = [];
  const cellNodes: number[][] = [];
  const optionCells: number[] = [];
  let units = 0;
  const addNodes = (r: number, c: number, layers: readonly Layer[], shared: boolean) => {
    const ids: number[] = [];
    for (const l of layers) {
      ids.push(nodeRow.length);
      nodeRow.push(r);
      nodeCol.push(c);
      nodeLayer.push(l);
      nodeCellIdx.push(r * W + c);
      nodeUnit.push(shared ? units : units++);
    }
    if (shared) units++;
    cellNodes.push(ids);
  };
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const kind = cellKind[r * W + c];
      if (kind === 'wall') cellNodes.push([]);
      else if (kind === 'bridge') addNodes(r, c, ['h', 'v'], false);
      else if (kind === 'tunnel') addNodes(r, c, TUNNEL_LAYERS, true);
      else if (kind === 'rotator') addNodes(r, c, ROTATOR_LAYERS, true);
      else addNodes(r, c, ['n'], false);
      if (kind === 'tunnel' || kind === 'rotator') optionCells.push(r * W + c);
    }
  }

  const nodeCount = nodeRow.length;
  const adj: number[][] = Array.from({ length: nodeCount }, () => []);
  const isOption = nodeCellIdx.map((i) => cellKind[i] === 'tunnel' || cellKind[i] === 'rotator');
  const g: BoardGraph = {
    width: W,
    height: H,
    nodeCount,
    nodeRow,
    nodeCol,
    nodeLayer,
    nodeCellIdx,
    adj,
    cellNodes,
    cellKind,
    isWall: cellKind.map((k) => k === 'wall'),
    isBridge: cellKind.map((k) => k === 'bridge'),
    warpRows,
    warpCols,
    isOption,
    optionCells,
    nodeUnit,
    unitCount: units,
    partner: new Array<number>(nodeCount).fill(-1),
    locks: [],
  };

  const link = (a: number, b: number) => {
    if (!adj[a].includes(b)) {
      adj[a].push(b);
      adj[b].push(a);
    }
  };
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const i = r * W + c;
      if (cellKind[i] === 'wall') continue;
      for (const dir of DIRS) {
        const nb = neighborCell(g, r, c, dir.d);
        if (!nb) continue;
        const j = nb[0] * W + nb[1];
        if (cellKind[j] === 'wall' || j === i) continue;
        const back = OPPOSITE[dir.d];
        for (const a of cellNodes[i]) {
          if (!PORTS[nodeLayer[a]].includes(dir.d)) continue;
          for (const b of cellNodes[j]) if (PORTS[nodeLayer[b]].includes(back)) link(a, b);
        }
      }
    }
  }
  for (const t of spec.teleporters ?? []) {
    const a = cellNodes[t.a[0] * W + t.a[1]][0];
    const b = cellNodes[t.b[0] * W + t.b[1]][0];
    g.partner[a] = b;
    g.partner[b] = a;
    link(a, b);
  }
  g.locks = (spec.locks ?? []).map((l) => ({
    key: cellNodes[l.key[0] * W + l.key[1]][0],
    door: cellNodes[l.door[0] * W + l.door[1]][0],
  }));
  return g;
}

export function neighborCell(g: BoardGraph, r: number, c: number, d: Direction): Cell | null {
  const dir = DIRS.find((x) => x.d === d)!;
  let nr = r + dir.dr;
  let nc = c + dir.dc;
  if (nr >= 0 && nr < g.height && nc >= 0 && nc < g.width) return [nr, nc];
  if (dir.dr === 0 && g.warpRows[r]) nc = (nc + g.width) % g.width;
  else if (dir.dc === 0 && g.warpCols[c]) nr = (nr + g.height) % g.height;
  else return null;
  return [nr, nc];
}

export function cellIndex(g: BoardGraph, r: number, c: number): number {
  return r * g.width + c;
}

export function nodeCell(g: BoardGraph, n: number): Cell {
  return [g.nodeRow[n], g.nodeCol[n]];
}

export function sameCell(g: BoardGraph, n: number, cell: Cell): boolean {
  return g.nodeRow[n] === cell[0] && g.nodeCol[n] === cell[1];
}

export function inBounds(g: BoardGraph, cell: Cell): boolean {
  return cell[0] >= 0 && cell[0] < g.height && cell[1] >= 0 && cell[1] < g.width;
}

export function nodesAt(g: BoardGraph, cell: Cell): number[] {
  if (!inBounds(g, cell)) return [];
  return g.cellNodes[cell[0] * g.width + cell[1]];
}

/** True when the edge a-b joins two teleporter gates. */
export function isTeleportStep(g: BoardGraph, a: number, b: number): boolean {
  return g.partner[a] === b;
}

/** True when the edge a-b crosses the board boundary via a warp. */
export function isWarpStep(g: BoardGraph, a: number, b: number): boolean {
  const dr = Math.abs(g.nodeRow[a] - g.nodeRow[b]);
  const dc = Math.abs(g.nodeCol[a] - g.nodeCol[b]);
  return dr + dc > 1 && g.partner[a] !== b;
}

/** Direction of travel from node a to adjacent node b (warp-aware; meaningless for teleports). */
export function stepDirection(g: BoardGraph, a: number, b: number): Direction {
  const dr = g.nodeRow[b] - g.nodeRow[a];
  const dc = g.nodeCol[b] - g.nodeCol[a];
  if (dr === 0) {
    if (Math.abs(dc) === 1) return dc > 0 ? 'right' : 'left';
    return dc > 0 ? 'left' : 'right';
  }
  if (Math.abs(dr) === 1) return dr > 0 ? 'down' : 'up';
  return dr > 0 ? 'up' : 'down';
}

/** Layer of the cell-local piece that a path entering via `from` and leaving via `to` uses. */
export function layerFor(inSide: Direction, outSide: Direction): Layer {
  const s = new Set([inSide, outSide]);
  if (s.has('left') && s.has('right')) return 'h';
  if (s.has('up') && s.has('down')) return 'v';
  if (s.has('up')) return s.has('right') ? 'ne' : 'nw';
  return s.has('right') ? 'se' : 'sw';
}

/**
 * Converts an ordered list of cells into graph nodes, resolving bridge lanes
 * and tunnel / rotator orientations (which can need one step of lookahead).
 */
export function cellsToNodes(g: BoardGraph, cells: Cell[]): number[] | null {
  if (cells.length === 0) return [];
  const out: number[] = [];
  const walk = (i: number): boolean => {
    if (i === cells.length) return true;
    const options =
      i === 0 ? nodesAt(g, cells[0]) : g.adj[out[i - 1]].filter((n) => sameCell(g, n, cells[i]));
    for (const n of options) {
      out.push(n);
      if (walk(i + 1)) return true;
      out.pop();
    }
    return false;
  };
  return walk(0) ? out : null;
}

export function nodesToCells(g: BoardGraph, nodes: number[]): Cell[] {
  return nodes.map((n) => nodeCell(g, n));
}

export function endpointNodes(g: BoardGraph, p: Puzzle): [number, number][] {
  return p.dots.map((d) => [nodesAt(g, d.start)[0], nodesAt(g, d.end)[0]]);
}
