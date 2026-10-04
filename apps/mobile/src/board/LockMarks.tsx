import React, { useCallback, useMemo } from 'react';
import { Picture, Skia, StrokeCap, StrokeJoin, type SkPath } from '@shopify/react-native-skia';
import { LOCK_ON_COLOR } from '../theme/config';
import { makePicture, usePictureValue } from '../ui/skiaMemory';
import { withBrush, type Brush } from './brush';
import { darken, lighten, withAlpha } from './color';

export interface TileRect {
  x: number;
  y: number;
  width: number;
  height: number;
  r: number;
}

export interface Padlock {
  shackle: SkPath;
  body: SkPath;
  hole: SkPath;
}

/** Key centered on (kx, ky): ring bow on the left, shaft with two teeth to the right. */
export function keyPath(kx: number, ky: number, cell: number): SkPath {
  const k = Skia.PathBuilder.Make();
  const kr = cell * 0.12;
  const bx = kx - cell * 0.15;
  const sy = ky - cell * 0.03;
  k.addCircle(bx, sy, kr);
  k.moveTo(bx + kr, sy);
  k.lineTo(kx + cell * 0.28, sy);
  k.moveTo(kx + cell * 0.14, sy);
  k.lineTo(kx + cell * 0.14, sy + cell * 0.12);
  k.moveTo(kx + cell * 0.24, sy);
  k.lineTo(kx + cell * 0.24, sy + cell * 0.1);
  return k.build();
}

/** Padlock centered on (dx, dy). */
export function padlockPaths(dx: number, dy: number, cell: number): Padlock {
  const top = dy - cell * 0.06;
  const sr = cell * 0.11;
  const shackle = Skia.PathBuilder.Make();
  shackle.moveTo(dx - sr, top + cell * 0.02);
  shackle.arcToOval(Skia.XYWHRect(dx - sr, top - cell * 0.12, sr * 2, sr * 2), 180, 180, false);
  shackle.lineTo(dx + sr, top + cell * 0.02);
  const body = Skia.PathBuilder.Make();
  body.addRRect(Skia.RRectXY(Skia.XYWHRect(dx - cell * 0.18, top, cell * 0.36, cell * 0.27), cell * 0.06, cell * 0.06));
  const hole = Skia.PathBuilder.Make();
  hole.addCircle(dx, top + cell * 0.11, cell * 0.045);
  hole.addRect(Skia.XYWHRect(dx - cell * 0.018, top + cell * 0.11, cell * 0.036, cell * 0.09));
  return { shackle: shackle.build(), body: body.build(), hole: hole.build() };
}

const round = { cap: StrokeCap.Round, join: StrokeJoin.Round };

/** Glowing badge marking a key cell; drawn under the flows. */
export function drawKeyBadge(b: Brush, x: number, y: number, cell: number, color: string, dim?: boolean): void {
  const o = dim ? 0.5 : 1;
  b.canvas.drawCircle(x, y, cell * 0.42, b.fill(withAlpha(color, 0.25), o));
  b.canvas.drawCircle(x, y, cell * 0.42, b.stroke(withAlpha(color, 0.7), { width: Math.max(1.5, cell * 0.045) }, o));
}

/** The key itself, outlined so it reads on empty cells and on top of a flow. */
export function drawKeyMark(b: Brush, path: SkPath, cell: number, color: string, dim?: boolean): void {
  const o = dim ? 0.5 : 1;
  b.canvas.drawPath(path, b.stroke(darken(color, 0.45), { width: Math.max(4, cell * 0.16), ...round }, o));
  b.canvas.drawPath(path, b.stroke(color, { width: Math.max(2.5, cell * 0.09), ...round }, o));
}

/** Solid door tile with a padlock; blocks the cell. */
export function drawClosedDoor(b: Brush, rect: TileRect, cell: number, color: string, padlock: Padlock): void {
  const { x, y, width: w, height: h, r } = rect;
  const inset = cell * 0.06;
  b.rrect(x, y, w, h, r, b.fill(color));
  b.rrect(x + inset, y + inset, w - inset * 2, h - inset * 2, r, b.stroke(lighten(color, 0.35), { width: Math.max(1.5, cell * 0.04) }));
  b.rrect(x, y, w, h, r, b.stroke(darken(color, 0.3), { width: Math.max(1.5, cell * 0.05) }));
  b.canvas.drawPath(padlock.shackle, b.stroke(LOCK_ON_COLOR, { width: Math.max(2, cell * 0.065), cap: StrokeCap.Round }));
  b.canvas.drawPath(padlock.body, b.fill(LOCK_ON_COLOR));
  b.canvas.drawPath(padlock.hole, b.fill(darken(color, 0.25)));
}

/** An opened door: a tinted, dashed frame the flow passes through. */
export function drawOpenDoor(b: Brush, rect: TileRect, cell: number, color: string): void {
  const { x, y, width: w, height: h, r } = rect;
  b.rrect(x, y, w, h, r, b.fill(withAlpha(color, 0.18)));
  b.rrect(x, y, w, h, r, b.stroke(color, { width: Math.max(2.5, cell * 0.09), dash: [cell * 0.12, cell * 0.08] }));
}

function Sketch({ draw }: { draw: (b: Brush) => void }) {
  const picture = usePictureValue(useMemo(() => makePicture((c) => withBrush(c, draw)), [draw]));
  return <Picture picture={picture} />;
}

export function KeyBadge({ x, y, cell, color, dim }: { x: number; y: number; cell: number; color: string; dim?: boolean }) {
  const draw = useCallback((b: Brush) => drawKeyBadge(b, x, y, cell, color, dim), [x, y, cell, color, dim]);
  return <Sketch draw={draw} />;
}

export function KeyMark({ path, cell, color, dim }: { path: SkPath; cell: number; color: string; dim?: boolean }) {
  const draw = useCallback((b: Brush) => drawKeyMark(b, path, cell, color, dim), [path, cell, color, dim]);
  return <Sketch draw={draw} />;
}

export function ClosedDoor({ rect, cell, color, padlock }: { rect: TileRect; cell: number; color: string; padlock: Padlock }) {
  const { x, y, width, height, r } = rect;
  const draw = useCallback(
    (b: Brush) => drawClosedDoor(b, { x, y, width, height, r }, cell, color, padlock),
    [x, y, width, height, r, cell, color, padlock],
  );
  return <Sketch draw={draw} />;
}
