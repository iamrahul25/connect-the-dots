import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Text, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Game, isTeleportStep, sameCell, type Cell, type DailyTier, type GameEvent, type Level } from '@ctd/core';
import { Board } from '../board/Board';
import { cellAtRaw, cellCenter, clampCell, frameWidth, makeGeom } from '../board/geometry';
import type { Effect, EffectInput } from '../board/effects';
import { BUTTON_H, GlassButton } from '../ui/GlassButton';
import { useToast } from '../ui/Toast';
import { LANDSCAPE_H } from '../ui/Background';
import { useLayout } from '../ui/layout';
import { ResultModal, type ResultInfo } from './ResultModal';
import { ObstacleInfo, obstaclesIn } from './ObstacleInfo';
import { fonts, tokens } from '../theme/tokens';
import { musicFor } from '../theme/packs';
import { makeStyles, usePalette, useTheme } from '../theme/useTheme';
import { lockColor } from '../theme/config';
import { useSettings } from '../store/settings';
import { starsFor, useProgress } from '../store/progress';
import { audio } from '../services/audio';
import { haptics } from '../services/haptics';

export interface GameScreenProps {
  level: Level;
  mode: 'pack' | 'daily';
  title: string;
  subtitle?: string;
  /** Pack music key (`dawn`, `lagoon`, ..., `daily`). */
  pack: string;
  nextLabel: string;
  onNext: () => void;
  onLevels: () => void;
  /** Daily puzzles are keyed by date and tier. */
  daily?: { key: string; tier: DailyTier };
}

const IDLE_MS = 45_000;
/** Keeps the bottom controls above the tallest trees of the background landscape. */
const CONTROLS_LIFT = Math.round(LANDSCAPE_H * 0.6);
const HEADER_H = 60;
/** Minimum space kept between the board and the HUD above it / the controls below it. */
const BOARD_GAP = 16;
const HUD_GAP = 10;
/** Narrowest HUD tile (base size) that still fits its icon; below this the icons are hidden. */
const HUD_ICON_MIN_W = 100;
/** Side inset of the controls row, as a fraction of the board width. */
const CONTROLS_INSET = 0.08;
/** Base max width of each Undo / Hint button, so they don't stretch into bars on tablets. */
const CONTROL_MAX_W = 220;
/** How far (in cells) the pointer must pass a warp edge before wrapping, so jitter on the edge can't bounce. */
const WARP_MARGIN = 0.35;
/** Half-size (in cells) of the zone around a cell's center the pointer must reach to retract a finished line onto it. */
const RETRACT_ZONE = 0.3;

const sameCellPair = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1];

export function GameScreen({ level, mode, title, subtitle, pack, nextLabel, onNext, onLevels, daily }: GameScreenProps) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { gutter, s } = useLayout();
  const { colorblind, reduceMotion, idleHints } = useSettings();
  const hints = useProgress((s) => s.hints);
  const unlimitedHints = useSettings((s) => __DEV__ && s.unlimitedHints);
  const palette = usePalette();
  const toast = useToast();

  const game = useMemo(() => {
    const g = new Game(level);
    const saved = useProgress.getState().inProgress[level.id];
    if (saved) g.load(saved);
    return g;
  }, [level]);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const [result, setResult] = useState<ResultInfo | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);
  const hasObstacles = obstaclesIn(level).length > 0;
  const wonRef = useRef(false);

  // HUD, board and controls form one vertically centered stack. The board takes whatever the
  // stage leaves after the measured HUD, controls and gaps, so changes to the surrounding UI
  // can never push it into its neighbours.
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);
  const [hudH, setHudH] = useState(0);
  const [controlsH, setControlsH] = useState(0);
  const onStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setStage((a) => (a && a.w === w && a.h === h ? a : { w, h }));
  }, []);
  const onHudLayout = useCallback((e: LayoutChangeEvent) => setHudH(e.nativeEvent.layout.height), []);
  const onControlsLayout = useCallback((e: LayoutChangeEvent) => setControlsH(e.nativeEvent.layout.height), []);
  const measured = stage !== null && hudH > 0 && controlsH > 0;
  const boardSize = measured
    ? Math.floor(Math.max(0, Math.min(stage.w, stage.h - hudH - controlsH - s(BOARD_GAP) * 2, s(tokens.maxBoardWidth))))
    : 0;
  const { borderWidth, cellGap } = theme.board;
  const geom = useMemo(
    () => makeGeom(level.size.width, level.size.height, boardSize, level.warps.length ? undefined : { borderWidth, cellGap }),
    [level, boardSize, borderWidth, cellGap],
  );
  // Top (HUD) and bottom (controls) sections match the drawn board frame, so the three read as one column.
  const boardFrameW = boardSize > 0 ? Math.round(frameWidth(geom, cellGap, borderWidth)) : 0;
  const sectionWidth = boardFrameW > 0 ? boardFrameW : '100%';
  const controlsInset = Math.round(boardFrameW * CONTROLS_INSET);
  const compactHud = boardFrameW > 0 && (boardFrameW - s(HUD_GAP) * 2) / 3 < s(HUD_ICON_MIN_W);

  const fx = useSharedValue<Effect[]>([]);
  const intro = useSharedValue(0);
  const shake = useSharedValue(0);

  useEffect(() => {
    audio.playMusic(musicFor(pack));
    useProgress.getState().setLastPlayed(level.id);
  }, [pack, level.id]);

  useEffect(() => {
    wonRef.current = false;
    setResult(null);
    intro.value = 0;
    intro.value = withTiming(1, { duration: reduceMotion ? 200 : 950 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level.id]);

  // Refs keep gesture callbacks stable across renders.
  const ref = useRef({ game, geom, level, palette, reduceMotion, theme });
  ref.current = { game, geom, level, palette, reduceMotion, theme };

  const emit = useCallback(
    (e: EffectInput) => {
      if (ref.current.reduceMotion && (e.kind === 'burst' || e.kind === 'confetti')) return;
      const now = Date.now();
      fx.value = [...fx.value.filter((f) => now - f.t0 < f.dur), { ...e, t0: now } as Effect];
    },
    [fx],
  );

  const lineOf = (pair: number) => ref.current.palette[ref.current.level.dots[pair].color % ref.current.palette.length].line;
  const centerOfNode = (n: number) => {
    const { game: gm, geom: gg } = ref.current;
    return cellCenter(gg, gm.g.nodeRow[n], gm.g.nodeCol[n]);
  };

  const onWin = useCallback(() => {
    if (wonRef.current) return;
    wonRef.current = true;
    const { game: gm, geom: gg, level: lv } = ref.current;
    haptics.success();
    audio.duck();
    audio.play('level_complete');
    const cells: number[] = [];
    for (let r = 0; r < gg.H; r++) for (let c = 0; c < gg.W; c++) cells.push(gg.ox + c * gg.cell + 1.5, gg.oy + r * gg.cell + 1.5, gg.cell - 3, r + c);
    emit({ kind: 'sweep', dur: 1300, cells, maxOrder: gg.W + gg.H, radius: gg.cell * 0.2 });
    emit({ kind: 'flash', dur: 900, x: 4, y: 4, w: gg.size - 8, h: gg.size - 8, radius: tokens.radius.lg, color: ref.current.theme.accent.color });
    emit({ kind: 'confetti', dur: 2600, colors: lv.dots.map((d) => ref.current.palette[d.color % ref.current.palette.length].dot), count: 70, w: gg.size, h: gg.size, seed: Date.now() % 1000 });

    const usedHint = gm.hinted.size > 0;
    const stars = starsFor(gm.moves, lv.stars.perfectMoves, lv.stars.twoStarMoves, usedHint);
    const progress = useProgress.getState();
    let info: ResultInfo;
    if (mode === 'daily' && daily) {
      const prev = progress.daily.completed[daily.key]?.[daily.tier];
      const r = progress.completeDaily(daily.key, daily.tier, stars, gm.moves);
      progress.saveBoard(lv.id, null);
      info = {
        stars, moves: gm.moves, best: prev ? Math.min(prev.moves, gm.moves) : gm.moves, perfect: lv.stars.perfectMoves,
        hintsEarned: r.hintsEarned, packCompleted: false, usedHint, streak: useProgress.getState().daily.streak,
        perfectDay: r.perfectDay,
      };
    } else {
      const prev = progress.levels[lv.id];
      const r = progress.completeLevel(lv.id, stars, gm.moves, usedHint);
      info = {
        stars, moves: gm.moves, best: prev ? Math.min(prev.bestMoves, gm.moves) : gm.moves, perfect: lv.stars.perfectMoves,
        hintsEarned: r.hintsEarned, packCompleted: r.packCompleted, usedHint,
      };
      if (r.packCompleted) setTimeout(() => audio.play('pack_unlock'), 1400);
    }
    setTimeout(() => setResult(info), ref.current.reduceMotion ? 300 : 1150);
  }, [emit, mode, daily]);

  const process = useCallback(
    (events: GameEvent[]) => {
      const { game: gm, geom: gg } = ref.current;
      for (const e of events) {
        switch (e.type) {
          case 'start': {
            haptics.selection();
            audio.play('tap', { volume: 0.45 });
            const p = gm.view()[e.pair];
            if (p.length) {
              const [x, y] = centerOfNode(p[p.length - 1]);
              emit({ kind: 'ring', dur: 450, x, y, color: lineOf(e.pair), r0: gg.cell * 0.3, r1: gg.cell * 0.8, width: 3 });
            }
            break;
          }
          case 'extend':
            haptics.selection();
            audio.play('tick', { volume: 0.3, rate: 1 + Math.min(0.6, e.length * 0.025) });
            break;
          case 'retract':
            audio.play('retract', { volume: 0.25 });
            break;
          case 'connect': {
            const color = lineOf(e.pair);
            audio.note(ref.current.level.dots[e.pair].color);
            haptics.light();
            const nodes = gm.view()[e.pair];
            const pts = nodes.flatMap((n) => centerOfNode(n));
            const [hx, hy] = centerOfNode(nodes[nodes.length - 1]);
            const [sx, sy] = centerOfNode(nodes[0]);
            emit({ kind: 'burst', dur: 650, x: hx, y: hy, color, count: 16, radius: gg.cell * 1.3, seed: e.pair * 7 + nodes.length });
            emit({ kind: 'ring', dur: 600, x: hx, y: hy, color, r0: gg.cell * 0.35, r1: gg.cell * 1.1, width: 3 });
            emit({ kind: 'ring', dur: 600, x: sx, y: sy, color, r0: gg.cell * 0.35, r1: gg.cell * 1.1, width: 3 });
            emit({ kind: 'wave', dur: Math.min(900, 180 + nodes.length * 45), color, pts, size: gg.cell * 0.32 });
            break;
          }
          case 'cut':
            audio.play('cut', { volume: 0.5 });
            break;
          case 'invalid':
            audio.play('invalid', { volume: 0.55 });
            haptics.warning();
            if (!ref.current.reduceMotion) {
              shake.value = withSequence(
                withTiming(-6, { duration: 40 }),
                withTiming(6, { duration: 60 }),
                withTiming(-3, { duration: 50 }),
                withTiming(0, { duration: 40 }),
              );
            }
            break;
          case 'warp': {
            audio.play('warp', { volume: 0.6 });
            for (const n of [e.from, e.to]) {
              const [x, y] = centerOfNode(n);
              emit({ kind: 'ring', dur: 500, x, y, color: ref.current.theme.board.warp, r0: gg.cell * 0.2, r1: gg.cell * 0.9, width: 3 });
            }
            break;
          }
          case 'teleport': {
            audio.play('warp', { volume: 0.6 });
            haptics.light();
            const color = lineOf(e.pair);
            for (const n of [e.from, e.to]) {
              const [x, y] = centerOfNode(n);
              emit({ kind: 'ring', dur: 550, x, y, color, r0: gg.cell * 0.15, r1: gg.cell * 0.9, width: 3 });
            }
            break;
          }
          case 'rotate': {
            audio.play('tap', { volume: 0.5 });
            haptics.selection();
            const [x, y] = cellCenter(gg, e.cell[0], e.cell[1]);
            emit({ kind: 'ring', dur: 350, x, y, color: ref.current.theme.board.bridgeBorder, r0: gg.cell * 0.3, r1: gg.cell * 0.6, width: 2 });
            break;
          }
          case 'door': {
            const lock = ref.current.level.locks?.[e.lock];
            if (!lock) break;
            const [x, y] = cellCenter(gg, lock.door[0], lock.door[1]);
            if (e.open) {
              audio.play('hint', { volume: 0.6 });
              haptics.light();
              emit({ kind: 'ring', dur: 650, x, y, color: lockColor(e.lock), r0: gg.cell * 0.3, r1: gg.cell * 1.1, width: 3 });
            } else {
              audio.play('cut', { volume: 0.4 });
            }
            break;
          }
          case 'win':
            onWin();
            break;
        }
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [emit, onWin, shake],
  );

  const save = useCallback(() => {
    const { game: gm, level: lv } = ref.current;
    if (!wonRef.current) useProgress.getState().saveBoard(lv.id, gm.save());
  }, []);

  const lastTarget = useRef<Cell | null>(null);
  const wrapShift = useRef<[number, number]>([0, 0]);
  /** A press on a tunnel / rotator: a release without leaving the cell rotates it, a drag starts a path there. */
  const pendingTap = useRef<Cell | null>(null);
  /** Path length kept from before this gesture; only teleports made during the gesture offset the pointer. */
  const gestureBase = useRef(0);

  const onDown = useCallback(
    (x: number, y: number) => {
      if (wonRef.current) return;
      const { game: gm, geom: gg } = ref.current;
      const [r, c] = cellAtRaw(gg, x, y);
      pendingTap.current = null;
      if (r < 0 || c < 0 || r >= gg.H || c >= gg.W) return;
      lastTarget.current = [r, c];
      wrapShift.current = [0, 0];
      if (gm.orientationAt([r, c])) {
        pendingTap.current = [r, c];
        return;
      }
      const ev = gm.beginDrag([r, c]);
      if (ev.length) {
        gestureBase.current = gm.view()[gm.dragging].length;
        process(ev);
        bump();
      }
    },
    [bump, process],
  );

  const onMove = useCallback(
    (x: number, y: number) => {
      const { game: gm, geom: gg } = ref.current;
      if (wonRef.current) return;
      if (pendingTap.current) {
        const start = pendingTap.current;
        if (sameCellPair(cellAtRaw(gg, x, y), start)) return;
        pendingTap.current = null;
        const ev = gm.beginDrag(start);
        if (!ev.length) return;
        gestureBase.current = gm.view()[gm.dragging].length;
        process(ev);
        bump();
      }
      if (gm.dragging < 0) return;
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
        gestureBase.current = Math.min(gestureBase.current, p.length);
        for (let i = p.length - 1; i >= gestureBase.current; i--) {
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
      let vx = x + wrapShift.current[0];
      let vy = y + wrapShift.current[1];
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
        if (lastTarget.current && sameCellPair(lastTarget.current, wrap)) return;
        lastTarget.current = wrap;
        const ev = gm.dragTo(wrap);
        if (ev.length && ev[0].type !== 'invalid') {
          wrapShift.current = [wrapShift.current[0] + shift[0], wrapShift.current[1] + shift[1]];
        }
        if (ev.length) {
          process(ev);
          bump();
        }
        return;
      }

      // Finger came back onto the board somewhere the shifted mapping can't reach: follow the finger again.
      if ((wrapShift.current[0] || wrapShift.current[1]) && inside(x, y) && !inside(vx, vy)) {
        wrapShift.current = [0, 0];
        vx = x;
        vy = y;
      }

      const px = vx + tele.dx;
      const py = vy + tele.dy;
      const target = clampCell(gg, cellAtRaw(gg, px, py));
      if (lastTarget.current && sameCellPair(lastTarget.current, target)) return;

      const path = gm.view()[gm.dragging];
      const onPath = path.some((n) => sameCell(g, n, target));
      const complete = gm.isComplete(gm.dragging);
      if (complete && onPath) {
        // Release jitter or an off-board pointer clamped onto the line must not break a finished
        // connection: it only retracts once the pointer is well inside one of its cells.
        const [cx, cy] = cellCenter(gg, target[0], target[1]);
        const zone = gg.cell * RETRACT_ZONE;
        if (Math.abs(px - cx) > zone || Math.abs(py - cy) > zone) return;
      }
      lastTarget.current = target;

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
        // Walk cell by cell toward the pointer so fast swipes never skip cells.
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
      if (events.length) {
        process(events);
        bump();
      }
    },
    [bump, process],
  );

  const onUp = useCallback(() => {
    const { game: gm, geom: gg } = ref.current;
    lastTarget.current = null;
    wrapShift.current = [0, 0];
    const tap = pendingTap.current;
    pendingTap.current = null;
    if (tap && gm.dragging < 0 && !wonRef.current) {
      const ev = gm.rotate(tap);
      if (ev.length) {
        process(ev);
        bump();
        save();
      }
      return;
    }
    if (gm.dragging < 0) return;
    const ev = gm.endDrag();
    bump();
    save();
    process(ev);
    if (!wonRef.current && gm.connectedCount() === gm.pairCount && gm.fillRatio() < 1) {
      toast.show('Fill every cell ✨');
      const owner = gm.ownerMap();
      for (let v = 0; v < gm.g.nodeCount; v++) {
        if (owner[v] !== -1 || gm.endpointPair[v] !== -1 || !gm.isActive(v)) continue;
        const [x, y] = cellCenter(gg, gm.g.nodeRow[v], gm.g.nodeCol[v]);
        emit({ kind: 'flash', dur: 900, x: x - gg.cell / 2 + 2, y: y - gg.cell / 2 + 2, w: gg.cell - 4, h: gg.cell - 4, radius: gg.cell * 0.2, color: ref.current.theme.accent.color });
      }
    }
  }, [bump, process, save, emit, toast]);

  const onUndo = useCallback(() => {
    if (wonRef.current) return;
    if (game.undo()) {
      audio.play('retract', { volume: 0.4 });
      bump();
      save();
    }
  }, [game, bump, save]);

  const onRestart = useCallback(() => {
    if (wonRef.current) return;
    game.restart();
    useProgress.getState().saveBoard(level.id, null);
    intro.value = 0.4;
    intro.value = withTiming(1, { duration: 500 });
    bump();
  }, [game, level.id, bump, intro]);

  const onHint = useCallback(() => {
    if (wonRef.current) return;
    const pair = game.hintPair(level.solution);
    if (pair < 0) return;
    if (!useProgress.getState().spendHint()) {
      toast.show('No hints left · earn them with ★★★ levels');
      return;
    }
    const cells = level.solution[String(pair)];
    const ev = game.applySolutionPath(pair, cells);
    audio.play('hint');
    const nodes = game.view()[pair];
    const pts = nodes.flatMap((n) => centerOfNode(n));
    emit({ kind: 'wave', dur: 700, color: lineOf(pair), pts, size: geom.cell * 0.4 });
    for (const n of [nodes[0], nodes[nodes.length - 1]]) {
      const [x, y] = centerOfNode(n);
      emit({ kind: 'ring', dur: 700, x, y, color: theme.text.primary, r0: geom.cell * 0.3, r1: geom.cell * 1.2, width: 3 });
    }
    audio.note(level.dots[pair].color, 0.6);
    bump();
    save();
    if (ev.some((e) => e.type === 'win')) onWin();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, level, emit, geom, bump, save, onWin, toast]);

  // Idle nudge: shimmer an unconnected pair after a long pause.
  useEffect(() => {
    if (!idleHints || result) return;
    const t = setTimeout(() => {
      if (wonRef.current) return;
      const view = game.view();
      const pair = view.findIndex((_, p) => !game.isComplete(p, view));
      if (pair < 0) return;
      for (const n of game.endpoints[pair]) {
        const [x, y] = centerOfNode(n);
        emit({ kind: 'ring', dur: 1100, x, y, color: lineOf(pair), r0: geom.cell * 0.3, r1: geom.cell * 1.3, width: 4 });
      }
    }, IDLE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version, idleHints, result, game, emit, geom]);

  // Keyboard shortcuts on web.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (infoOpen) {
        if (k === 'escape' || k === 'i') setInfoOpen(false);
        return;
      }
      if (k === 'z') onUndo();
      else if (k === 'r' && !e.ctrlKey && !e.metaKey) onRestart();
      else if (k === 'h') onHint();
      else if (k === 'i' && hasObstacles) setInfoOpen(true);
      else if (k === 'escape') onLevels();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onUndo, onRestart, onHint, onLevels, infoOpen, hasObstacles]);

  const openInfo = useCallback(() => setInfoOpen(true), []);
  const view = game.view();
  const connected = game.connectedCount(view);
  const fill = game.fillRatio(view);

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + gutter - s(HEADER_H - BUTTON_H.sm) / 2,
          paddingBottom: insets.bottom + 12 + CONTROLS_LIFT,
          paddingLeft: insets.left + gutter,
          paddingRight: insets.right + gutter,
        },
      ]}
    >
      <Header title={title} subtitle={subtitle} onBack={onLevels} onRestart={onRestart} />

      <View style={styles.stage} onLayout={onStageLayout}>
        <View style={[styles.hud, { width: sectionWidth }]} onLayout={onHudLayout}>
          <Hud icon="footsteps" iconColor={theme.icon.streak} label="Moves" value={`${game.moves}`} compact={compactHud} />
          <Hud icon="link" iconColor={theme.icon.hint} label="Flows" value={`${connected}/${game.pairCount}`} compact={compactHud} />
          <Hud
            icon="color-fill"
            iconColor={theme.icon.success}
            label="Fill"
            value={`${Math.round(fill * 100)}%`}
            compact={compactHud}
            progress={fill}
            reduceMotion={reduceMotion}
          />
        </View>

        {boardSize > 0 && (
          <View style={styles.board}>
            <Board
              game={game}
              version={version}
              geom={geom}
              palette={palette}
              colorblind={colorblind}
              reduceMotion={reduceMotion}
              fx={fx}
              intro={intro}
              shake={shake}
              onDown={onDown}
              onMove={onMove}
              onUp={onUp}
            />
          </View>
        )}

        <View style={[styles.controls, { width: sectionWidth, paddingHorizontal: controlsInset }]} onLayout={onControlsLayout}>
          <GlassButton icon="arrow-undo" label="Undo" onPress={onUndo} disabled={!game.canUndo()} style={styles.controlButton} />
          <GlassButton icon="bulb" label="Hint" variant="primary" onPress={onHint} badge={unlimitedHints ? '∞' : hints} style={styles.controlButton} />
          {hasObstacles && (
            <GlassButton icon="information-circle" iconColor={theme.icon.info} onPress={openInfo} accessibilityLabel="Obstacle info" />
          )}
        </View>
      </View>

      {toast.node}
      {infoOpen && <ObstacleInfo puzzle={level} palette={palette} onClose={() => setInfoOpen(false)} />}
      {result && (
        <ResultModal
          result={result}
          nextLabel={nextLabel}
          onNext={onNext}
          onReplay={() => {
            game.restart();
            wonRef.current = false;
            setResult(null);
            fx.value = [];
            intro.value = 0;
            intro.value = withTiming(1, { duration: 700 });
            bump();
          }}
          onLevels={onLevels}
          reduceMotion={reduceMotion}
        />
      )}
    </View>
  );
}

type IconName = keyof typeof Ionicons.glyphMap;

// The screen re-renders on every cell of a drag; these stay put unless their own props change.
const Header = memo(function Header({
  title,
  subtitle,
  onBack,
  onRestart,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  onRestart: () => void;
}) {
  const styles = useStyles();
  return (
    <View style={styles.header}>
      <GlassButton icon="chevron-back" size="sm" onPress={onBack} accessibilityLabel="Back to levels" />
      <View style={styles.titleWrap}>
        <Text style={styles.title}>{title}</Text>
        {subtitle && (
          <View style={styles.titlePill}>
            <Text style={styles.subtitle}>{subtitle}</Text>
          </View>
        )}
      </View>
      <GlassButton icon="refresh" size="sm" onPress={onRestart} accessibilityLabel="Restart level" />
    </View>
  );
});

function HudIcon({ icon, color }: { icon: IconName; color: string }) {
  const { s } = useLayout();
  return <Ionicons name={icon} size={s(28)} color={color} />;
}

const Hud = memo(function Hud({
  icon,
  iconColor,
  label,
  value,
  compact,
  progress,
  reduceMotion,
}: {
  icon: IconName;
  iconColor: string;
  label: string;
  value: string;
  compact: boolean;
  /** 0..1; renders a progress bar along the bottom edge when set. */
  progress?: number;
  reduceMotion?: boolean;
}) {
  const styles = useStyles();
  return (
    <View style={styles.hudItem}>
      {!compact && <HudIcon icon={icon} color={iconColor} />}
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.hudLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.hudValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
      {progress !== undefined && <HudProgress progress={progress} color={iconColor} reduceMotion={!!reduceMotion} />}
    </View>
  );
});

function HudProgress({ progress, color, reduceMotion }: { progress: number; color: string; reduceMotion: boolean }) {
  const styles = useStyles();
  const p = useSharedValue(progress);
  useEffect(() => {
    const clamped = Math.max(0, Math.min(1, progress));
    p.value = reduceMotion ? clamped : withTiming(clamped, { duration: 250 });
  }, [progress, reduceMotion, p]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${p.value * 100}%` }));
  return (
    <View style={styles.hudTrack} pointerEvents="none">
      <Animated.View style={[styles.hudTrackFill, { backgroundColor: color }, fillStyle]} />
    </View>
  );
}

const useStyles = makeStyles((t, s) => ({
  root: { flex: 1, alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', width: '100%', height: s(HEADER_H) },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: { fontFamily: fonts.titleBold, fontSize: s(24), color: t.text.primary, letterSpacing: 0.3 },
  titlePill: { marginTop: 2, paddingHorizontal: s(12), paddingVertical: 1, borderRadius: tokens.radius.pill, backgroundColor: t.box.pill },
  subtitle: { fontFamily: fonts.bodyBold, fontSize: s(11), letterSpacing: 1, color: t.box.pillText },
  hud: { flexDirection: 'row', gap: s(HUD_GAP) },
  hudItem: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(8),
    paddingHorizontal: s(12),
    paddingVertical: s(12),
    borderRadius: s(18),
    backgroundColor: t.box.background,
    borderWidth: 1,
    borderColor: t.box.border,
    overflow: 'hidden',
  },
  hudTrack: { position: 'absolute', left: s(14), right: s(14), bottom: s(6), height: s(4), borderRadius: s(2), backgroundColor: t.box.pill },
  hudTrackFill: { height: '100%', borderRadius: s(2) },
  hudLabel: { fontFamily: fonts.body, fontSize: s(13), color: t.text.secondary },
  hudValue: { fontFamily: fonts.title, fontSize: s(20), lineHeight: s(22), color: t.text.primary },
  stage: { flex: 1, minHeight: 0, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center' },
  board: { marginVertical: s(BOARD_GAP) },
  controls: { flexDirection: 'row', gap: s(14), justifyContent: 'center', alignItems: 'center' },
  controlButton: { flex: 1, maxWidth: s(CONTROL_MAX_W) },
}));
