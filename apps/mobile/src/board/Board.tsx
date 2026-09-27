import React, { useEffect, useMemo } from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import {
  BlurMask,
  Canvas,
  Circle,
  createPicture,
  DashPathEffect,
  Group,
  LinearGradient,
  Path,
  Picture,
  RadialGradient,
  RoundedRect,
  Shadow,
  PaintStyle,
  Skia,
  TileMode,
  useClock,
  vec,
  type SkPath,
} from '@shopify/react-native-skia';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useDerivedValue, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { isWarpStep, stepDirection, type Game } from '@ctd/core';
import { cellCenter, type BoardGeom } from './geometry';
import { drawEffects, type Effect } from './effects';
import { withAlpha } from './color';
import { symbolPath } from './symbols';
import { colors, tokens } from '../theme/tokens';
import { flowStyle } from '../theme/themes';

const BOARD = colors.board;
const CELL = colors.cell;


interface Props {
  game: Game;
  version: number;
  geom: BoardGeom;
  palette: readonly string[];
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
  const g = game.g;
  const { size, cell } = geom;
  const pathW = cell * tokens.pathWidthRatio;
  const dotR = (cell * tokens.dotRatio) / 2;
  const colorOf = (pair: number) => palette[game.puzzle.dots[pair].color % palette.length];

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

  const cellsPicture = useDerivedValue(() => {
    const k = intro.value;
    const data = staticData.cells;
    const radius = cell * 0.2;
    return createPicture((canvas) => {
      const paint = Skia.Paint();
      paint.setAntiAlias(true);
      for (let i = 0; i < data.length; i += 5) {
        const appear = Math.min(1, Math.max(0, k * 1.8 - data[i + 3] * 0.8));
        if (appear <= 0) continue;
        const inset = 1.5 + (1 - appear) * data[i + 2] * 0.3;
        const x = data[i] + inset;
        const y = data[i + 1] + inset;
        const s = data[i + 2] - inset * 2;
        const rr = Skia.RRectXY(Skia.XYWHRect(x, y, s, s), radius, radius);
        if (data[i + 4] === 1) {
          paint.setColor(Skia.Color(BOARD.shadow));
          paint.setAlphaf(0.85 * appear);
          canvas.drawRRect(rr, paint);
          paint.setColor(Skia.Color(CELL.border));
          paint.setAlphaf(0.25 * appear);
          canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x + s * 0.12, y + s * 0.12, s * 0.76, s * 0.76), radius * 0.7, radius * 0.7), paint);
        } else {
          paint.setColor(Skia.Color(CELL.shadow));
          paint.setAlphaf(appear);
          canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x, y + 1.5, s, s), radius, radius), paint);
          paint.setShader(
            Skia.Shader.MakeLinearGradient(vec(x, y), vec(x, y + s), [Skia.Color(CELL.highlight), Skia.Color(CELL.base)], [0, 0.55], TileMode.Clamp),
          );
          canvas.drawRRect(rr, paint);
          paint.setShader(null);
          paint.setStyle(PaintStyle.Stroke);
          paint.setStrokeWidth(1);
          paint.setColor(Skia.Color(CELL.border));
          paint.setAlphaf(appear);
          canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x + 0.5, y + 0.5, s - 1, s - 1), radius, radius), paint);
          paint.setStyle(PaintStyle.Fill);
        }
      }
    });
  }, [staticData, cell]);

  // ---- Dynamic layers (depend on game state) --------------------------------
  const dynamic = useMemo(() => {
    const view = game.view();
    const ghosts = game.ghosts();
    const tints: { x: number; y: number; s: number; color: string; alpha: number }[] = [];
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
      const color = colorOf(pair);
      nodes.forEach((n, idx) => {
        const isBridge = g.nodeLayer[n] !== 'n';
        if (g.nodeLayer[n] === 'v') vNodeOwner.set(n, { pair, idx });
        const [cx, cy] = cellCenter(geom, g.nodeRow[n], g.nodeCol[n]);
        tints.push({ x: cx - cell / 2, y: cy - cell / 2, s: cell, color: flowStyle(color).tint, alpha: isBridge ? tokens.cellTintAlpha / 2 : tokens.cellTintAlpha });
      });
      if (nodes.length >= 2) paths.push({ key: `p${pair}`, color, path: build(nodes) });
    });
    ghosts.forEach((nodes, pair) => {
      if (nodes.length < 1) return;
      const base = view[pair];
      const withJoin = base.length ? [base[base.length - 1], ...nodes] : nodes;
      if (withJoin.length >= 2) ghostPaths.push({ key: `g${pair}`, color: colorOf(pair), path: build(withJoin) });
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
      overpasses.push({ key: `o${r}-${c}`, color: colorOf(owner.pair), path: b.build() });
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
          const f = flowStyle(colorOf(pair));
          return { key: `d${pair}-${k}`, pair, x, y, color: f.base, light: f.bright, dark: f.shadow, glow: f.glow, symbol: d.color };
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
  const fxPicture = useDerivedValue(() => {
    clock.value;
    const list = fx.value;
    const now = Date.now();
    return createPicture((canvas) => drawEffects(canvas, list, now));
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
  const headColor = dynamic.dragging >= 0 ? flowStyle(colorOf(dynamic.dragging)).glow : colors.textPure;

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

  return (
    <GestureDetector gesture={pan}>
      <View style={[styles.wrap, { width: size, height: size }]}>
        <Canvas style={{ width: size, height: size, borderRadius: tokens.radius.lg + 4, overflow: 'hidden' }}>
          <Group transform={boardTransform} opacity={boardOpacity}>
            {/* Board plate */}
            <RoundedRect x={4} y={4} width={size - 8} height={size - 8} r={tokens.radius.lg} color={BOARD.glow} opacity={0.8}>
              <BlurMask blur={2.5} style="outer" />
            </RoundedRect>
            <RoundedRect x={4} y={4} width={size - 8} height={size - 8} r={tokens.radius.lg}>
              <LinearGradient start={vec(0, 0)} end={vec(0, size)} colors={[BOARD.inner, BOARD.bg]} />
              <Shadow dx={0} dy={12} blur={22} color={withAlpha(BOARD.shadow, 0.8)} />
            </RoundedRect>
            <RoundedRect x={4.75} y={4.75} width={size - 9.5} height={size - 9.5} r={tokens.radius.lg} style="stroke" strokeWidth={1.5}>
              <LinearGradient start={vec(0, 0)} end={vec(0, size)} colors={[BOARD.borderHighlight, BOARD.border, BOARD.border]} positions={[0, 0.3, 1]} />
            </RoundedRect>

            <Picture picture={cellsPicture} />

            {/* Cell tints: a filled board becomes a color mosaic */}
            {dynamic.tints.map((t, i) => (
              <RoundedRect key={i} x={t.x + 1.5} y={t.y + 1.5} width={t.s - 3} height={t.s - 3} r={cell * 0.2} color={withAlpha(t.color, t.alpha)} />
            ))}

            {/* Warp portals */}
            {staticData.warps.map((w, i) => (
              <Group key={`w${i}`}>
                <RoundedRect x={w.x} y={w.y} width={w.w} height={w.h} r={Math.min(w.w, w.h) / 2} color={colors.warp} opacity={0.8}>
                  <BlurMask blur={6} style="solid" />
                </RoundedRect>
              </Group>
            ))}

            {/* Ghosts of paths cut by the current drag */}
            {dynamic.ghostPaths.map((p) => (
              <Path key={p.key} path={p.path} color={p.color} style="stroke" strokeWidth={pathW * 0.7} strokeCap="round" strokeJoin="round" opacity={0.3}>
                <DashPathEffect intervals={[pathW * 0.5, pathW * 0.6]} />
              </Path>
            ))}

            {/* Paths: glow, body, glass highlight */}
            {dynamic.paths.map((p) => {
              const f = flowStyle(p.color);
              return (
                <Group key={p.key}>
                  <Path path={p.path} color={f.glow} style="stroke" strokeWidth={pathW * 1.9} strokeCap="round" strokeJoin="round" opacity={tokens.glowAlpha.pipe}>
                    <BlurMask blur={tokens.glowBlur} style="normal" />
                  </Path>
                  <Path path={p.path} color={f.pipeShadow} style="stroke" strokeWidth={pathW} strokeCap="round" strokeJoin="round" />
                  <Path path={p.path} color={f.pipe} style="stroke" strokeWidth={pathW * 0.76} strokeCap="round" strokeJoin="round" />
                  <Path path={p.path} color={f.pipeHighlight} style="stroke" strokeWidth={pathW * 0.22} strokeCap="round" strokeJoin="round" opacity={0.6} />
                </Group>
              );
            })}

            {/* Bridges: glass overpass tile, vertical path on top */}
            {staticData.bridges.map((b) => (
              <Group key={`b${b.r}-${b.c}`}>
                <RoundedRect x={b.x + cell * 0.14} y={b.y + cell * 0.14} width={cell * 0.72} height={cell * 0.72} r={cell * 0.16} color={withAlpha(BOARD.bg, 0.72)}>
                  <Shadow dx={0} dy={2} blur={4} color={withAlpha(BOARD.shadow, 0.7)} />
                </RoundedRect>
                <RoundedRect x={b.x + cell * 0.14} y={b.y + cell * 0.14} width={cell * 0.72} height={cell * 0.72} r={cell * 0.16} style="stroke" strokeWidth={1.2} color={BOARD.borderHighlight} />
              </Group>
            ))}
            {dynamic.overpasses.map((p) => {
              const f = flowStyle(p.color);
              return (
                <Group key={p.key}>
                  <Path path={p.path} color={withAlpha(BOARD.shadow, 0.6)} style="stroke" strokeWidth={pathW * 1.25} strokeCap="round">
                    <BlurMask blur={3} style="normal" />
                  </Path>
                  <Path path={p.path} color={f.pipeShadow} style="stroke" strokeWidth={pathW} strokeCap="round" />
                  <Path path={p.path} color={f.pipe} style="stroke" strokeWidth={pathW * 0.76} strokeCap="round" />
                  <Path path={p.path} color={f.pipeHighlight} style="stroke" strokeWidth={pathW * 0.22} strokeCap="round" opacity={0.6} />
                </Group>
              );
            })}

            {/* Dots */}
            <Group opacity={dotsOpacity}>
              {dots.map((d) => {
                const r = dynamic.connected[d.pair] ? dotR : breathR;
                return (
                  <Group key={d.key}>
                    <Circle cx={d.x} cy={d.y} r={dotR * 1.3} color={d.glow} opacity={dynamic.connected[d.pair] ? tokens.glowAlpha.beadStrong : tokens.glowAlpha.bead}>
                      <BlurMask blur={dotR * 0.6} style="normal" />
                    </Circle>
                    <Circle cx={d.x} cy={d.y} r={r}>
                      <RadialGradient c={vec(d.x - dotR * 0.3, d.y - dotR * 0.35)} r={dotR * 1.4} colors={[d.light, d.color, d.dark]} />
                    </Circle>
                    <Circle cx={d.x - dotR * 0.32} cy={d.y - dotR * 0.36} r={dotR * 0.2} color="rgba(255,255,255,0.6)" />
                    {colorblind && <Path path={symbolPath(d.symbol, d.x, d.y, dotR * 0.45)} color="rgba(10,10,25,0.7)" />}
                  </Group>
                );
              })}
            </Group>

            {/* Comet head of the path being drawn */}
            <Group opacity={headOn}>
              <Circle cx={headX} cy={headY} r={pathW * 1.1} color={headColor} opacity={0.7}>
                <BlurMask blur={pathW * 0.8} style="normal" />
              </Circle>
              <Circle cx={headX} cy={headY} r={pathW * 0.38} color="rgba(255,255,255,0.9)" />
            </Group>

            <Picture picture={fxPicture} />
          </Group>

          {/* Finger halo on dense boards so the head is not hidden under the finger */}
          <Group opacity={haloOpacity}>
            <Circle cx={pointerX} cy={haloY} r={cell * 1.2} color={withAlpha(BOARD.shadow, 0.6)} />
            <Circle cx={pointerX} cy={haloY} r={cell * 1.2} color="rgba(255,255,255,0.5)" style="stroke" strokeWidth={1.5} />
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
