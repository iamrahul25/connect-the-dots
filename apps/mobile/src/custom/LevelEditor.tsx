import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, TextInput, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useSharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import {
  buildCustomLevel,
  CUSTOM_MAX_SIZE,
  CUSTOM_MIN_SIZE,
  draftGraph,
  emptyDraft,
  eraseAt,
  gateProblem,
  LineDrag,
  lockCellProblem,
  MAX_LOCKS,
  MAX_TELEPORTERS,
  maxColorsFor,
  obstacleAt,
  placeLock,
  placeTeleporter,
  resizeDraft,
  rotatePiece,
  same,
  setColorCount,
  toggleObstacle,
  toggleWarp,
  type Cell,
  type CustomDraft,
  type EditResult,
  type GameEvent,
  type Level,
  type Uniqueness,
} from '@ctd/core';
import { Board } from '../board/Board';
import { cellAtRaw, makeGeom } from '../board/geometry';
import { newTrack, pointerMove, resetTrack } from '../board/dragPointer';
import type { Effect } from '../board/effects';
import { withAlpha } from '../board/color';
import { BUTTON_H, GlassButton } from '../ui/GlassButton';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { LANDSCAPE_H } from '../ui/Background';
import { useLayout } from '../ui/layout';
import { fonts, tokens } from '../theme/tokens';
import { makeStyles, usePalette, useTheme } from '../theme/useTheme';
import { extendPalette } from '../theme/extraColors';
import { lockColor, teleporterColor } from '../theme/config';
import { useSettings } from '../store/settings';
import { useCustomLevels } from '../store/customLevels';
import { audio } from '../services/audio';
import { haptics } from '../services/haptics';
import { ObstacleGlyph, type GlyphKind } from './ObstacleGlyph';
import { editorSource } from './preview';
import { ShareLevelDialog, UNIQUENESS_NOTE } from './ShareLevelDialog';

type IconName = keyof typeof Ionicons.glyphMap;
type Tool = 'draw' | 'erase' | 'rotate' | 'wall' | 'bridge' | 'warp' | 'teleporter' | 'tunnel' | 'rotator' | 'lock';

const TOOLS: { id: Tool; label: string; icon?: IconName; glyph?: GlyphKind; help: string }[] = [
  { id: 'draw', label: 'Draw', icon: 'brush', help: 'Drag to draw a line in the selected color. Drag from a line to reshape it.' },
  { id: 'erase', label: 'Erase', icon: 'backspace', help: 'Tap or drag over obstacles and lines to remove them.' },
  { id: 'rotate', label: 'Rotate', icon: 'sync', help: 'Tap a tunnel or rotator to turn how it faces when the level starts.' },
  { id: 'wall', label: 'Wall', glyph: 'wall', help: 'Tap or drag to place walls on empty squares.' },
  { id: 'bridge', label: 'Bridge', glyph: 'bridge', help: 'Lines cross a bridge straight, one each way. Not on the edge.' },
  { id: 'warp', label: 'Warp', glyph: 'warp', help: 'Tap a square to wrap its row or column around the board.' },
  { id: 'teleporter', label: 'Teleport', glyph: 'teleporter', help: 'Tap two empty squares for a pair of gates.' },
  { id: 'tunnel', label: 'Tunnel', glyph: 'tunnel', help: 'Needs a straight line through it. Tap a placed tunnel to flip it.' },
  { id: 'rotator', label: 'Rotator', glyph: 'rotator', help: 'Needs a line that turns inside it. Tap a placed rotator to turn it.' },
  { id: 'lock', label: 'Lock', glyph: 'lock', help: 'Tap a square for the key, then one for its door.' },
];
const HELP = Object.fromEntries(TOOLS.map((t) => [t.id, t.help])) as Record<Tool, string>;
const TURNED = 'Turned. Players see it this way when the level starts.';

const NEW_SIZE = 6;
const NEW_COLORS = 4;
const HISTORY = 100;
const CONTROLS_LIFT = Math.round(LANDSCAPE_H * 0.6);
const HEADER_H = 60;

type Note = { text: string; tone: 'info' | 'error' | 'success' };

export function LevelEditor({ mineId }: { mineId?: string }) {
  const theme = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { gutter, s } = useLayout();
  const { colorblind, reduceMotion } = useSettings();
  const store = useCustomLevels;

  const [initial] = useState(() => store.getState().mine.find((m) => m.id === mineId));
  const idRef = useRef(initial?.id);
  const [name, setName] = useState(initial?.name ?? 'My level');
  const [draft, setDraft] = useState<CustomDraft>(() => initial?.draft ?? emptyDraft(NEW_SIZE, NEW_SIZE, NEW_COLORS));
  const [built, setBuilt] = useState<{ level: Level; uniqueness: Uniqueness } | null>(() =>
    initial?.level && initial.uniqueness ? { level: initial.level, uniqueness: initial.uniqueness } : null,
  );
  const [tool, setTool] = useState<Tool>('draw');
  const [color, setColor] = useState(0);
  const [warpAxis, setWarpAxis] = useState<'row' | 'col'>('row');
  const [pending, setPending] = useState<Cell | null>(null);
  const [note, setNote] = useState<Note>({ text: HELP.draw, tone: 'info' });
  const [problem, setProblem] = useState<Cell[]>([]);
  const [busy, setBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const history = useRef<CustomDraft[]>([]);
  const drag = useRef<LineDrag | null>(null);
  const [activeDrag, setActiveDrag] = useState<LineDrag | null>(null);
  const track = useRef(newTrack());
  /** Per-gesture state for drag-painting walls and drag-erasing. */
  const gesture = useRef<{ last: Cell | null; paint: 'add' | 'remove' | null; pushed: boolean }>({ last: null, paint: null, pushed: false });

  const g = useMemo(
    () => draftGraph(draft),
    // Lines don't change the graph; obstacles keep their identity when only lines change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft.size, draft.walls, draft.bridges, draft.warps, draft.teleporters, draft.tunnels, draft.rotators, draft.locks],
  );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const source = useMemo(() => editorSource(draft, g, activeDrag), [draft, g, activeDrag, version]);
  const themePalette = usePalette();
  const palette = useMemo(() => extendPalette(themePalette, draft.colors), [themePalette, draft.colors]);

  const [stage, setStage] = useState<{ w: number; h: number } | null>(null);
  const onStageLayout = useCallback((e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setStage((a) => (a && a.w === w && a.h === h ? a : { w, h }));
  }, []);
  const { borderWidth, cellGap } = theme.board;
  const W = draft.size.width;
  const H = draft.size.height;
  const geom = useMemo(
    () =>
      makeGeom(
        W,
        H,
        Math.floor(Math.min(stage?.w ?? 0, s(tokens.maxBoardWidth))),
        Math.floor(stage?.h ?? 0),
        draft.warps.length ? undefined : { borderWidth, cellGap },
      ),
    [W, H, stage, s, draft.warps.length, borderWidth, cellGap],
  );
  const fx = useSharedValue<Effect[]>([]);
  const intro = useSharedValue(1);
  const shake = useSharedValue(0);

  const ref = useRef({ draft, g, geom, tool, color, warpAxis, pending, name });
  useLayoutEffect(() => {
    ref.current = { draft, g, geom, tool, color, warpAxis, pending, name };
  });

  const save = useCallback(
    (next: CustomDraft) => {
      const id = idRef.current;
      if (id && store.getState().mine.some((m) => m.id === id)) store.getState().updateDraft(id, next);
      else idRef.current = store.getState().createMine(ref.current.name.trim() || 'My level', next);
    },
    [store],
  );

  const commit = useCallback(
    (next: CustomDraft, pushHistory = true) => {
      if (pushHistory) {
        history.current = [...history.current.slice(-HISTORY + 1), ref.current.draft];
        setCanUndo(true);
      }
      ref.current.draft = next;
      setDraft(next);
      setBuilt(null);
      save(next);
    },
    [save],
  );

  const info = useCallback((text: string) => setNote({ text, tone: 'info' }), []);
  const fail = useCallback((text: string, cells: Cell[] = []) => {
    setNote({ text, tone: 'error' });
    setProblem(cells);
    audio.play('invalid', { volume: 0.55 });
    haptics.warning();
  }, []);
  const applied = useCallback(
    (res: EditResult, quiet = false) => {
      if (res.ok) {
        commit(res.draft);
        if (!quiet) {
          audio.play('tap', { volume: 0.5 });
          haptics.selection();
        }
        return true;
      }
      if (!quiet) fail(res.reason, res.cells);
      return false;
    },
    [commit, fail],
  );

  const pickTool = (t: Tool) => {
    setTool(t);
    setPending(null);
    setProblem([]);
    info(t === 'warp' ? warpHelp(warpAxis) : HELP[t]);
  };

  const onDown = useCallback(
    (x: number, y: number) => {
      const { geom: gg, draft: d, g: graph, tool: t, color: col, warpAxis: axis, pending: first } = ref.current;
      const [r, c] = cellAtRaw(gg, x, y);
      if (r < 0 || c < 0 || r >= gg.H || c >= gg.W) return;
      const cell: Cell = [r, c];
      setProblem([]);
      gesture.current = { last: cell, paint: null, pushed: false };
      switch (t) {
        case 'draw': {
          const res = LineDrag.begin(d, col, cell, graph);
          if (!res.ok) {
            fail(res.reason, [cell]);
            return;
          }
          drag.current = res.drag;
          setActiveDrag(res.drag);
          resetTrack(track.current, cell);
          track.current.gestureBase = res.drag.view()[res.drag.color].length;
          if (res.drag.color !== col) setColor(res.drag.color);
          audio.play('tap', { volume: 0.45 });
          haptics.selection();
          bump();
          return;
        }
        case 'erase': {
          const next = eraseAt(d, cell);
          if (next) {
            commit(next);
            gesture.current.pushed = true;
            audio.play('cut', { volume: 0.5 });
          }
          return;
        }
        case 'wall':
          gesture.current.paint = obstacleAt(d, cell) === 'wall' ? 'remove' : 'add';
          if (applied(toggleObstacle(d, 'wall', cell))) gesture.current.pushed = true;
          return;
        case 'bridge':
          applied(toggleObstacle(d, t, cell));
          return;
        case 'rotate': {
          const kind = obstacleAt(d, cell);
          if (kind !== 'tunnel' && kind !== 'rotator') fail('Tap a tunnel or rotator to turn it.', [cell]);
          else if (applied(rotatePiece(d, cell))) info(TURNED);
          return;
        }
        case 'tunnel':
        case 'rotator':
          if (obstacleAt(d, cell) === t) {
            if (applied(rotatePiece(d, cell))) info(TURNED);
          } else if (applied(toggleObstacle(d, t, cell))) info(HELP[t]);
          return;
        case 'warp':
          applied(toggleWarp(d, { axis, index: axis === 'row' ? r : c }));
          return;
        case 'teleporter':
        case 'lock': {
          const kind = obstacleAt(d, cell);
          const mine = t === 'teleporter' ? kind === 'gate' : kind === 'key' || kind === 'door';
          if (!first && mine) {
            commit(eraseAt(d, cell)!);
            audio.play('cut', { volume: 0.5 });
            return;
          }
          if (!first) {
            const full = t === 'teleporter' ? d.teleporters.length >= MAX_TELEPORTERS : d.locks.length >= MAX_LOCKS;
            if (full) {
              fail(t === 'teleporter' ? `A level can have up to ${MAX_TELEPORTERS} teleporter pairs.` : `A level can have up to ${MAX_LOCKS} locks.`);
              return;
            }
            const why = t === 'teleporter' ? gateProblem(d, cell) : lockCellProblem(d, cell);
            if (why) {
              fail(why, [cell]);
              return;
            }
            setPending(cell);
            info(t === 'teleporter' ? 'Now tap a square for the second gate.' : 'Now tap a square for the door.');
            audio.play('tap', { volume: 0.5 });
            return;
          }
          if (same(first, cell)) {
            setPending(null);
            info(HELP[t]);
            return;
          }
          const res = t === 'teleporter' ? placeTeleporter(d, first, cell) : placeLock(d, first, cell);
          if (applied(res)) {
            setPending(null);
            info(HELP[t]);
          }
          return;
        }
      }
    },
    [applied, bump, commit, fail, info],
  );

  const onMove = useCallback(
    (x: number, y: number) => {
      const { geom: gg, tool: t, draft: d } = ref.current;
      if (t === 'draw') {
        const dr = drag.current;
        if (!dr) return;
        const events = pointerMove(dr, gg, track.current, x, y);
        if (events.length) {
          sounds(events);
          bump();
        }
        return;
      }
      if (t !== 'erase' && t !== 'wall') return;
      const [r, c] = cellAtRaw(gg, x, y);
      if (r < 0 || c < 0 || r >= gg.H || c >= gg.W) return;
      const cell: Cell = [r, c];
      const gs = gesture.current;
      if (!gs.last || same(gs.last, cell)) return;
      gs.last = cell;
      if (t === 'erase') {
        const next = eraseAt(d, cell);
        if (!next) return;
        commit(next, !gs.pushed);
        gs.pushed = true;
        audio.play('cut', { volume: 0.4 });
        return;
      }
      const isWall = obstacleAt(d, cell) === 'wall';
      if ((gs.paint === 'add') === isWall) return;
      const res = toggleObstacle(d, 'wall', cell);
      if (!res.ok) return;
      commit(res.draft, !gs.pushed);
      gs.pushed = true;
      audio.play('tick', { volume: 0.3 });
    },
    [bump, commit],
  );

  const onUp = useCallback(() => {
    resetTrack(track.current);
    gesture.current.last = null;
    const dr = drag.current;
    if (!dr) return;
    drag.current = null;
    setActiveDrag(null);
    const next = dr.finish();
    if (JSON.stringify(next.lines) !== JSON.stringify(ref.current.draft.lines)) commit(next);
    else bump();
  }, [bump, commit]);

  const undo = () => {
    const prev = history.current.pop();
    if (!prev) return;
    setCanUndo(history.current.length > 0);
    ref.current.draft = prev;
    setDraft(prev);
    setBuilt(null);
    setPending(null);
    setProblem([]);
    save(prev);
    audio.play('retract', { volume: 0.4 });
  };

  const resize = (w: number, h: number) => {
    commit(resizeDraft(draft, w, h));
    setPending(null);
  };
  const recolor = (k: number) => {
    commit(setColorCount(draft, k));
    if (color >= k) setColor(k - 1);
  };

  const rename = (v: string) => {
    setName(v);
    if (idRef.current) store.getState().renameMine(idRef.current, v.trim() || 'My level');
  };

  /** Validates the draft; on success saves the level and either opens sharing or starts a test play. */
  const finish = (then: 'share' | 'play') => {
    setBusy(true);
    setProblem([]);
    setPending(null);
    setTimeout(() => {
      const res = buildCustomLevel(ref.current.draft);
      setBusy(false);
      if (!res.ok) {
        fail(res.issue.message, res.issue.cells);
        return;
      }
      save(ref.current.draft);
      store.getState().setGenerated(idRef.current!, res.level, res.uniqueness);
      setBuilt({ level: res.level, uniqueness: res.uniqueness });
      setNote({ text: UNIQUENESS_NOTE[res.uniqueness], tone: res.uniqueness === 'unique' ? 'success' : 'info' });
      haptics.success();
      if (then === 'play') router.push(`/custom/play/${res.level.id}`);
      else setShareOpen(true);
    }, 50);
  };

  // Leaving with an untouched new level shouldn't leave an empty draft behind.
  useEffect(() => () => {
    const id = idRef.current;
    const m = id ? store.getState().mine.find((x) => x.id === id) : undefined;
    if (m && !m.level && m.draft.lines.every((l) => l.length === 0) && obstacleCount(m.draft) === 0) store.getState().deleteMine(m.id);
  }, [store]);

  const marks = useMemo(() => {
    const out: { cell: Cell; color: string }[] = problem.map((cell) => ({ cell, color: theme.status.danger }));
    if (pending) out.push({ cell: pending, color: tool === 'teleporter' ? teleporterColor(draft.teleporters.length) : lockColor(draft.locks.length) });
    return out;
  }, [problem, pending, tool, theme, draft.teleporters.length, draft.locks.length]);

  const maxColors = maxColorsFor(W, H);
  const drawn = draft.lines.map((l) => l.length >= 2);
  const noteColor = note.tone === 'error' ? theme.status.danger : note.tone === 'success' ? theme.status.success : theme.text.secondary;
  const boardShown = geom.cell > 0;

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
      <View style={styles.header}>
        <GlassButton icon="chevron-back" size="sm" onPress={() => (router.canGoBack() ? router.back() : router.replace('/custom'))} accessibilityLabel="Back" />
        <TextInput
          value={name}
          onChangeText={rename}
          maxLength={40}
          style={styles.name}
          placeholder="Level name"
          placeholderTextColor={theme.text.muted}
          accessibilityLabel="Level name"
          selectTextOnFocus
        />
        <GlassButton icon="arrow-undo" size="sm" onPress={undo} disabled={!canUndo} accessibilityLabel="Undo" />
      </View>

      <View style={styles.steppers}>
        <Stepper label="Width" value={W} onMinus={() => resize(W - 1, H)} onPlus={() => resize(W + 1, H)} min={W <= CUSTOM_MIN_SIZE} max={W >= CUSTOM_MAX_SIZE} />
        <Stepper label="Height" value={H} onMinus={() => resize(W, H - 1)} onPlus={() => resize(W, H + 1)} min={H <= CUSTOM_MIN_SIZE} max={H >= CUSTOM_MAX_SIZE} />
        <Stepper label="Colors" value={draft.colors} onMinus={() => recolor(draft.colors - 1)} onPlus={() => recolor(draft.colors + 1)} min={draft.colors <= 1} max={draft.colors >= maxColors} />
      </View>

      <View style={styles.stage} onLayout={onStageLayout}>
        {boardShown && (
          <Board
            game={source}
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
            marks={marks}
          />
        )}
      </View>

      <Text style={[styles.note, { color: noteColor }]} numberOfLines={2}>
        {note.text}
      </Text>

      {tool === 'draw' && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.strip} contentContainerStyle={styles.stripContent}>
          {Array.from({ length: draft.colors }, (_, i) => (
            <Pressable
              key={i}
              onPress={() => setColor(i)}
              accessibilityLabel={`Color ${i + 1}${drawn[i] ? ', drawn' : ''}`}
              style={[styles.swatch, { backgroundColor: palette[i].dot, borderColor: i === color ? theme.text.primary : 'transparent' }]}
            >
              {drawn[i] && <Ionicons name="checkmark" size={s(16)} color="#fff" />}
            </Pressable>
          ))}
        </ScrollView>
      )}
      {tool === 'warp' && (
        <View style={[styles.strip, styles.stripContent]}>
          {(['row', 'col'] as const).map((a) => (
            <Chip
              key={a}
              label={a === 'row' ? 'Row ↔' : 'Column ↕'}
              selected={warpAxis === a}
              onPress={() => {
                setWarpAxis(a);
                info(warpHelp(a));
              }}
            />
          ))}
        </View>
      )}
      {tool !== 'draw' && tool !== 'warp' && <View style={styles.strip} />}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tools} contentContainerStyle={styles.stripContent}>
        {TOOLS.map((t) => (
          <Chip key={t.id} label={t.label} icon={t.icon} glyph={t.glyph} selected={tool === t.id} onPress={() => pickTool(t.id)} />
        ))}
      </ScrollView>

      <View style={styles.actions}>
        <GlassButton icon="trash" onPress={() => setClearOpen(true)} accessibilityLabel="Clear board" />
        <GlassButton label="Test" icon="play" onPress={() => finish('play')} disabled={busy} style={styles.action} />
        {busy ? (
          <View style={[styles.action, styles.busy]}>
            <ActivityIndicator color={theme.accent.color} />
          </View>
        ) : (
          <GlassButton label="Generate" icon="checkmark-done" variant="primary" onPress={() => finish('share')} style={styles.action} />
        )}
      </View>

      {built && (
        <ShareLevelDialog
          visible={shareOpen}
          name={name.trim() || 'My level'}
          level={built.level}
          uniqueness={built.uniqueness}
          onPlay={() => {
            setShareOpen(false);
            router.push(`/custom/play/${built.level.id}`);
          }}
          onClose={() => setShareOpen(false)}
        />
      )}
      <ConfirmDialog
        visible={clearOpen}
        title="Clear the board?"
        message="Removes every line and obstacle. You can undo this."
        icon="trash"
        confirmLabel="Clear"
        danger
        onConfirm={() => {
          setClearOpen(false);
          commit(emptyDraft(W, H, draft.colors));
          setPending(null);
        }}
        onCancel={() => setClearOpen(false)}
      />
    </View>
  );
}

const warpHelp = (axis: 'row' | 'col') =>
  axis === 'row' ? "Tap a square to wrap its row: lines leaving one side come back on the other." : "Tap a square to wrap its column: lines leaving the top come back at the bottom.";

function obstacleCount(d: CustomDraft): number {
  return d.walls.length + d.bridges.length + d.warps.length + d.teleporters.length + d.tunnels.length + d.rotators.length + d.locks.length;
}

function sounds(events: GameEvent[]) {
  for (const e of events) {
    if (e.type === 'extend') {
      haptics.selection();
      audio.play('tick', { volume: 0.3, rate: 1 + Math.min(0.6, e.length * 0.025) });
    } else if (e.type === 'retract') audio.play('retract', { volume: 0.25 });
    else if (e.type === 'cut') audio.play('cut', { volume: 0.5 });
    else if (e.type === 'warp' || e.type === 'teleport') audio.play('warp', { volume: 0.6 });
    else if (e.type === 'invalid') audio.play('invalid', { volume: 0.4 });
  }
}

function Stepper({ label, value, onMinus, onPlus, min, max }: { label: string; value: number; onMinus: () => void; onPlus: () => void; min: boolean; max: boolean }) {
  const styles = useStyles();
  const theme = useTheme();
  const { s } = useLayout();
  return (
    <View style={styles.stepper}>
      <Pressable onPress={onMinus} disabled={min} hitSlop={6} style={[styles.stepButton, min && styles.dim]} accessibilityLabel={`Decrease ${label}`}>
        <Ionicons name="remove" size={s(18)} color={theme.text.primary} />
      </Pressable>
      <View style={styles.stepValue}>
        <Text style={styles.stepLabel}>{label}</Text>
        <Text style={styles.stepNumber}>{value}</Text>
      </View>
      <Pressable onPress={onPlus} disabled={max} hitSlop={6} style={[styles.stepButton, max && styles.dim]} accessibilityLabel={`Increase ${label}`}>
        <Ionicons name="add" size={s(18)} color={theme.text.primary} />
      </Pressable>
    </View>
  );
}

function Chip({ label, icon, glyph, selected, onPress }: { label: string; icon?: IconName; glyph?: GlyphKind; selected: boolean; onPress: () => void }) {
  const styles = useStyles();
  const theme = useTheme();
  const { s } = useLayout();
  return (
    <Pressable
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={[
        styles.chip,
        glyph && styles.glyphChip,
        selected ? { backgroundColor: theme.accent.color, borderColor: theme.accent.color } : { backgroundColor: theme.box.background, borderColor: withAlpha(theme.text.primary, 0.12) },
      ]}
    >
      {glyph && <ObstacleGlyph kind={glyph} size={s(24)} />}
      {icon && <Ionicons name={icon} size={s(16)} color={selected ? theme.accent.onColor : theme.text.primary} />}
      <Text style={[styles.chipText, { color: selected ? theme.accent.onColor : theme.text.primary }]}>{label}</Text>
    </Pressable>
  );
}

const useStyles = makeStyles((t, s) => ({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: s(10), height: s(HEADER_H) },
  name: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.titleBold,
    fontSize: s(22),
    color: t.text.primary,
    paddingVertical: s(6),
    borderRadius: s(14),
    backgroundColor: t.box.background,
  },
  steppers: { flexDirection: 'row', gap: s(8), marginTop: s(6) },
  stepper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: s(6),
    height: s(48),
    borderRadius: s(16),
    backgroundColor: t.box.background,
    borderWidth: 1,
    borderColor: t.box.border,
  },
  stepButton: { width: s(30), height: s(30), borderRadius: s(15), alignItems: 'center', justifyContent: 'center', backgroundColor: t.box.pill },
  dim: { opacity: 0.35 },
  stepValue: { alignItems: 'center' },
  stepLabel: { fontFamily: fonts.body, fontSize: s(11), color: t.text.secondary },
  stepNumber: { fontFamily: fonts.title, fontSize: s(18), lineHeight: s(20), color: t.text.primary },
  stage: { flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', marginVertical: s(10) },
  note: { fontFamily: fonts.bodyBold, fontSize: s(13), textAlign: 'center', minHeight: s(36) },
  strip: { flexGrow: 0, height: s(44), marginTop: s(4) },
  stripContent: { flexDirection: 'row', alignItems: 'center', gap: s(8), paddingHorizontal: 2 },
  swatch: { width: s(34), height: s(34), borderRadius: s(17), borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
  tools: { flexGrow: 0, marginTop: s(6) },
  chip: { flexDirection: 'row', alignItems: 'center', gap: s(6), height: s(38), paddingHorizontal: s(14), borderRadius: tokens.radius.pill, borderWidth: 1 },
  glyphChip: { paddingLeft: s(7) },
  chipText: { fontFamily: fonts.bodyBold, fontSize: s(14) },
  actions: { flexDirection: 'row', gap: s(10), marginTop: s(12), alignItems: 'center' },
  action: { flex: 1 },
  busy: { height: s(BUTTON_H.md), alignItems: 'center', justifyContent: 'center' },
}));
