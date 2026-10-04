import React, { useEffect, useMemo, useState } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import {
  Canvas,
  Circle,
  ClipOp,
  Group,
  Paint,
  PaintStyle,
  Path,
  Picture,
  RoundedRect,
  Skia,
  StrokeCap,
  StrokeJoin,
  useClock,
  type SkCanvas,
  type SkPaint,
  type SkPath,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useAnimatedReaction, useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { isTeleportStep, isWarpStep, ROTATOR_LAYERS, stepDirection, TUNNEL_LAYERS, type Game } from '@ctd/core';
import { BORDER_INSET, cellCenter, cellGapPx, type BoardGeom } from './geometry';
import { drawEffects, type Effect } from './effects';
import { withBrush, type Brush } from './brush';
import { drawClosedDoor, drawKeyBadge, drawKeyMark, drawOpenDoor, keyPath, padlockPaths, type Padlock } from './LockMarks';
import { TeleportGate } from './TeleportGate';
import { TurnPiece } from './TurnPiece';
import { symbolPath } from './symbols';
import { emptyPicture, makePicture, recordPicture, skipPicture, usePictureSlot, usePictureValue } from '../ui/skiaMemory';
import { tokens } from '../theme/tokens';
import { lockColor, teleporterColor, type DotStyle, type Palette } from '../theme/config';
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
const ROUND = { cap: StrokeCap.Round, join: StrokeJoin.Round };

/*
 * Rendering budget: Skia replays every scene-graph node on every frame while anything animates
 * (dots breathe continuously), so per-cell content (tints, flows, bridges, locks, dot symbols) is
 * baked into pictures that are re-recorded only when the board changes. Only the few animated
 * shapes stay as nodes.
 */

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
    const keys: { key: string; lock: number; color: string; x: number; y: number; path: SkPath }[] = [];
    const doors: { key: string; lock: number; color: string; x: number; y: number; padlock: Padlock }[] = [];
    (game.puzzle.locks ?? []).forEach((l, i) => {
      const color = lockColor(i);
      const [kx, ky] = cellCenter(geom, l.key[0], l.key[1]);
      keys.push({ key: `k${i}`, lock: i, color, x: kx, y: ky, path: keyPath(kx, ky, cell) });
      const [dx, dy] = cellCenter(geom, l.door[0], l.door[1]);
      doors.push({ key: `door${i}`, lock: i, color, x: dx - cell / 2, y: dy - cell / 2, padlock: padlockPaths(dx, dy, cell) });
    });
    const pieces = [
      ...(game.puzzle.tunnels ?? []).map((t) => ({ cell: t.cell, kind: 'tunnel' as const })),
      ...(game.puzzle.rotators ?? []).map((t) => ({ cell: t.cell, kind: 'rotator' as const })),
    ].map(({ cell: [r, c], kind }) => {
      const [cx, cy] = cellCenter(geom, r, c);
      return { r, c, cx, cy, kind };
    });
    return { cells, warps, warpT: t, warpArrows: arrows.build(), lanes, bridges, deck, bridgeRails: rails.build(), gates, keys, doors, pieces };
  }, [geom, g, cell, gap, frameOffset, game.puzzle]);

  const emptyColor = B.cellEmpty;
  const wallColor = B.cellWall;
  const stripeColor = B.wallStripe;
  const prevCells = usePictureSlot();
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
    const paths: { color: string; nodes: number[] }[] = [];
    const ghostPaths: { color: string; nodes: number[] }[] = [];
    const vNodeOwner = new Map<number, { pair: number; idx: number }>();

    view.forEach((nodes, pair) => {
      if (nodes.length === 0) return;
      const style = styleOf(pair);
      nodes.forEach((n, idx) => {
        if (g.nodeLayer[n] === 'v') vNodeOwner.set(n, { pair, idx });
        const [cx, cy] = cellCenter(geom, g.nodeRow[n], g.nodeCol[n]);
        tints.push({ x: cx - cell / 2, y: cy - cell / 2, s: cell, color: style.cellFill, half: g.isBridge[g.nodeCellIdx[n]] });
      });
      if (nodes.length >= 2) paths.push({ color: style.line, nodes });
    });
    ghosts.forEach((nodes, pair) => {
      if (nodes.length < 1) return;
      const base = view[pair];
      const withJoin = base.length ? [base[base.length - 1], ...nodes] : nodes;
      if (withJoin.length >= 2) ghostPaths.push({ color: styleOf(pair).line, nodes: withJoin });
    });

    // Vertical crossing segments drawn above the bridge tile: center, then up (-1) or down (+1).
    const overpasses: { color: string; x: number; y: number; dirs: number[] }[] = [];
    staticData.bridges.forEach(({ r, c }) => {
      const vNode = g.cellNodes[r * g.width + c][1];
      const owner = vNodeOwner.get(vNode);
      if (!owner) return;
      const nodes = view[owner.pair];
      const [x, y] = cellCenter(geom, r, c);
      const dirs: number[] = [];
      for (const j of [owner.idx - 1, owner.idx + 1]) {
        if (j >= 0 && j < nodes.length) dirs.push(g.nodeRow[nodes[j]] < r ? -1 : 1);
      }
      overpasses.push({ color: styleOf(owner.pair).line, x, y, dirs });
    });

    const connected = view.map((_, p) => game.isComplete(p, view));
    const dragging = game.dragging;
    let head: [number, number] | null = null;
    if (dragging >= 0) {
      const nodes = view[dragging];
      const n = nodes[nodes.length - 1];
      head = cellCenter(geom, g.nodeRow[n], g.nodeCol[n]);
    }
    // Tunnels and rotators are drawn in their base orientation and turned to the current one.
    const pieceTurns = staticData.pieces.map(({ r, c, kind }) => {
      const layers: readonly string[] = kind === 'tunnel' ? TUNNEL_LAYERS : ROTATOR_LAYERS;
      return Math.max(0, layers.indexOf(game.orientationAt([r, c]) ?? ''));
    });
    const doorsOpen = game.doors();
    return { tints, paths, ghostPaths, overpasses, connected, dragging, head, pieceTurns, doorsOpen };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, geom, palette, game]);

  const dots = useMemo(
    () =>
      game.puzzle.dots.flatMap((d, pair) =>
        [d.start, d.end].map(([r, c]) => {
          const [x, y] = cellCenter(geom, r, c);
          return { pair, x, y, color: styleOf(pair).dot, symbol: symbolPath(d.color, x, y, dotR * 0.45) };
        }),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [game, geom, palette, dotR],
  );

  // ---- Baked layers (re-recorded only when the board changes) ---------------
  const tile = (x: number, y: number, s: number) => ({ x: x + gap, y: y + gap, width: s - gap * 2, height: s - gap * 2, r: radius });

  const strokeNodes = (canvas: SkCanvas, nodes: number[], paint: SkPaint) => {
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
    const path = b.build();
    canvas.drawPath(path, paint);
    path.dispose?.();
  };

  const tileBase = theme.background.color;
  /** Under the obstacles: flow-tinted cells (on an opaque base so the empty-cell color doesn't show through) and warp lanes. */
  const underPicture = useMemo(
    () =>
      makePicture((canvas) =>
        withBrush(canvas, (b) => {
          const s = cell - gap * 2;
          for (const t of dynamic.tints) {
            b.rrect(t.x + gap, t.y + gap, s, s, radius, b.fill(tileBase));
            b.rrect(t.x + gap, t.y + gap, s, s, radius, b.fill(t.color, t.half ? 0.5 : 1));
          }
          for (const l of staticData.lanes) b.rrect(l.x, l.y, l.w, l.h, radius, b.fill(B.warpTint));
        }),
      ),
    [dynamic, staticData, cell, gap, radius, tileBase, B.warpTint],
  );
  const under = usePictureValue(underPicture);

  /** Over the obstacles: key badges, doors, flows, bridges and keys. */
  const overPicture = useMemo(() => {
    const draw = (b: Brush) => {
      const { canvas } = b;
      const { keys, doors, bridges, deck } = staticData;
      const open = dynamic.doorsOpen;
      for (const k of keys) drawKeyBadge(b, k.x, k.y, cell, k.color, open[k.lock]);
      for (const d of doors) if (open[d.lock]) drawOpenDoor(b, tile(d.x, d.y, cell), cell, d.color);
      for (const p of dynamic.ghostPaths) {
        strokeNodes(canvas, p.nodes, b.stroke(p.color, { width: pathW * 0.7, ...ROUND, dash: [pathW * 0.5, pathW * 0.6] }, 0.3));
      }
      for (const p of dynamic.paths) strokeNodes(canvas, p.nodes, b.stroke(p.color, { width: pathW, ...ROUND }, B.lineOpacity));

      const corner = cell * 0.18;
      const inset = (cell - deck) / 2;
      for (const br of bridges) b.rrect(br.x + inset, br.y + inset + cell * 0.07, deck, deck, corner, b.fill(B.bridgeShadow));
      for (const br of bridges) b.rrect(br.x + inset, br.y + inset, deck, deck, corner, b.fill(B.bridgeBox));
      if (bridges.length > 0) {
        canvas.drawPath(staticData.bridgeRails, b.stroke(B.bridgeRail, { width: Math.max(1.5, cell * 0.05), cap: StrokeCap.Round }));
      }
      const rim = b.stroke(B.bridgeBorder, { width: Math.max(2, cell * 0.07) });
      for (const br of bridges) b.rrect(br.x + inset, br.y + inset, deck, deck, corner, rim);
      for (const o of dynamic.overpasses) {
        const paint = b.stroke(o.color, { width: pathW, cap: StrokeCap.Round }, B.lineOpacity);
        for (const dy of o.dirs) canvas.drawLine(o.x, o.y, o.x, o.y + (dy * cell) / 2, paint);
      }

      for (const d of doors) if (!open[d.lock]) drawClosedDoor(b, tile(d.x, d.y, cell), cell, d.color, d.padlock);
      for (const k of keys) drawKeyMark(b, k.path, cell, k.color, open[k.lock]);
    };
    return makePicture((canvas) => withBrush(canvas, draw));
    // `tile` and `strokeNodes` only read geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dynamic, staticData, geom, g, cell, gap, radius, pathW, B]);
  const over = usePictureValue(overPicture);

  /** One character per pair, so the dot layers only rebuild when a connection changes, not on every cell. */
  const connectedKey = dynamic.connected.map((c) => (c ? '1' : '0')).join('');
  /** Connected dots stay still; every dot's colorblind symbol sits on top. */
  const dotsPicture = useMemo(
    () =>
      makePicture((canvas) =>
        withBrush(canvas, (b) => {
          for (const d of dots) if (connectedKey[d.pair] === '1') canvas.drawCircle(d.x, d.y, dotR, b.fill(d.color));
          if (colorblind) for (const d of dots) canvas.drawPath(d.symbol, b.fill(B.colorblindSymbol));
        }),
      ),
    [dots, connectedKey, dotR, colorblind, B.colorblindSymbol],
  );
  const dotsLayer = usePictureValue(dotsPicture);
  const breathing = useMemo(
    () => dots.filter((d) => connectedKey[d.pair] !== '1').map((d) => ({ x: d.x, y: d.y, color: d.color })),
    [dots, connectedKey],
  );
  // ---- Animations ----------------------------------------------------------
  const clock = useClock();
  const boardOpacity = useDerivedValue(() => Math.min(1, intro.value * 1.5));
  const dotsOpacity = useDerivedValue(() => Math.min(1, Math.max(0, intro.value * 2 - 0.8)));
  // A Group's opacity doesn't reach pictures, so the intro fades through layers, kept only while it runs.
  const [fading, setFading] = useState(true);
  useAnimatedReaction(
    () => intro.value < 1,
    (now, before) => {
      if (now !== before) scheduleOnRN(setFading, now);
    },
  );

  const prevBreath = usePictureSlot();
  /** Unconnected dots breathe; one picture instead of a node per dot. */
  const breathPicture = useDerivedValue(() => {
    const r = reduceMotion ? dotR : dotR * (1 + 0.05 * Math.sin(clock.value / 380));
    return recordPicture(prevBreath, (canvas) => {
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      for (let i = 0; i < breathing.length; i++) {
        const d = breathing[i];
        paint.setColor(Skia.Color(d.color));
        canvas.drawCircle(d.x, d.y, r, paint);
      }
      paint.dispose();
    });
  }, [breathing, dotR, reduceMotion]);
  const warpPulse = useDerivedValue(
    () => (reduceMotion ? 0.8 : 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(clock.value / 450))),
    [reduceMotion],
  );
  const prevFx = usePictureSlot();
  const blank = emptyPicture();
  const fxPicture = useDerivedValue(() => {
    clock.value;
    const list = fx.value;
    const now = Date.now();
    let live = false;
    for (let i = 0; i < list.length && !live; i++) live = now - list[i].t0 < list[i].dur;
    if (!live) return skipPicture(prevFx, blank);
    return recordPicture(prevFx, (canvas) => drawEffects(canvas, list, now));
  }, [blank]);

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

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.wrap, { width: size, height: size }]}>
        <Canvas style={{ width: size, height: size }}>
          <Group transform={boardTransform} layer={fading ? <Paint opacity={boardOpacity} /> : undefined}>
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
            <Picture picture={under} />

            {/* Warp gates */}
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

            {/* Teleporter gates: matching colored portals, one pair per color */}
            {staticData.gates.map((t) => (
              <TeleportGate key={t.key} x={t.x} y={t.y} cell={cell} color={t.color} clock={clock} pulse={warpPulse} reduceMotion={reduceMotion} />
            ))}

            {/* Tunnels and rotators: a raised piece with a groove along its open sides */}
            {staticData.pieces.map((p, i) => (
              <TurnPiece
                key={`pc${p.r}-${p.c}`}
                kind={p.kind}
                cx={p.cx}
                cy={p.cy}
                cell={cell}
                deck={staticData.deck}
                pathW={pathW}
                turn={dynamic.pieceTurns[i]}
                reduceMotion={reduceMotion}
                colors={{ box: B.bridgeBox, border: B.bridgeBorder, shadow: B.bridgeShadow }}
              />
            ))}

            <Picture picture={over} />

            <Group layer={fading ? <Paint opacity={dotsOpacity} /> : undefined}>
              <Picture picture={breathPicture} />
              <Picture picture={dotsLayer} />
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
