import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { Game, sameCell, type Cell, type GameEvent, type Level } from '@ctd/core';
import { Board } from '../board/Board';
import { cellAtRaw, cellCenter, clampCell, makeGeom } from '../board/geometry';
import type { Effect, EffectInput } from '../board/effects';
import { GlassButton } from '../ui/GlassButton';
import { useToast } from '../ui/Toast';
import { ResultModal, type ResultInfo } from './ResultModal';
import { ObstacleInfo, obstaclesIn } from './ObstacleInfo';
import { colors, fonts, tokens } from '../theme/tokens';
import { COLORBLIND_PALETTE, flowStyle, PALETTE, themeFor } from '../theme/themes';
import { withAlpha } from '../board/color';
import { useSettings } from '../store/settings';
import { starsFor, useProgress } from '../store/progress';
import { useUi } from '../store/ui';
import { audio } from '../services/audio';
import { haptics } from '../services/haptics';

export interface GameScreenProps {
  level: Level;
  mode: 'pack' | 'daily';
  title: string;
  subtitle?: string;
  themeId: string;
  nextLabel: string;
  onNext: () => void;
  onLevels: () => void;
  /** Daily puzzles are keyed by date. */
  dailyKey?: string;
}

const IDLE_MS = 45_000;
/** How far (in cells) the pointer must pass a warp edge before wrapping, so jitter on the edge can't bounce. */
const WARP_MARGIN = 0.35;

const sameCellPair = (a: Cell, b: Cell) => a[0] === b[0] && a[1] === b[1];

export function GameScreen({ level, mode, title, subtitle, themeId, nextLabel, onNext, onLevels, dailyKey }: GameScreenProps) {
  const theme = themeFor(themeId);
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const { colorblind, reduceMotion, idleHints } = useSettings();
  const hints = useProgress((s) => s.hints);
  const palette = colorblind ? COLORBLIND_PALETTE : PALETTE;
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

  const boardSize = Math.floor(
    Math.max(240, Math.min(width - 24, height - insets.top - insets.bottom - 230, tokens.maxBoardWidth)),
  );
  const geom = useMemo(() => makeGeom(level.size.width, level.size.height, boardSize), [level, boardSize]);

  const fx = useSharedValue<Effect[]>([]);
  const intro = useSharedValue(0);
  const shake = useSharedValue(0);

  useEffect(() => {
    useUi.getState().setTheme(themeId);
    audio.playMusic(theme.music);
    useProgress.getState().setLastPlayed(level.id);
  }, [themeId, theme.music, level.id]);

  useEffect(() => {
    wonRef.current = false;
    setResult(null);
    intro.value = 0;
    intro.value = withTiming(1, { duration: reduceMotion ? 200 : 950 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [level.id]);

  // Refs keep gesture callbacks stable across renders.
  const ref = useRef({ game, geom, level, palette, reduceMotion });
  ref.current = { game, geom, level, palette, reduceMotion };

  const emit = useCallback(
    (e: EffectInput) => {
      if (ref.current.reduceMotion && (e.kind === 'burst' || e.kind === 'confetti')) return;
      const now = Date.now();
      fx.value = [...fx.value.filter((f) => now - f.t0 < f.dur), { ...e, t0: now } as Effect];
    },
    [fx],
  );

  const glowOf = (pair: number) => flowStyle(ref.current.palette[ref.current.level.dots[pair].color % ref.current.palette.length]).glow;
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
    emit({ kind: 'flash', dur: 900, x: 4, y: 4, w: gg.size - 8, h: gg.size - 8, radius: tokens.radius.lg, color: colors.textPure });
    emit({ kind: 'confetti', dur: 2600, colors: lv.dots.map((d) => ref.current.palette[d.color % ref.current.palette.length]), count: 70, w: gg.size, h: gg.size, seed: Date.now() % 1000 });

    const usedHint = gm.hinted.size > 0;
    const stars = starsFor(gm.moves, lv.stars.perfectMoves, lv.stars.twoStarMoves, usedHint);
    const progress = useProgress.getState();
    let info: ResultInfo;
    if (mode === 'daily' && dailyKey) {
      const prev = progress.daily.completed[dailyKey];
      const r = progress.completeDaily(dailyKey, stars, gm.moves);
      progress.saveBoard(lv.id, null);
      info = {
        stars, moves: gm.moves, best: prev ? Math.min(prev.moves, gm.moves) : gm.moves, perfect: lv.stars.perfectMoves,
        hintsEarned: r.hintsEarned, packCompleted: false, usedHint, streak: useProgress.getState().daily.streak,
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
  }, [emit, mode, dailyKey]);

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
              emit({ kind: 'ring', dur: 450, x, y, color: glowOf(e.pair), r0: gg.cell * 0.3, r1: gg.cell * 0.8, width: 3 });
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
            const color = glowOf(e.pair);
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
              emit({ kind: 'ring', dur: 500, x, y, color: colors.warp, r0: gg.cell * 0.2, r1: gg.cell * 0.9, width: 3 });
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

  const onDown = useCallback(
    (x: number, y: number) => {
      if (wonRef.current) return;
      const { game: gm, geom: gg } = ref.current;
      const [r, c] = cellAtRaw(gg, x, y);
      if (r < 0 || c < 0 || r >= gg.H || c >= gg.W) return;
      lastTarget.current = [r, c];
      wrapShift.current = [0, 0];
      const ev = gm.beginDrag([r, c]);
      if (ev.length) {
        process(ev);
        bump();
      }
    },
    [bump, process],
  );

  const onMove = useCallback(
    (x: number, y: number) => {
      const { game: gm, geom: gg } = ref.current;
      if (wonRef.current || gm.dragging < 0) return;
      const g = gm.g;
      const headOf = () => {
        const p = gm.view()[gm.dragging];
        const n = p[p.length - 1];
        return [g.nodeRow[n], g.nodeCol[n]] as Cell;
      };
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

      const target = clampCell(gg, cellAtRaw(gg, vx, vy));
      if (lastTarget.current && sameCellPair(lastTarget.current, target)) return;
      lastTarget.current = target;

      const events: GameEvent[] = [];
      const path = gm.view()[gm.dragging];
      if (path.some((n) => sameCell(g, n, target))) {
        events.push(...gm.dragTo(target));
      } else {
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
            const alt = gm.dragTo(secondary);
            if (alt.length && alt[0].type !== 'invalid') ev = alt;
          }
          if (ev.length === 0) break;
          events.push(...ev);
          if (ev[0].type === 'invalid' || ev.some((e) => e.type === 'connect')) break;
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
    if (gm.dragging < 0) return;
    const ev = gm.endDrag();
    bump();
    save();
    process(ev);
    if (!wonRef.current && gm.connectedCount() === gm.pairCount && gm.fillRatio() < 1) {
      toast.show('Fill every cell ✨');
      const owner = gm.ownerMap();
      for (let v = 0; v < gm.g.nodeCount; v++) {
        if (owner[v] !== -1 || gm.endpointPair[v] !== -1) continue;
        const [x, y] = cellCenter(gg, gm.g.nodeRow[v], gm.g.nodeCol[v]);
        emit({ kind: 'flash', dur: 900, x: x - gg.cell / 2 + 2, y: y - gg.cell / 2 + 2, w: gg.cell - 4, h: gg.cell - 4, radius: gg.cell * 0.2, color: colors.textPure });
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
    emit({ kind: 'wave', dur: 700, color: glowOf(pair), pts, size: geom.cell * 0.4 });
    for (const n of [nodes[0], nodes[nodes.length - 1]]) {
      const [x, y] = centerOfNode(n);
      emit({ kind: 'ring', dur: 700, x, y, color: colors.textPure, r0: geom.cell * 0.3, r1: geom.cell * 1.2, width: 3 });
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
        emit({ kind: 'ring', dur: 1100, x, y, color: glowOf(pair), r0: geom.cell * 0.3, r1: geom.cell * 1.3, width: 4 });
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

  const view = game.view();
  const connected = game.connectedCount(view);
  const fill = game.fillRatio(view);
  const best = mode === 'daily' && dailyKey
    ? useProgress.getState().daily.completed[dailyKey]?.moves
    : useProgress.getState().levels[level.id]?.bestMoves;

  const fillAnim = useSharedValue(fill);
  useEffect(() => {
    fillAnim.value = withTiming(fill, { duration: 220 });
  }, [fill, fillAnim]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${Math.round(fillAnim.value * 100)}%` }));

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 12 }]}>
      <View style={styles.header}>
        <GlassButton icon="chevron-back" iconColor={colors.icon.back} size="sm" onPress={onLevels} accessibilityLabel="Back to levels" />
        <View style={styles.titleWrap}>
          <View style={styles.titlePill}>
            <Text style={styles.title}>{title}</Text>
            {subtitle && <Text style={[styles.subtitle, { color: theme.accent }]}>{subtitle}</Text>}
          </View>
        </View>
        <GlassButton icon="refresh" iconColor={colors.icon.settings} size="sm" onPress={onRestart} accessibilityLabel="Restart level" />
      </View>

      <View style={styles.boardWrap}>
        <View style={styles.hud}>
          <Hud icon="swap-horizontal" iconColor={colors.icon.moves} label="Moves" value={`${game.moves}`} sub={best !== undefined ? `best ${best}` : `perfect ${level.stars.perfectMoves}`} />
          <View style={styles.hudDivider} />
          <Hud icon="git-network" iconColor={colors.icon.flow} label="Flows" value={`${connected}/${game.pairCount}`} />
          <View style={styles.hudDivider} />
          <View style={[styles.hudItem, { flex: 1.3 }]}>
            <HudIcon icon="water" color={colors.icon.fill} />
            <View style={{ flex: 1 }}>
              <Text style={styles.hudLabel}>Fill</Text>
              <Text style={styles.hudValueSm}>{Math.round(fill * 100)}%</Text>
              <View style={styles.meter}>
                <Animated.View style={[styles.meterFill, fillStyle]}>
                  <LinearGradient colors={theme.accentRamp} start={{ x: 0, y: 1 }} end={{ x: 0, y: 0 }} style={StyleSheet.absoluteFill} />
                </Animated.View>
              </View>
            </View>
          </View>
        </View>

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

      <View style={styles.controls}>
        <GlassButton icon="arrow-undo" iconColor={colors.icon.undo} label="Undo" onPress={onUndo} disabled={!game.canUndo()} />
        <GlassButton icon="bulb" iconColor={colors.icon.hint} label="Hint" onPress={onHint} badge={hints} />
        {hasObstacles && (
          <GlassButton icon="information-circle" iconColor={colors.warp} onPress={() => setInfoOpen(true)} accessibilityLabel="Obstacle info" />
        )}
      </View>

      {toast.node}
      {infoOpen && <ObstacleInfo puzzle={level} palette={palette} onClose={() => setInfoOpen(false)} />}
      {result && (
        <ResultModal
          result={result}
          accent={theme.accent}
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

function HudIcon({ icon, color }: { icon: IconName; color: string }) {
  return (
    <View style={[styles.hudIcon, { backgroundColor: withAlpha(color, 0.18), borderColor: withAlpha(color, 0.35) }]}>
      <Ionicons name={icon} size={16} color={color} />
    </View>
  );
}

function Hud({ icon, iconColor, label, value, sub }: { icon: IconName; iconColor: string; label: string; value: string; sub?: string }) {
  return (
    <View style={styles.hudItem}>
      <HudIcon icon={icon} color={iconColor} />
      <View style={{ flexShrink: 1 }}>
        <Text style={styles.hudLabel}>{label}</Text>
        <Text style={styles.hudValue}>{value}</Text>
        {sub ? (
          <Text style={styles.hudSub} numberOfLines={1}>
            <Text style={{ color: colors.star }}>★ </Text>
            {sub}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

export function goBackOr(path: string) {
  if (router.canGoBack()) router.back();
  else router.replace(path as never);
}

const styles = StyleSheet.create({
  root: { flex: 1, paddingHorizontal: 12, alignItems: 'center' },
  header: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: tokens.maxBoardWidth, height: 52 },
  titleWrap: { flex: 1, alignItems: 'center' },
  titlePill: {
    alignItems: 'center',
    paddingHorizontal: 26,
    paddingVertical: 3,
    borderRadius: tokens.radius.pill,
    backgroundColor: colors.glassStrong,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  title: { fontFamily: fonts.title, fontSize: 22, color: colors.textPure, letterSpacing: 0.5 },
  subtitle: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: -2 },
  hud: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
    maxWidth: tokens.maxBoardWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
    borderRadius: 18,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
  },
  hudItem: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  hudIcon: { width: 30, height: 30, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  hudDivider: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch', backgroundColor: colors.glassBorder },
  hudLabel: { fontFamily: fonts.body, fontSize: 10, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 1 },
  hudValue: { fontFamily: fonts.title, fontSize: 20, lineHeight: 22, color: colors.text },
  hudValueSm: { fontFamily: fonts.title, fontSize: 14, lineHeight: 16, color: colors.text },
  hudSub: { fontFamily: fonts.body, fontSize: 10, color: colors.textDim },
  meter: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.meter.track,
    borderTopWidth: 1,
    borderTopColor: colors.meter.trackHighlight,
    overflow: 'hidden',
    marginTop: 4,
  },
  meterFill: { height: '100%', borderRadius: 4, overflow: 'hidden' },
  boardWrap: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  controls: { flexDirection: 'row', gap: 14, justifyContent: 'center', alignItems: 'center' },
});
