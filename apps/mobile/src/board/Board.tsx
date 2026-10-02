import React, { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import {
  Canvas,
  Circle,
  ClipOp,
  DashPathEffect,
  Group,
  PaintStyle,
  Path,
  Picture,
  RoundedRect,
  Skia,
  useClock,
  type SkPath,
  type SkPicture,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { isTeleportStep, isWarpStep, PORTS, stepDirection, type Game } from '@ctd/core';
import { BORDER_INSET, cellCenter, cellGapPx, type BoardGeom } from './geometry';
import { drawEffects, type Effect } from './effects';
import { symbolPath } from './symbols';
import { withAlpha } from './color';
import { recordPicture } from '../ui/skiaMemory';
import { tokens } from '../theme/tokens';
import { LOCK_ON_COLOR, lockColor, teleporterColor, type DotStyle, type Palette } from '../theme/config';
import { useTheme } from '../theme/useTheme';

interface Props {
  game: Game;
  version: number;
  geom: BoardGeom;
  palette: Palette;
  colorblind: boolean;
  reduceMotion: boolean;
  fx: SharedValue<Effect[]>;
  intro: SharedValue<number>;
  shake: SharedValue<number>;
  onDown: (x: number, y: number) => void;
  onMove: (x: number, y: number) => void;
  onUp: () => void;
}

const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] } as const;
const CLIP_INTERSECT = ClipOp.Intersect;
const STROKE = PaintStyle.Stroke;

export function Board(props: Props) {
  const { game, version, geom, palette, colorblind, reduceMotion, fx, intro, shake } = props;
  const theme = useTheme();
  const B = theme.board;
  const g = game.g;
  const { size, cell } = geom;
  const pathW = cell * tokens.pathWidthRatio;
  const dotR = (cell * tokens.dotRatio) / 2;
  const gap = cellGapPx(cell, B.cellGap);
  const radius = cell * B.cellRadius;
  const frameOffset = BORDER_INSET + B.borderWidth / 2;
  const styleOf = (pair: number): DotStyle => palette[game.puzzle.dots[pair].color % palette.length];

  // ---- Static layers (depend only on geometry) -----------------------------
  const staticData = useMemo(() => {
    const cells: number[] = [];
    const maxD = Math.hypot(geom.W, geom.H) / 2;
    for (let r = 0; r < geom.H; r++) {
      for (let c = 0; c < geom.W; c++) {
        const i = r * geom.W + c;
        const d = Math.hypot(r - (geom.H - 1) / 2, c - (geom.W - 1) / 2) / maxD;
        cells.push(geom.ox + c * cell, geom.oy + r * cell, cell, d, g.isWall[i] ? 1 : 0);
      }
    }
    // Warp gates sit on the board frame, each with a chevron pointing out of the board; the lane they join is tinted.
    const warps: { x: number; y: number; w: number; h: number }[] = [];
    const lanes: { x: number; y: number; w: number; h: number }[] = [];
    const t = Math.max(6, geom.pad * 0.55);
    const len = cell * 0.8;
    const arrows = Skia.PathBuilder.Make();
    const gate = (cx: number, cy: number, dx: number, dy: number) => {
      const w = dx ? t : len;
      const h = dx ? len : t;
      warps.push({ x: cx - w / 2, y: cy - h / 2, w, h });
      const a = t * 0.3;
      arrows.moveTo(cx - dx * a * 0.5 + dy * a, cy - dy * a * 0.5 + dx * a);
      arrows.lineTo(cx + dx * a * 0.5, cy + dy * a * 0.5);
      arrows.lineTo(cx - dx * a * 0.5 - dy * a, cy - dy * a * 0.5 - dx * a);
    };
    const left = geom.ox + gap - frameOffset;
    const right = geom.ox + geom.W * cell - gap + frameOffset;
    const top = geom.oy + gap - frameOffset;
    const bottom = geom.oy + geom.H * cell - gap + frameOffset;
    g.warpRows.forEach((on, r) => {
      if (!on) return;
      const cy = geom.oy + (r + 0.5) * cell;
      gate(left, cy, -1, 0);
      gate(right, cy, 1, 0);
      lanes.push({ x: geom.ox + gap, y: geom.oy + r * cell + gap, w: geom.W * cell - gap * 2, h: cell - gap * 2 });
    });
    g.warpCols.forEach((on, c) => {
      if (!on) return;
      const cx = geom.ox + (c + 0.5) * cell;
      gate(cx, top, 0, -1);
      gate(cx, bottom, 0, 1);
      lanes.push({ x: geom.ox + c * cell + gap, y: geom.oy + gap, w: cell - gap * 2, h: geom.H * cell - gap * 2 });
    });
    const bridges: { x: number; y: number; r: number; c: number }[] = [];
    const rails = Skia.PathBuilder.Make();
    const deck = cell * 0.76;
    game.puzzle.bridges.forEach(([r, c]) => {
      const x = geom.ox + c * cell;
      const y = geom.oy + r * cell;
      bridges.push({ x, y, r, c });
      for (const f of [0.2, 0.8]) {
        const rx = x + (cell - deck) / 2 + deck * f;
        rails.moveTo(rx, y + (cell - deck) / 2 + deck * 0.16);
        rails.lineTo(rx, y + (cell - deck) / 2 + deck * 0.84);
      }
    });
    const gates = (game.puzzle.teleporters ?? []).flatMap((t, i) =>
      [t.a, t.b].map(([r, c]) => {
        const [x, y] = cellCenter(geom, r, c);
        return { key: `t${r}-${c}`, x, y, color: teleporterColor(i) };
      }),
    );
    const keys: { key: string; lock: number; color: string; path: SkPath }[] = [];
    const doors: { key: string; lock: number; color: string; x: number; y: number; hole: SkPath }[] = [];
    (game.puzzle.locks ?? []).forEach((l, i) => {
      const color = lockColor(i);
      const [kx, ky] = cellCenter(geom, l.key[0], l.key[1]);
      const k = Skia.PathBuilder.Make();
      const kr = cell * 0.1;
      k.addCircle(kx - cell * 0.1, ky, kr);
      k.moveTo(kx - cell * 0.1 + kr, ky);
      k.lineTo(kx + cell * 0.22, ky);
      k.moveTo(kx + cell * 0.12, ky);
      k.lineTo(kx + cell * 0.12, ky + cell * 0.09);
      k.moveTo(kx + cell * 0.2, ky);
      k.lineTo(kx + cell * 0.2, ky + cell * 0.07);
      keys.push({ key: `k${i}`, lock: i, color, path: k.build() });
      const [dx, dy] = cellCenter(geom, l.door[0], l.door[1]);
      const h = Skia.PathBuilder.Make();
      h.addCircle(dx, dy - cell * 0.05, cell * 0.075);
      h.moveTo(dx - cell * 0.04, dy - cell * 0.02);
      h.lineTo(dx - cell * 0.06, dy + cell * 0.14);
      h.lineTo(dx + cell * 0.06, dy + cell * 0.14);
      h.lineTo(dx + cell * 0.04, dy - cell * 0.02);
      h.close();
      doors.push({ key: `door${i}`, lock: i, color, x: dx - cell / 2, y: dy - cell / 2, hole: h.build() });
    });
    const pieces = [
      ...(game.puzzle.tunnels ?? []).map((t) => t.cell),
      ...(game.puzzle.rotators ?? []).map((t) => t.cell),
    ].map(([r, c]) => ({ r, c, x: geom.ox + c * cell, y: geom.oy + r * cell }));
    return { cells, warps, warpT: t, warpArrows: arrows.build(), lanes, bridges, deck, bridgeRails: rails.build(), gates, keys, doors, pieces };
  }, [geom, g, cell, gap, frameOffset, game.puzzle]);

  const emptyColor = B.cellEmpty;
  const wallColor = B.cellWall;
  const stripeColor = B.wallStripe;
  const prevCells = useSharedValue<SkPicture | null>(null);
  const cellsPicture = useDerivedValue(() => {
    const k = intro.value;
    const data = staticData.cells;
    return recordPicture(prevCells, (canvas) => {
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      const stripe = Skia.Paint();
      stripe.setAntiAlias(true);
      stripe.setStyle(STROKE);
      const empty = Skia.Color(emptyColor);
      const wall = Skia.Color(wallColor);
      const stripeC = Skia.Color(stripeColor);
      stripe.setColor(stripeC);
      for (let i = 0; i < data.length; i += 5) {
        const appear = Math.min(1, Math.max(0, k * 1.8 - data[i + 3] * 0.8));
        if (appear <= 0) continue;
        const inset = gap + (1 - appear) * data[i + 2] * 0.3;
        const s = data[i + 2] - inset * 2;
        const x = data[i] + inset;
        const y = data[i + 1] + inset;
        const isWall = data[i + 4] === 1;
        const c = isWall ? wall : empty;
        paint.setColor(c);
        paint.setAlphaf(c[3] * appear);
        const rrect = Skia.RRectXY(Skia.XYWHRect(x, y, s, s), radius, radius);
        canvas.drawRRect(rrect, paint);
        if (isWall) {
          const step = s / 3;
          stripe.setStrokeWidth(step * 0.4);
          stripe.setAlphaf(stripeC[3] * appear);
          canvas.save();
          canvas.clipRRect(rrect, CLIP_INTERSECT, true);
          for (let d = -s + step / 2; d < s; d += step) canvas.drawLine(x + d, y + s, x + d + s, y, stripe);
          canvas.restore();
        }
      }
      paint.dispose();
      stripe.dispose();
    });
  }, [staticData, gap, radius, emptyColor, wallColor, stripeColor]);

  // ---- Dynamic layers (depend on game state) --------------------------------
  const dynamic = useMemo(() => {
    const view = game.view();
    const ghosts = game.ghosts();
    const tints: { x: number; y: number; s: number; color: string; half: boolean }[] = [];
    const paths: { key: string; color: string; path: SkPath }[] = [];
    const ghostPaths: { key: string; color: string; path: SkPath }[] = [];
    const vNodeOwner = new Map<number, { pair: number; idx: number }>();

    const build = (nodes: number[]) => {
      const b = Skia.PathBuilder.Make();
      nodes.forEach((n, i) => {
        const [x, y] = cellCenter(geom, g.nodeRow[n], g.nodeCol[n]);
        if (i === 0) {
          b.moveTo(x, y);
          return;
        }
        const prev = nodes[i - 1];
        if (isTeleportStep(g, prev, n)) {
          b.moveTo(x, y);
          return;
        }
        if (isWarpStep(g, prev, n)) {
          const d = DIR_VEC[stepDirection(g, prev, n)];
          const [px, py] = cellCenter(geom, g.nodeRow[prev], g.nodeCol[prev]);
          b.lineTo(px + (d[0] * cell) / 2, py + (d[1] * cell) / 2);
          b.moveTo(x - (d[0] * cell) / 2, y - (d[1] * cell) / 2);
        }
        b.lineTo(x, y);
      });
      return b.build();
    };

    view.forEach((nodes, pair) => {
      if (nodes.length === 0) return;
      const style = styleOf(pair);
      nodes.forEach((n, idx) => {
        if (g.nodeLayer[n] === 'v') vNodeOwner.set(n, { pair, idx });
        const [cx, cy] = cellCenter(geom, g.nodeRow[n], g.nodeCol[n]);
        tints.push({ x: cx - cell / 2, y: cy - cell / 2, s: cell, color: style.cellFill, half: g.isBridge[g.nodeCellIdx[n]] });
      });
      if (nodes.length >= 2) paths.push({ key: `p${pair}`, color: style.line, path: build(nodes) });
    });
    ghosts.forEach((nodes, pair) => {
      if (nodes.length < 1) return;
      const base = view[pair];
      const withJoin = base.length ? [base[base.length - 1], ...nodes] : nodes;
      if (withJoin.length >= 2) ghostPaths.push({ key: `g${pair}`, color: styleOf(pair).line, path: build(withJoin) });
    });

    // Vertical crossing segments drawn above the bridge tile.
    const overpasses: { key: string; color: string; path: SkPath }[] = [];
    staticData.bridges.forEach(({ r, c }) => {
      const vNode = g.cellNodes[r * g.width + c][1];
      const owner = vNodeOwner.get(vNode);
      if (!owner) return;
      const nodes = view[owner.pair];
      const [cx, cy] = cellCenter(geom, r, c);
      const b = Skia.PathBuilder.Make();
      for (const j of [owner.idx - 1, owner.idx + 1]) {
        if (j < 0 || j >= nodes.length) continue;
        const dy = g.nodeRow[nodes[j]] < r ? -1 : 1;
        b.moveTo(cx, cy);
        b.lineTo(cx, cy + (dy * cell) / 2);
      }
      overpasses.push({ key: `o${r}-${c}`, color: styleOf(owner.pair).line, path: b.build() });
    });

    const connected = view.map((_, p) => game.isComplete(p, view));
    const dragging = game.dragging;
    let head: [number, number] | null = null;
    if (dragging >= 0) {
      const nodes = view[dragging];
      const n = nodes[nodes.length - 1];
      head = cellCenter(geom, g.nodeRow[n], g.nodeCol[n]);
    }
    // Tunnel / rotator grooves follow the piece's current orientation.
    const groove = Skia.PathBuilder.Make();
    const reach = staticData.deck / 2 - Math.max(2, cell * 0.07) / 2;
    staticData.pieces.forEach(({ r, c }) => {
      const layer = game.orientationAt([r, c]);
      if (!layer) return;
      const [cx, cy] = cellCenter(geom, r, c);
      for (const d of PORTS[layer]) {
        const [vx, vy] = DIR_VEC[d];
        groove.moveTo(cx, cy);
        groove.lineTo(cx + vx * reach, cy + vy * reach);
      }
    });
    const doorsOpen = game.doors();
    return { tints, paths, ghostPaths, overpasses, connected, dragging, head, groove: groove.build(), doorsOpen };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, geom, palette, game]);

  const dots = useMemo(
    () =>
      game.puzzle.dots.flatMap((d, pair) =>
        [d.start, d.end].map(([r, c], k) => {
          const [x, y] = cellCenter(geom, r, c);
          return { key: `d${pair}-${k}`, pair, x, y, color: styleOf(pair).dot, symbol: d.color };
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, geom, palette],
  );

  // ---- Animations ----------------------------------------------------------
  const clock = useClock();
  const breathR = useDerivedValue(
    () => (reduceMotion ? dotR : dotR * (1 + 0.05 * Math.sin(clock.value / 380))),
    [dotR, reduceMotion],
  );
  const warpPulse = useDerivedValue(
    () => (reduceMotion ? 0.8 : 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(clock.value / 450))),
    [reduceMotion],
  );
  const prevFx = useSharedValue<SkPicture | null>(null);
  const fxPicture = useDerivedValue(() => {
    clock.value;
    const list = fx.value;
    const now = Date.now();
    return recordPicture(prevFx, (canvas) => drawEffects(canvas, list, now));
  });

  const headX = useSharedValue(0);
  const headY = useSharedValue(0);
  const headOn = useSharedValue(0);
  useEffect(() => {
    if (dynamic.head) {
      const snap = headOn.value === 0;
      headX.value = snap ? dynamic.head[0] : withTiming(dynamic.head[0], { duration: 70 });
      headY.value = snap ? dynamic.head[1] : withTiming(dynamic.head[1], { duration: 70 });
      headOn.value = 1;
    } else headOn.value = 0;
  }, [dynamic.head, headX, headY, headOn]);
  const headColor = dynamic.dragging >= 0 ? styleOf(dynamic.dragging).line : theme.text.primary;

  const boardTransform = useDerivedValue(() => {
    const s = 0.92 + 0.08 * Math.min(1, intro.value);
    return [
      { translateX: shake.value + (size / 2) * (1 - s) },
      { translateY: (size / 2) * (1 - s) },
      { scale: s },
    ];
  });
  const boardOpacity = useDerivedValue(() => Math.min(1, intro.value * 1.5));
  const dotsOpacity = useDerivedValue(() => Math.min(1, Math.max(0, intro.value * 2 - 0.8)));

  // ---- Gestures (JS thread; engine calls are cheap and only run on cell changes)
  const { onDown, onMove, onUp } = props;
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .minDistance(0)
        .shouldCancelWhenOutside(false)
        .runOnJS(true)
        .onBegin((e) => onDown(e.x, e.y))
        .onUpdate((e) => onMove(e.x, e.y))
        .onFinalize(() => onUp()),
    [onDown, onMove, onUp],
  );

  const tile = (x: number, y: number, s: number) => ({ x: x + gap, y: y + gap, width: s - gap * 2, height: s - gap * 2, r: radius });

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.wrap, { width: size, height: size }]}>
        <Canvas style={{ width: size, height: size }}>
          <Group transform={boardTransform} opacity={boardOpacity}>
            {B.background !== 'transparent' && <RoundedRect x={0} y={0} width={size} height={size} r={tokens.radius.lg} color={B.background} />}
            {B.borderWidth > 0 && (
              <RoundedRect
                x={geom.ox + gap - frameOffset}
                y={geom.oy + gap - frameOffset}
                width={geom.W * cell - gap * 2 + frameOffset * 2}
                height={geom.H * cell - gap * 2 + frameOffset * 2}
                r={radius}
                style="stroke"
                strokeWidth={B.borderWidth}
                color={B.border}
              />
            )}

            <Picture picture={cellsPicture} />

            {/* Filled cells take their flow's pastel tint, painted over an opaque base so the empty-cell color doesn't show through */}
            {dynamic.tints.map((t, i) => (
              <Group key={i}>
                <RoundedRect {...tile(t.x, t.y, t.s)} color={theme.background.color} />
                <RoundedRect {...tile(t.x, t.y, t.s)} color={t.color} opacity={t.half ? 0.5 : 1} />
              </Group>
            ))}

            {/* Warp lanes and gates */}
            {staticData.lanes.map((l, i) => (
              <RoundedRect key={`l${i}`} x={l.x} y={l.y} width={l.w} height={l.h} r={radius} color={B.warpTint} />
            ))}
            <Group opacity={warpPulse}>
              {staticData.warps.map((w, i) => {
                const glow = staticData.warpT * 0.45;
                return (
                  <RoundedRect
                    key={`wg${i}`}
                    x={w.x - glow}
                    y={w.y - glow}
                    width={w.w + glow * 2}
                    height={w.h + glow * 2}
                    r={Math.min(w.w, w.h) / 2 + glow}
                    color={B.warpGlow}
                  />
                );
              })}
            </Group>
            {staticData.warps.map((w, i) => (
              <RoundedRect key={`w${i}`} x={w.x} y={w.y} width={w.w} height={w.h} r={Math.min(w.w, w.h) / 2} color={B.warp} />
            ))}
            {staticData.warps.length > 0 && (
              <Path
                path={staticData.warpArrows}
                color={B.warpArrow}
                style="stroke"
                strokeWidth={Math.max(1.2, staticData.warpT * 0.18)}
                strokeCap="round"
                strokeJoin="round"
              />
            )}

            {/* Teleporter gates: matching colored rings, one pair per color */}
            {staticData.gates.map((t) => (
              <Group key={t.key}>
                <Circle cx={t.x} cy={t.y} r={cell * 0.4} color={withAlpha(t.color, 0.18)} />
                <Circle cx={t.x} cy={t.y} r={cell * 0.33} color={t.color} style="stroke" strokeWidth={Math.max(2, cell * 0.07)} />
                <Circle cx={t.x} cy={t.y} r={cell * 0.17} color={t.color} style="stroke" strokeWidth={Math.max(1.5, cell * 0.045)} opacity={warpPulse} />
              </Group>
            ))}

            {/* Tunnels and rotators: a raised piece with a groove along its open sides */}
            {staticData.pieces.map((p) => {
              const s = staticData.deck;
              const x = p.x + (cell - s) / 2;
              const y = p.y + (cell - s) / 2;
              return (
                <Group key={`pc${p.r}-${p.c}`}>
                  <RoundedRect x={x} y={y + cell * 0.07} width={s} height={s} r={cell * 0.18} color={B.bridgeShadow} />
                  <RoundedRect x={x} y={y} width={s} height={s} r={cell * 0.18} color={B.bridgeBox} />
                  <RoundedRect x={x} y={y} width={s} height={s} r={cell * 0.18} style="stroke" strokeWidth={Math.max(2, cell * 0.07)} color={B.bridgeBorder} />
                </Group>
              );
            })}
            {staticData.pieces.length > 0 && (
              <Path path={dynamic.groove} color={B.bridgeBorder} style="stroke" strokeWidth={pathW * 0.75} strokeCap="butt" strokeJoin="round" />
            )}

            {/* Open doors leave a frame the flow passes through */}
            {staticData.doors.map((d) =>
              dynamic.doorsOpen[d.lock] ? (
                <RoundedRect
                  key={d.key}
                  {...tile(d.x, d.y, cell)}
                  style="stroke"
                  strokeWidth={Math.max(2, cell * 0.08)}
                  color={d.color}
                >
                  <DashPathEffect intervals={[cell * 0.12, cell * 0.08]} />
                </RoundedRect>
              ) : null,
            )}

            {/* Ghosts of paths cut by the current drag */}
            {dynamic.ghostPaths.map((p) => (
              <Path key={p.key} path={p.path} color={p.color} style="stroke" strokeWidth={pathW * 0.7} strokeCap="round" strokeJoin="round" opacity={0.3}>
                <DashPathEffect intervals={[pathW * 0.5, pathW * 0.6]} />
              </Path>
            ))}

            {dynamic.paths.map((p) => (
              <Path key={p.key} path={p.path} color={p.color} opacity={B.lineOpacity} style="stroke" strokeWidth={pathW} strokeCap="round" strokeJoin="round" />
            ))}

            {/* Bridges: raised deck with rails along the over lane, vertical path on top */}
            {staticData.bridges.map((b) => {
              const s = staticData.deck;
              const x = b.x + (cell - s) / 2;
              const y = b.y + (cell - s) / 2;
              return (
                <Group key={`b${b.r}-${b.c}`}>
                  <RoundedRect x={x} y={y + cell * 0.07} width={s} height={s} r={cell * 0.18} color={B.bridgeShadow} />
                  <RoundedRect x={x} y={y} width={s} height={s} r={cell * 0.18} color={B.bridgeBox} />
                </Group>
              );
            })}
            {staticData.bridges.length > 0 && (
              <Path path={staticData.bridgeRails} color={B.bridgeRail} style="stroke" strokeWidth={Math.max(1.5, cell * 0.05)} strokeCap="round" />
            )}
            {staticData.bridges.map((b) => {
              const s = staticData.deck;
              return (
                <RoundedRect
                  key={`bo${b.r}-${b.c}`}
                  x={b.x + (cell - s) / 2}
                  y={b.y + (cell - s) / 2}
                  width={s}
                  height={s}
                  r={cell * 0.18}
                  style="stroke"
                  strokeWidth={Math.max(2, cell * 0.07)}
                  color={B.bridgeBorder}
                />
              );
            })}
            {dynamic.overpasses.map((p) => (
              <Path key={p.key} path={p.path} color={p.color} opacity={B.lineOpacity} style="stroke" strokeWidth={pathW} strokeCap="round" />
            ))}

            {/* Closed doors block the cell; keys sit on top of the flow that collects them */}
            {staticData.doors.map((d) =>
              dynamic.doorsOpen[d.lock] ? null : (
                <Group key={d.key}>
                  <RoundedRect {...tile(d.x, d.y, cell)} color={d.color} />
                  <Path path={d.hole} color={LOCK_ON_COLOR} />
                </Group>
              ),
            )}
            {staticData.keys.map((k) => (
              <Group key={k.key} opacity={dynamic.doorsOpen[k.lock] ? 0.45 : 1}>
                <Path path={k.path} color={B.background === 'transparent' ? theme.background.color : B.background} style="stroke" strokeWidth={Math.max(3, cell * 0.11)} strokeCap="round" />
                <Path path={k.path} color={k.color} style="stroke" strokeWidth={Math.max(2, cell * 0.06)} strokeCap="round" />
              </Group>
            ))}

            {/* Dots */}
            <Group opacity={dotsOpacity}>
              {dots.map((d) => (
                <Group key={d.key}>
                  <Circle cx={d.x} cy={d.y} r={dynamic.connected[d.pair] ? dotR : breathR} color={d.color} />
                  {colorblind && <Path path={symbolPath(d.symbol, d.x, d.y, dotR * 0.45)} color={B.colorblindSymbol} />}
                </Group>
              ))}
            </Group>

            {/* Head of the path being drawn */}
            <Group opacity={headOn}>
              <Circle cx={headX} cy={headY} r={pathW * 1.05} color={headColor} opacity={0.3} />
              <Circle cx={headX} cy={headY} r={pathW * 0.42} color={headColor} />
            </Group>

            <Picture picture={fxPicture} />
          </Group>
        </Canvas>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: Platform.select({
    web: { userSelect: 'none', touchAction: 'none', cursor: 'pointer' } as object,
    default: {},
  }),
});
