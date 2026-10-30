import React, { useEffect, useEffectEvent, useMemo } from 'react';
import { View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSettings } from '../store/settings';
import type { DotStyle } from '../theme/config';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

/** Cell size of the mini board previews. */
export const C = 28;
export type Pt = [row: number, col: number];

/** Path length (in cells) spent jumping between the two ends of a warp or teleporter. */
const JUMP = 0.8;

export interface Script {
  /** Loop length in ms. */
  length: number;
  steps: [at: number, run: () => void][];
  /** Puts the preview back to its first frame; runs at the start of every loop. */
  reset: () => void;
  /** The finished frame, shown instead of the loop when motion is reduced. */
  final: () => void;
}

/** Loops a preview's timed script while it is mounted. */
export function useScript(script: Script) {
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const current = useEffectEvent(() => script);
  useEffect(() => {
    const s = current();
    if (reduceMotion) {
      s.final();
      return;
    }
    let timers: ReturnType<typeof setTimeout>[] = [];
    const loop = () => {
      s.reset();
      timers = s.steps.map(([at, run]) => setTimeout(run, at));
      timers.push(setTimeout(loop, s.length));
    };
    loop();
    return () => timers.forEach(clearTimeout);
  }, [reduceMotion]);
}

export interface FlowControl {
  progress: SharedValue<number>;
  head: SharedValue<number>;
  /** Draws the whole flow from its first point, like a drag, over `ms`. */
  draw: (ms: number) => void;
  /** Pulls the flow back off the board. */
  cut: (ms?: number) => void;
  set: (progress: number) => void;
}

export function useFlow(): FlowControl {
  const progress = useSharedValue(0);
  const head = useSharedValue(0);
  return useMemo(
    () => ({
      progress,
      head,
      draw: (ms) => {
        head.set(withSequence(withTiming(1, { duration: 120 }), withDelay(Math.max(0, ms - 120), withTiming(0, { duration: 200 }))));
        progress.set(withTiming(1, { duration: ms, easing: Easing.inOut(Easing.sin) }));
      },
      cut: (ms = 300) => {
        head.set(0);
        progress.set(withTiming(0, { duration: ms, easing: Easing.in(Easing.quad) }));
      },
      set: (v) => {
        head.set(0);
        progress.set(v);
      },
    }),
    [progress, head],
  );
}

/** Whole-preview opacity, faded out before the loop restarts. */
export function useFade() {
  const fade = useSharedValue(1);
  return useMemo(
    () => ({
      fade,
      out: (ms = 350) => fade.set(withTiming(0, { duration: ms })),
      show: () => fade.set(1),
    }),
    [fade],
  );
}

/** A ring that pops where the player taps. */
export function useTap() {
  const t = useSharedValue(0);
  return useMemo(() => ({ t, tap: () => t.set(withSequence(withTiming(0, { duration: 0 }), withTiming(1, { duration: 550 }))) }), [t]);
}

interface Seg {
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** Path length before this segment starts. */
  s: number;
  l: number;
}

/** Straight segments of a flow; strokes after the first start after a jump. */
function layout(strokes: Pt[][]): { segs: Seg[]; total: number } {
  const segs: Seg[] = [];
  let u = 0;
  strokes.forEach((stroke, si) => {
    if (si > 0) u += JUMP;
    for (let i = 1; i < stroke.length; i++) {
      const [r0, c0] = stroke[i - 1];
      const [r1, c1] = stroke[i];
      const l = Math.abs(r1 - r0) + Math.abs(c1 - c0);
      segs.push({ x: (c0 + 0.5) * C, y: (r0 + 0.5) * C, dx: Math.sign(c1 - c0), dy: Math.sign(r1 - r0), s: u, l });
      u += l;
    }
  });
  return { segs, total: u };
}

interface FlowProps {
  /** Axis-aligned polylines in cell coordinates; the flow jumps from the end of one to the start of the next. */
  strokes: Pt[][];
  color: DotStyle;
  flow: FlowControl;
  fade: SharedValue<number>;
}

/** A flow that grows along its path as `flow.progress` goes from 0 to 1. */
export function Flow({ strokes, color, flow, fade }: FlowProps) {
  const { segs, total } = useMemo(() => layout(strokes), [strokes]);
  return (
    <>
      {segs.map((seg, i) => (
        <FlowSegment key={i} seg={seg} total={total} color={color.line} progress={flow.progress} fade={fade} />
      ))}
    </>
  );
}

function FlowSegment({ seg, total, color, progress, fade }: { seg: Seg; total: number; color: string; progress: SharedValue<number>; fade: SharedValue<number> }) {
  const { board } = useTheme();
  const w = C * tokens.pathWidthRatio;
  const opacity = board.lineOpacity;
  const style = useAnimatedStyle(() => {
    const vis = Math.min(seg.l, Math.max(0, progress.value * total - seg.s)) * C;
    const x2 = seg.x + seg.dx * vis;
    const y2 = seg.y + seg.dy * vis;
    return {
      left: Math.min(seg.x, x2) - w / 2,
      top: Math.min(seg.y, y2) - w / 2,
      width: Math.abs(x2 - seg.x) + w,
      height: Math.abs(y2 - seg.y) + w,
      opacity: vis > 0 ? opacity * fade.value : 0,
    };
  });
  return <Animated.View pointerEvents="none" style={[{ position: 'absolute', borderRadius: w / 2, backgroundColor: color }, style]} />;
}

/** The drag head at the tip of a flow being drawn, as on the board. */
export function FlowHead({ strokes, color, flow, fade }: FlowProps) {
  const { segs, total } = useMemo(() => layout(strokes), [strokes]);
  const pathW = C * tokens.pathWidthRatio;
  const R = pathW * 1.05;
  const { progress, head } = flow;
  const style = useAnimatedStyle(() => {
    const u = progress.value * total;
    let x = 0;
    let y = 0;
    let on = 0;
    for (const seg of segs) {
      if (u >= seg.s && u <= seg.s + seg.l) {
        const d = (u - seg.s) * C;
        x = seg.x + seg.dx * d;
        y = seg.y + seg.dy * d;
        on = 1;
        break;
      }
    }
    return { opacity: on * head.value * fade.value, transform: [{ translateX: x - R }, { translateY: y - R }] };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: 'absolute', left: 0, top: 0, width: R * 2, height: R * 2, alignItems: 'center', justifyContent: 'center' }, style]}
    >
      <View style={{ position: 'absolute', width: R * 2, height: R * 2, borderRadius: R, backgroundColor: color.line, opacity: 0.3 }} />
      <View style={{ width: pathW * 0.84, height: pathW * 0.84, borderRadius: pathW, backgroundColor: color.line }} />
    </Animated.View>
  );
}

/** Tap feedback centered on a cell. */
export function TapRipple({ at, t }: { at: Pt; t: SharedValue<number> }) {
  const theme = useTheme();
  const d = C * 0.95;
  const style = useAnimatedStyle(() => {
    const v = t.value;
    const live = v > 0 && v < 1;
    return { opacity: live ? 0.85 * (1 - v) : 0, transform: [{ scale: 0.45 + 0.75 * v }] };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          left: (at[1] + 0.5) * C - d / 2,
          top: (at[0] + 0.5) * C - d / 2,
          width: d,
          height: d,
          borderRadius: d / 2,
          borderWidth: 2.5,
          borderColor: theme.text.primary,
          backgroundColor: 'rgba(255,255,255,0.35)',
        },
        style,
      ]}
    />
  );
}
