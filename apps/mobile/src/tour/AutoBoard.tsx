import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Easing, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { Game, type Cell, type GameEvent, type Level } from '@ctd/core';
import { Board, type LeadSegment } from '../board/Board';
import { cellCenter, makeGeom } from '../board/geometry';
import { useFx, useTime } from './kit';
import { tokens } from '../theme/tokens';
import { usePalette, useTheme } from '../theme/useTheme';
import { extendPalette } from '../theme/extraColors';
import { useSettings } from '../store/settings';
import { audio } from '../services/audio';
import { haptics } from '../services/haptics';

const noop = () => {};

interface Props {
  level: Level;
  maxW: number;
  maxH: number;
  /**
   * `drag`: flows are drawn one after another through the real drag API, exactly as a player would.
   * `together`: every flow grows at once (the finale), committing each prefix of its solution.
   * `sequence`: one flow at a time in the engine's hint order (keys before their doors), committing
   * growing prefixes, so tunnels and rotators turn as the flow arrives and warps/teleports jump.
   */
  mode: 'drag' | 'together' | 'sequence';
  /** Delay before the first flow starts. */
  startAt: number;
  /** Time per cell of path. */
  cellMs: number;
  /** Pause between flows in `drag` mode. */
  gapMs?: number;
  /** Plays the engine's notes, ticks and pops. */
  sound?: boolean;
  still: boolean;
  onSolved?: () => void;
  /** Play the level-complete sweep, confetti, sound and shake when solved (default true). */
  celebrate?: boolean;
}

/**
 * The real game board, played by a script: same Board renderer, same engine, same effects
 * (rings, bursts, waves, sweep, confetti) as a level the player solves.
 */
export function AutoBoard({ level, maxW, maxH, mode, sound = true, still, onSolved, celebrate = true, ...times }: Props) {
  // Script times are in scene ms; the tour speed stretches or squeezes them.
  const t = useTime();
  const startAt = t(times.startAt);
  const cellMs = t(times.cellMs);
  const gapMs = t(times.gapMs ?? 140);
  const theme = useTheme();
  const colorblind = useSettings((s) => s.colorblind);
  const themePalette = usePalette();
  const palette = useMemo(() => extendPalette(themePalette, Math.max(...level.dots.map((d) => d.color)) + 1), [themePalette, level]);
  const game = useMemo(() => new Game(level), [level]);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);
  const { fx, emit } = useFx(still);
  const intro = useSharedValue(0);
  const shake = useSharedValue(0);
  const lead = useSharedValue<LeadSegment[]>([]);
  const leadT = useSharedValue(1);
  const { borderWidth, cellGap } = theme.board;
  const geom = useMemo(
    () => makeGeom(level.size.width, level.size.height, Math.floor(maxW), Math.floor(maxH), level.warps.length ? undefined : { borderWidth, cellGap }),
    [level, maxW, maxH, borderWidth, cellGap],
  );

  const ref = useRef({ geom, palette, theme, onSolved });
  useEffect(() => {
    ref.current = { geom, palette, theme, onSolved };
  });

  useEffect(() => {
    intro.set(withTiming(1, { duration: still ? 200 : 700 }));
  }, [intro, still]);

  // ---- Effects, as GameScreen plays them -----------------------------------
  const center = useCallback((n: number) => cellCenter(ref.current.geom, game.g.nodeRow[n], game.g.nodeCol[n]), [game]);
  const lineOf = useCallback((pair: number) => ref.current.palette[level.dots[pair].color % ref.current.palette.length].line, [level]);

  const connectFx = useCallback(
    (pair: number) => {
      const gg = ref.current.geom;
      const nodes = game.view()[pair];
      if (!nodes?.length) return;
      const color = lineOf(pair);
      const pts = nodes.flatMap((n) => center(n));
      const [hx, hy] = center(nodes[nodes.length - 1]);
      const [sx, sy] = center(nodes[0]);
      emit({ kind: 'burst', dur: 650, x: hx, y: hy, color, count: 16, radius: gg.cell * 1.3, seed: pair * 7 + nodes.length });
      emit({ kind: 'ring', dur: 600, x: hx, y: hy, color, r0: gg.cell * 0.35, r1: gg.cell * 1.1, width: 3 });
      emit({ kind: 'ring', dur: 600, x: sx, y: sy, color, r0: gg.cell * 0.35, r1: gg.cell * 1.1, width: 3 });
      emit({ kind: 'wave', dur: Math.min(900, 180 + nodes.length * 45), color, pts, size: gg.cell * 0.32 });
      if (sound) audio.note(level.dots[pair].color);
      haptics.light();
    },
    [game, emit, center, lineOf, level, sound],
  );

  const winFx = useCallback(() => {
    if (!celebrate) {
      ref.current.onSolved?.();
      return;
    }
    const gg = ref.current.geom;
    const cells: number[] = [];
    for (let r = 0; r < gg.H; r++) for (let c = 0; c < gg.W; c++) cells.push(gg.ox + c * gg.cell + 1.5, gg.oy + r * gg.cell + 1.5, gg.cell - 3, r + c);
    emit({ kind: 'sweep', dur: 1300, cells, maxOrder: gg.W + gg.H, radius: gg.cell * 0.2 });
    emit({ kind: 'flash', dur: 900, x: 4, y: 4, w: gg.width - 8, h: gg.height - 8, radius: tokens.radius.lg, color: ref.current.theme.accent.color });
    emit({
      kind: 'confetti',
      dur: 2600,
      colors: level.dots.map((d) => ref.current.palette[d.color % ref.current.palette.length].dot),
      count: 80,
      w: gg.width,
      h: gg.height,
      seed: 7,
    });
    if (sound) audio.play('level_complete');
    haptics.success();
    if (!still) shake.set(withSequence(withTiming(-3, { duration: 50 }), withTiming(3, { duration: 70 }), withTiming(0, { duration: 60 })));
    ref.current.onSolved?.();
  }, [emit, level, sound, shake, still, celebrate]);

  const process = useCallback(
    (events: GameEvent[]) => {
      for (const e of events) {
        if (e.type === 'start') {
          if (sound) audio.play('tap', { volume: 0.4 });
          haptics.selection();
          const p = game.view()[e.pair];
          if (p?.length) {
            const [x, y] = center(p[p.length - 1]);
            emit({ kind: 'ring', dur: 450, x, y, color: lineOf(e.pair), r0: ref.current.geom.cell * 0.3, r1: ref.current.geom.cell * 0.8, width: 3 });
          }
        } else if (e.type === 'extend') {
          if (sound) audio.play('tick', { volume: 0.22, rate: 1 + Math.min(0.6, e.length * 0.03) });
        } else if (e.type === 'connect') connectFx(e.pair);
        else if (e.type === 'win') winFx();
      }
    },
    [game, center, emit, lineOf, connectFx, winFx, sound],
  );

  // ---- The script ------------------------------------------------------------
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    const at = (ms: number, run: () => void) => timers.push(setTimeout(run, ms));
    const paths: Cell[][] = level.dots.map((_, p) => level.solution[String(p)] ?? []);

    // Smooth growth: a segment glides from the last committed cell to the next over one step, and
    // the cell is committed exactly when the segment arrives (warp / teleport hops just jump).
    const segment = (p: number, a: Cell, b: Cell, head: boolean): LeadSegment | null => {
      if (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) !== 1) return null;
      const [x0, y0] = cellCenter(ref.current.geom, a[0], a[1]);
      const [x1, y1] = cellCenter(ref.current.geom, b[0], b[1]);
      return { x0, y0, x1, y1, color: lineOf(p), head };
    };
    const startLead = (segs: (LeadSegment | null)[]) => {
      lead.set(segs.filter((x): x is LeadSegment => !!x));
      leadT.set(0);
      leadT.set(withTiming(1, { duration: cellMs, easing: Easing.linear }));
    };
    const clearLead = () => lead.set([]);
    /** Re-applies any finished flow that a later one cut short; true if that solved the board. */
    const repair = (finished: Set<number>) => {
      let won = false;
      for (let pass = 0; pass < 3; pass++) {
        let fixed = false;
        for (const p of finished) {
          if (game.view()[p]?.length === paths[p].length) continue;
          fixed = true;
          if (game.applySolutionPath(p, paths[p], false).some((e) => e.type === 'win')) won = true;
        }
        if (!fixed) break;
      }
      return won;
    };

    if (still) {
      // Reduced motion: show the solved board, then celebrate once.
      at(startAt, () => {
        let won = false;
        const all = new Set<number>();
        paths.forEach((cells, p) => {
          if (!cells.length) return;
          all.add(p);
          if (game.applySolutionPath(p, cells, false).some((e) => e.type === 'win')) won = true;
        });
        if (repair(all)) won = true;
        bump();
        // A partial script (not every flow has a solution) only shows its connections.
        if (won) winFx();
        else paths.forEach((cells, p) => cells.length > 1 && connectFx(p));
      });
      return () => timers.forEach(clearTimeout);
    }

    if (mode === 'drag') {
      let t = startAt;
      // Short flows first: quick early wins, the long winding ones close the puzzle.
      const order = paths.map((_, p) => p).sort((a, b) => paths[a].length - paths[b].length);
      for (const p of order) {
        const cells = paths[p];
        if (cells.length < 2) continue;
        at(t, () => {
          process(game.beginDrag(cells[0]));
          bump();
        });
        for (let k = 1; k < cells.length; k++) {
          at(t + (k - 1) * cellMs, () => startLead([segment(p, cells[k - 1], cells[k], true)]));
          at(t + k * cellMs, () => {
            clearLead();
            if (k === cells.length - 1) {
              // Magnetic pull: a ring tightens onto the matching dot just before the snap.
              const [x, y] = cellCenter(ref.current.geom, cells[k][0], cells[k][1]);
              emit({ kind: 'ring', dur: 260, x, y, color: lineOf(p), r0: ref.current.geom.cell * 0.95, r1: ref.current.geom.cell * 0.4, width: 3 });
            }
            process(game.dragTo(cells[k]));
            bump();
          });
        }
        t += cells.length * cellMs;
        at(t, () => {
          process(game.endDrag());
          bump();
        });
        t += gapMs;
      }
    } else if (mode === 'sequence') {
      // Same order the hint button would use, so a door is always opened before its flow passes.
      const probe = new Game(level);
      const order: number[] = [];
      for (let p = probe.hintPair(level.solution); p >= 0 && order.length < paths.length; p = probe.hintPair(level.solution)) {
        order.push(p);
        probe.applySolutionPath(p, paths[p], false);
      }
      let t = startAt;
      for (const p of order) {
        const cells = paths[p];
        at(t, () => {
          if (sound) audio.play('tap', { volume: 0.35 });
          const [x, y] = cellCenter(ref.current.geom, cells[0][0], cells[0][1]);
          emit({ kind: 'ring', dur: 450, x, y, color: lineOf(p), r0: ref.current.geom.cell * 0.3, r1: ref.current.geom.cell * 0.8, width: 3 });
        });
        for (let k = 2; k <= cells.length; k++) {
          at(t + (k - 2) * cellMs, () => startLead([segment(p, cells[k - 2], cells[k - 1], false)]));
          at(t + (k - 1) * cellMs, () => {
            clearLead();
            const [r0, c0] = cells[k - 2];
            const [r1, c1] = cells[k - 1];
            if (Math.abs(r1 - r0) + Math.abs(c1 - c0) > 1) {
              // A warp or teleporter jump: flash both ends of the hop.
              for (const [r, c] of [cells[k - 2], cells[k - 1]]) {
                const [x, y] = cellCenter(ref.current.geom, r, c);
                emit({ kind: 'ring', dur: 520, x, y, color: lineOf(p), r0: ref.current.geom.cell * 0.2, r1: ref.current.geom.cell * 0.95, width: 3 });
              }
              if (sound) audio.play('warp', { volume: 0.5 });
            } else if (sound) audio.play('tick', { volume: 0.2, rate: 1 + Math.min(0.6, k * 0.04) });
            const events = game.applySolutionPath(p, cells.slice(0, k), false);
            if (k === cells.length) connectFx(p);
            if (events.some((e) => e.type === 'door' && e.open)) {
              const lock = level.locks?.[(events.find((e) => e.type === 'door') as { lock: number }).lock];
              if (lock) {
                const [x, y] = cellCenter(ref.current.geom, lock.door[0], lock.door[1]);
                emit({ kind: 'ring', dur: 650, x, y, color: ref.current.theme.accent.color, r0: ref.current.geom.cell * 0.3, r1: ref.current.geom.cell * 1.1, width: 3 });
                if (sound) audio.play('hint', { volume: 0.55 });
              }
            }
            bump();
            if (events.some((e) => e.type === 'win')) winFx();
          });
        }
        t += (cells.length - 1) * cellMs + gapMs;
      }
    } else {
      const longest = Math.max(...paths.map((c) => c.length));
      const done = new Set<number>();
      for (let k = 2; k <= longest; k++) {
        at(startAt + (k - 2) * cellMs, () =>
          startLead(paths.map((cells, p) => (done.has(p) || k > cells.length ? null : segment(p, cells[k - 2], cells[k - 1], false)))),
        );
        at(startAt + (k - 1) * cellMs, () => {
          clearLead();
          let won = false;
          paths.forEach((cells, p) => {
            if (done.has(p) || cells.length < 2) return;
            const n = Math.min(k, cells.length);
            const events = game.applySolutionPath(p, cells.slice(0, n), false);
            if (n === cells.length) {
              done.add(p);
              connectFx(p);
            }
            if (events.some((e) => e.type === 'win')) won = true;
          });
          // A later flow can cut a finished one at a door, tunnel or rotator; redraw any that were cut.
          if (repair(done)) won = true;
          if (sound && k % 2 === 0) audio.play('tick', { volume: 0.2, rate: 1 + Math.min(0.6, k * 0.04) });
          bump();
          if (won) winFx();
        });
      }
    }
    return () => timers.forEach(clearTimeout);
    // The script runs once per mount; the scene remounts to replay.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (geom.cell <= 0) return null;
  return (
    <Board
      game={game}
      version={version}
      geom={geom}
      palette={palette}
      colorblind={colorblind}
      reduceMotion={still}
      fx={fx}
      intro={intro}
      shake={shake}
      onDown={noop}
      onMove={noop}
      onUp={noop}
      lead={still ? undefined : lead}
      leadT={leadT}
    />
  );
}

/** The board size `AutoBoard` will draw for these limits, for laying out around it. */
export function autoBoardSize(level: Level, maxW: number, maxH: number, frame: { borderWidth: number; cellGap: number }) {
  const g = makeGeom(level.size.width, level.size.height, Math.floor(maxW), Math.floor(maxH), level.warps.length ? undefined : frame);
  return { width: g.width, height: g.height };
}
