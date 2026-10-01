import React, { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import {
  Canvas,
  Circle,
  DashPathEffect,
  Group,
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
import { isWarpStep, stepDirection, type Game } from '@ctd/core';
import { BORDER_INSET, cellCenter, cellGapPx, type BoardGeom } from './geometry';
import { drawEffects, type Effect } from './effects';
import { symbolPath } from './symbols';
import { recordPicture } from '../ui/skiaMemory';
import { tokens } from '../theme/tokens';
import type { DotStyle, Palette } from '../theme/config';
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
    const warps: { x: number; y: number; w: number; h: number }[] = [];
    const t = Math.max(4, geom.pad * 0.32);
    g.warpRows.forEach((on, r) => {
      if (!on) return;
      const y = geom.oy + r * cell + cell * 0.18;
      warps.push({ x: geom.ox - t - 3, y, w: t, h: cell * 0.64 });
      warps.push({ x: geom.ox + geom.W * cell + 3, y, w: t, h: cell * 0.64 });
    });
    g.warpCols.forEach((on, c) => {
      if (!on) return;
      const x = geom.ox + c * cell + cell * 0.18;
      warps.push({ x, y: geom.oy - t - 3, w: cell * 0.64, h: t });
      warps.push({ x, y: geom.oy + geom.H * cell + 3, w: cell * 0.64, h: t });
    });
    const bridges: { x: number; y: number; r: number; c: number }[] = [];
    game.puzzle.bridges.forEach(([r, c]) => bridges.push({ x: geom.ox + c * cell, y: geom.oy + r * cell, r, c }));
    return { cells, warps, bridges };
  }, [geom, g, cell, game.puzzle]);

  const emptyColor = B.cellEmpty;
  const wallColor = B.cellWall;
  const prevCells = useSharedValue<SkPicture | null>(null);
  const cellsPicture = useDerivedValue(() => {
    const k = intro.value;
    const data = staticData.cells;
    return recordPicture(prevCells, (canvas) => {
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      const empty = Skia.Color(emptyColor);
      const wall = Skia.Color(wallColor);
      for (let i = 0; i < data.length; i += 5) {
        const appear = Math.min(1, Math.max(0, k * 1.8 - data[i + 3] * 0.8));
        if (appear <= 0) continue;
        const inset = gap + (1 - appear) * data[i + 2] * 0.3;
        const s = data[i + 2] - inset * 2;
        const c = data[i + 4] === 1 ? wall : empty;
        paint.setColor(c);
        paint.setAlphaf(c[3] * appear);
        canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(data[i] + inset, data[i + 1] + inset, s, s), radius, radius), paint);
      }
      paint.dispose();
    });
  }, [staticData, gap, radius, emptyColor, wallColor]);

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
        tints.push({ x: cx - cell / 2, y: cy - cell / 2, s: cell, color: style.cellFill, half: g.nodeLayer[n] !== 'n' });
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
    return { tints, paths, ghostPaths, overpasses, connected, dragging, head };
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

  const pointerX = useSharedValue(0);
  const pointerY = useSharedValue(0);
  const showHalo = Platform.OS !== 'web' && cell < 30;
  const haloY = useDerivedValue(() => pointerY.value - cell * 1.8);
  const haloOpacity = useDerivedValue(() => (showHalo ? headOn.value : 0));

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
        .onBegin((e) => {
          pointerX.value = e.x;
          pointerY.value = e.y;
          onDown(e.x, e.y);
        })
        .onUpdate((e) => {
          pointerX.value = e.x;
          pointerY.value = e.y;
          onMove(e.x, e.y);
        })
        .onFinalize(() => onUp()),
    [onDown, onMove, onUp, pointerX, pointerY],
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

            {/* Warp portals */}
            {staticData.warps.map((w, i) => (
              <RoundedRect key={`w${i}`} x={w.x} y={w.y} width={w.w} height={w.h} r={Math.min(w.w, w.h) / 2} color={B.warp} />
            ))}

            {/* Ghosts of paths cut by the current drag */}
            {dynamic.ghostPaths.map((p) => (
              <Path key={p.key} path={p.path} color={p.color} style="stroke" strokeWidth={pathW * 0.7} strokeCap="round" strokeJoin="round" opacity={0.3}>
                <DashPathEffect intervals={[pathW * 0.5, pathW * 0.6]} />
              </Path>
            ))}

            {dynamic.paths.map((p) => (
              <Path key={p.key} path={p.path} color={p.color} opacity={B.lineOpacity} style="stroke" strokeWidth={pathW} strokeCap="round" strokeJoin="round" />
            ))}

            {/* Bridges: raised tile, vertical path on top */}
            {staticData.bridges.map((b) => (
              <Group key={`b${b.r}-${b.c}`}>
                <RoundedRect x={b.x + cell * 0.14} y={b.y + cell * 0.14} width={cell * 0.72} height={cell * 0.72} r={cell * 0.16} color={B.bridgeBox} />
                <RoundedRect x={b.x + cell * 0.14} y={b.y + cell * 0.14} width={cell * 0.72} height={cell * 0.72} r={cell * 0.16} style="stroke" strokeWidth={1.5} color={B.bridgeBorder} />
              </Group>
            ))}
            {dynamic.overpasses.map((p) => (
              <Path key={p.key} path={p.path} color={p.color} opacity={B.lineOpacity} style="stroke" strokeWidth={pathW} strokeCap="round" />
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

          {/* Finger halo on dense boards so the head is not hidden under the finger */}
          <Group opacity={haloOpacity}>
            <Circle cx={pointerX} cy={haloY} r={cell * 1.2} color={theme.box.surface} opacity={0.9} />
            <Circle cx={pointerX} cy={haloY} r={cell * 1.2} color={B.pointerRing} style="stroke" strokeWidth={1.5} />
            <Circle cx={pointerX} cy={haloY} r={cell * 0.55} color={headColor} />
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
