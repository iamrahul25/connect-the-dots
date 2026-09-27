import type { Cell, Puzzle, Warp } from './types';

export type Layer = 'n' | 'h' | 'v';
export type Direction = 'up' | 'down' | 'left' | 'right';

export interface BoardSpec {
  width: number;
  height: number;
  walls: Cell[];
  bridges: Cell[];
  warps: Warp[];
}

/**
 * The board as a graph. Walls are removed nodes, bridge cells are split into a
 * horizontal (`h`) and vertical (`v`) node, and warps add wrap-around edges.
 */
export interface BoardGraph {
  width: number;
  height: number;
  nodeCount: number;
  nodeRow: number[];
  nodeCol: number[];
  nodeLayer: Layer[];
  adj: number[][];
  /** Node ids per cell index (`r * width + c`): [] for walls, [h, v] for bridges. */
  cellNodes: number[][];
  isWall: boolean[];
  isBridge: boolean[];
  warpRows: boolean[];
  warpCols: boolean[];
}

const DIRS: { d: Direction; dr: number; dc: number; axis: 'h' | 'v' }[] = [
  { d: 'up', dr: -1, dc: 0, axis: 'v' },
  { d: 'down', dr: 1, dc: 0, axis: 'v' },
  { d: 'left', dr: 0, dc: -1, axis: 'h' },
  { d: 'right', dr: 0, dc: 1, axis: 'h' },
];

export function specOf(p: Puzzle): BoardSpec {
  return {
    width: p.size.width,
    height: p.size.height,
    walls: p.walls,
    bridges: p.bridges,
    warps: p.warps,
  };
}

export function buildGraph(spec: BoardSpec): BoardGraph {
  const { width: W, height: H } = spec;
  const isWall = new Array<boolean>(W * H).fill(false);
  const isBridge = new Array<boolean>(W * H).fill(false);
  const warpRows = new Array<boolean>(H).fill(false);
  const warpCols = new Array<boolean>(W).fill(false);
  for (const [r, c] of spec.walls) isWall[r * W + c] = true;
  for (const [r, c] of spec.bridges) isBridge[r * W + c] = true;
  for (const w of spec.warps) {
    if (w.axis === 'row') warpRows[w.index] = true;
    else warpCols[w.index] = true;
  }

  const nodeRow: number[] = [];
  const nodeCol: number[] = [];
  const nodeLayer: Layer[] = [];
  const cellNodes: number[][] = [];
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const i = r * W + c;
      if (isWall[i]) {
        cellNodes.push([]);
      } else if (isBridge[i]) {
        const id = nodeRow.length;
        nodeRow.push(r, r);
        nodeCol.push(c, c);
        nodeLayer.push('h', 'v');
        cellNodes.push([id, id + 1]);
      } else {
        const id = nodeRow.length;
        nodeRow.push(r);
        nodeCol.push(c);
        nodeLayer.push('n');
        cellNodes.push([id]);
      }
    }
  }

  const nodeCount = nodeRow.length;
  const adj: number[][] = Array.from({ length: nodeCount }, () => []);
  const g: BoardGraph = {
    width: W,
    height: H,
    nodeCount,
    nodeRow,
    nodeCol,
    nodeLayer,
    adj,
    cellNodes,
    isWall,
    isBridge,
    warpRows,
    warpCols,
  };

  const axisNode = (i: number, axis: 'h' | 'v') => {
    const ns = cellNodes[i];
    return ns.length === 2 ? (axis === 'h' ? ns[0] : ns[1]) : ns[0];
  };

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const i = r * W + c;
      if (isWall[i]) continue;
      for (const dir of DIRS) {
        const nb = neighborCell(g, r, c, dir.d);
        if (!nb) continue;
        const j = nb[0] * W + nb[1];
        if (isWall[j] || j === i) continue;
        const a = axisNode(i, dir.axis);
        const b = axisNode(j, dir.axis);
        if (!adj[a].includes(b)) {
          adj[a].push(b);
          adj[b].push(a);
        }
      }
    }
  }
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

/** True when the edge a-b crosses the board boundary via a warp. */
export function isWarpStep(g: BoardGraph, a: number, b: number): boolean {
  const dr = Math.abs(g.nodeRow[a] - g.nodeRow[b]);
  const dc = Math.abs(g.nodeCol[a] - g.nodeCol[b]);
  return dr + dc > 1;
}

/** Direction of travel from node a to adjacent node b (warp-aware). */
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

/** Converts an ordered list of cells into graph nodes, resolving bridge layers. */
export function cellsToNodes(g: BoardGraph, cells: Cell[]): number[] | null {
  if (cells.length === 0) return [];
  const first = nodesAt(g, cells[0]);
  if (first.length === 0) return null;
  const out = [first[0]];
  for (let i = 1; i < cells.length; i++) {
    const prev = out[out.length - 1];
    const next = g.adj[prev].find((n) => sameCell(g, n, cells[i]));
    if (next === undefined) return null;
    out.push(next);
  }
  return out;
}

export function nodesToCells(g: BoardGraph, nodes: number[]): Cell[] {
  return nodes.map((n) => nodeCell(g, n));
}

export function endpointNodes(g: BoardGraph, p: Puzzle): [number, number][] {
  return p.dots.map((d) => [nodesAt(g, d.start)[0], nodesAt(g, d.end)[0]]);
}
