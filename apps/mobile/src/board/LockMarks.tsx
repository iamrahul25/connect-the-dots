import React from 'react';
import { Circle, DashPathEffect, Group, Path, RoundedRect, Skia, type SkPath } from '@shopify/react-native-skia';
import { LOCK_ON_COLOR } from '../theme/config';
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

/** Glowing badge marking a key cell; drawn under the flows. */
export function KeyBadge({ x, y, cell, color, dim }: { x: number; y: number; cell: number; color: string; dim?: boolean }) {
  return (
    <Group opacity={dim ? 0.5 : 1}>
      <Circle cx={x} cy={y} r={cell * 0.42} color={withAlpha(color, 0.25)} />
      <Circle cx={x} cy={y} r={cell * 0.42} color={withAlpha(color, 0.7)} style="stroke" strokeWidth={Math.max(1.5, cell * 0.045)} />
    </Group>
  );
}

/** The key itself, outlined so it reads on empty cells and on top of a flow. */
export function KeyMark({ path, cell, color, dim }: { path: SkPath; cell: number; color: string; dim?: boolean }) {
  return (
    <Group opacity={dim ? 0.5 : 1}>
      <Path path={path} color={darken(color, 0.45)} style="stroke" strokeWidth={Math.max(4, cell * 0.16)} strokeCap="round" strokeJoin="round" />
      <Path path={path} color={color} style="stroke" strokeWidth={Math.max(2.5, cell * 0.09)} strokeCap="round" strokeJoin="round" />
    </Group>
  );
}

/** Solid door tile with a padlock; blocks the cell. */
export function ClosedDoor({ rect, cell, color, padlock }: { rect: TileRect; cell: number; color: string; padlock: Padlock }) {
  const inset = cell * 0.06;
  return (
    <Group>
      <RoundedRect {...rect} color={color} />
      <RoundedRect
        x={rect.x + inset}
        y={rect.y + inset}
        width={rect.width - inset * 2}
        height={rect.height - inset * 2}
        r={rect.r}
        style="stroke"
        strokeWidth={Math.max(1.5, cell * 0.04)}
        color={lighten(color, 0.35)}
      />
      <RoundedRect {...rect} style="stroke" strokeWidth={Math.max(1.5, cell * 0.05)} color={darken(color, 0.3)} />
      <Path path={padlock.shackle} color={LOCK_ON_COLOR} style="stroke" strokeWidth={Math.max(2, cell * 0.065)} strokeCap="round" />
      <Path path={padlock.body} color={LOCK_ON_COLOR} />
      <Path path={padlock.hole} color={darken(color, 0.25)} />
    </Group>
  );
}

/** An opened door: a tinted, dashed frame the flow passes through. */
export function OpenDoor({ rect, cell, color }: { rect: TileRect; cell: number; color: string }) {
  return (
    <Group>
      <RoundedRect {...rect} color={withAlpha(color, 0.18)} />
      <RoundedRect {...rect} style="stroke" strokeWidth={Math.max(2.5, cell * 0.09)} color={color}>
        <DashPathEffect intervals={[cell * 0.12, cell * 0.08]} />
      </RoundedRect>
    </Group>
  );
}
