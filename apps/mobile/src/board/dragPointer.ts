import { isTeleportStep, sameCell, type BoardGraph, type Cell, type GameEvent } from '@ctd/core';
import { cellAtRaw, cellCenter, clampCell, type BoardGeom } from './geometry';

/** A path being dragged: the game while playing, the line drawer in the level editor. */
export interface DragEngine {
  readonly g: BoardGraph;
  readonly dragging: number;
  view(): number[][];
  dragTo(cell: Cell, extendOnly?: boolean): GameEvent[];
  isComplete(pair: number): boolean;
}

/** Pointer bookkeeping for one gesture. */
export interface PointerTrack {
  /** Last cell the pointer mapped to; moves within it are ignored. */
  lastTarget: Cell | null;
  /** Board-span offset after dragging off a warp edge. */
  wrapShift: [number, number];
  /** Path length kept from before this gesture; only teleports made during the gesture offset the pointer. */
  gestureBase: number;
}

/** How far (in cells) the pointer must pass a warp edge before wrapping, so jitter on the edge can't bounce. */
const WARP_MARGIN = 0.35;
/** Half-size (in cells) of the zone around a cell's center the pointer must reach to retract a finished line onto it. */
const RETRACT_ZONE = 0.3;

const sameCellPair = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1];

export function newTrack(): PointerTrack {
  return { lastTarget: null, wrapShift: [0, 0], gestureBase: 0 };
}

export function resetTrack(t: PointerTrack, at: Cell | null = null): void {
  t.lastTarget = at;
  t.wrapShift = [0, 0];
}

/**
 * Moves the drag head toward the pointer: walks cell by cell so fast swipes
 * never skip cells, wraps off warp edges, and follows the head through teleporters.
 */
export function pointerMove(gm: DragEngine, gg: BoardGeom, t: PointerTrack, x: number, y: number): GameEvent[] {
  if (gm.dragging < 0) return [];
  const g = gm.g;
  const headOf = () => {
    const p = gm.view()[gm.dragging];
    const n = p[p.length - 1];
    return [g.nodeRow[n], g.nodeCol[n]] as Cell;
  };
  // After a teleport the head is at the exit gate while the finger is still on the entry gate,
  // so the pointer is offset by the jump for as long as the path keeps that teleport.
  const tele = (() => {
    const p = gm.view()[gm.dragging];
    t.gestureBase = Math.min(t.gestureBase, p.length);
    for (let i = p.length - 1; i >= t.gestureBase; i--) {
      if (!isTeleportStep(g, p[i - 1], p[i])) continue;
      const [ax, ay] = cellCenter(gg, g.nodeRow[p[i - 1]], g.nodeCol[p[i - 1]]);
      const [bx, by] = cellCenter(gg, g.nodeRow[p[i]], g.nodeCol[p[i]]);
      return { dx: bx - ax, dy: by - ay, entry: i - 1 };
    }
    return { dx: 0, dy: 0, entry: -1 };
  })();
  const spanX = gg.W * gg.cell;
  const spanY = gg.H * gg.cell;
  const inside = (px: number, py: number) => px >= gg.ox && px < gg.ox + spanX && py >= gg.oy && py < gg.oy + spanY;
  // After a warp the finger is on the far side of the board from the head, so the pointer is shifted
  // by one board span; otherwise the unshifted pointer maps straight back and the path bounces.
  let vx = x + t.wrapShift[0];
  let vy = y + t.wrapShift[1];
  const [hr, hc] = headOf();

  // Dragging off a warp edge re-enters from the opposite side.
  const m = gg.cell * WARP_MARGIN;
  let wrap: Cell | null = null;
  let shift: [number, number] = [0, 0];
  if (vx < gg.ox - m && hc === 0 && g.warpRows[hr]) {
    wrap = [hr, gg.W - 1];
    shift = [spanX, 0];
  } else if (vx >= gg.ox + spanX + m && hc === gg.W - 1 && g.warpRows[hr]) {
    wrap = [hr, 0];
    shift = [-spanX, 0];
  } else if (vy < gg.oy - m && hr === 0 && g.warpCols[hc]) {
    wrap = [gg.H - 1, hc];
    shift = [0, spanY];
  } else if (vy >= gg.oy + spanY + m && hr === gg.H - 1 && g.warpCols[hc]) {
    wrap = [0, hc];
    shift = [0, -spanY];
  }
  if (wrap) {
    if (t.lastTarget && sameCellPair(t.lastTarget, wrap)) return [];
    t.lastTarget = wrap;
    const ev = gm.dragTo(wrap);
    if (ev.length && ev[0].type !== 'invalid') {
      t.wrapShift = [t.wrapShift[0] + shift[0], t.wrapShift[1] + shift[1]];
    }
    return ev;
  }

  // Finger came back onto the board somewhere the shifted mapping can't reach: follow the finger again.
  if ((t.wrapShift[0] || t.wrapShift[1]) && inside(x, y) && !inside(vx, vy)) {
    t.wrapShift = [0, 0];
    vx = x;
    vy = y;
  }

  const px = vx + tele.dx;
  const py = vy + tele.dy;
  const target = clampCell(gg, cellAtRaw(gg, px, py));
  if (t.lastTarget && sameCellPair(t.lastTarget, target)) return [];

  const path = gm.view()[gm.dragging];
  const onPath = path.some((n) => sameCell(g, n, target));
  const complete = gm.isComplete(gm.dragging);
  if (complete && onPath) {
    // Release jitter or an off-board pointer clamped onto the line must not break a finished
    // connection: it only retracts once the pointer is well inside one of its cells.
    const [cx, cy] = cellCenter(gg, target[0], target[1]);
    const zone = gg.cell * RETRACT_ZONE;
    if (Math.abs(px - cx) > zone || Math.abs(py - cy) > zone) return [];
  }
  t.lastTarget = target;

  const events: GameEvent[] = [];
  // With the pointer offset, the only way back through a teleporter is the finger returning to the
  // path before the entry gate when it can't move forward from the exit.
  const backThroughGate = () => {
    if (tele.entry < 0) return;
    const real = clampCell(gg, cellAtRaw(gg, vx, vy));
    const j = path.findIndex((n) => sameCell(g, n, real));
    if (j >= 0 && j < tele.entry) events.push(...gm.dragTo(real));
  };
  if (onPath) {
    events.push(...gm.dragTo(target));
  } else if (!complete) {
    for (let guard = 0; guard < 64; guard++) {
      const [r, c] = headOf();
      const dr = target[0] - r;
      const dc = target[1] - c;
      if (dr === 0 && dc === 0) break;
      const primary: Cell = Math.abs(dr) >= Math.abs(dc) ? [r + Math.sign(dr), c] : [r, c + Math.sign(dc)];
      const secondary: Cell | null = dr !== 0 && dc !== 0 ? (Math.abs(dr) >= Math.abs(dc) ? [r, c + Math.sign(dc)] : [r + Math.sign(dr), c]) : null;
      let ev = gm.dragTo(primary);
      if ((ev.length === 0 || ev[0].type === 'invalid') && secondary) {
        const alt = gm.dragTo(secondary, true);
        if (alt.length && alt[0].type !== 'invalid') ev = alt;
      }
      if (ev.length === 0) break;
      events.push(...ev);
      if (ev[0].type === 'invalid' || ev.some((e) => e.type === 'connect' || e.type === 'teleport')) break;
    }
    if (events.length === 0 || events[0].type === 'invalid') {
      const blocked = events.splice(0);
      backThroughGate();
      if (events.length === 0) events.push(...blocked);
    }
  }
  return events;
}
