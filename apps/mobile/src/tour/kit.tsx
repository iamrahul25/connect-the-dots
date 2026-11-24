import React, { createContext, useCallback, useContext, useEffect, useEffectEvent, useMemo, useState } from 'react';
import { Text, View, type StyleProp, type TextStyle, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  withRepeat,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import { useClock } from '@shopify/react-native-skia';
import { drawEffects, type Effect, type EffectInput } from '../board/effects';
import { emptyPicture, recordPicture, skipPicture, usePictureSlot } from '../ui/skiaMemory';
import { fonts } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';
import { withAlpha } from '../board/color';

/** The tour's colors, all taken from the active game theme so it matches every other screen. */
export function useInk() {
  const t = useTheme();
  return useMemo(
    () => ({
      text: t.text.primary,
      soft: t.text.secondary,
      faint: t.text.muted,
      card: t.box.background,
      surface: t.box.surface,
      border: withAlpha(t.text.primary, 0.1),
      shadow: t.box.shadow,
      accent: t.accent.color,
      onAccent: t.accent.onColor,
      track: t.progress.track,
      gold: t.icon.star,
      flame: t.icon.streak,
      success: t.icon.success,
      hint: t.icon.hint,
      danger: t.icon.danger,
      info: t.icon.info,
      heart: t.icon.heart,
      pill: t.box.pill,
    }),
    [t],
  );
}

export type Ink = ReturnType<typeof useInk>;

/** How much slower 1x plays than the pacing the scenes are written in (their ms values). */
const SLOW_1X = 1.5;

/** Factor applied to every scene time (delays, beats, board steps) for a tour speed. */
export function timeScale(speed: number): number {
  return SLOW_1X / speed;
}

/** The active time factor; the Tour provides it from the player's chosen speed. */
export const TourTime = createContext(SLOW_1X);

/** Converts a scene time in ms to real ms at the current tour speed. */
export function useTime() {
  const k = useContext(TourTime);
  return useCallback((ms: number) => Math.round(ms * k), [k]);
}

/** Runs each `[ms, fn]` once, `ms` after mount (scaled by the tour speed). Timers are cleared on unmount, so scenes can be skipped mid-way. */
export function useBeats(beats: [ms: number, run: () => void][]) {
  const t = useTime();
  const run = useEffectEvent((i: number) => beats[i]?.[1]());
  const times = beats.map((b) => t(b[0])).join(',');
  useEffect(() => {
    // An empty list (Reduce Motion) must schedule nothing: ''.split(',') would yield one phantom beat.
    if (!times) return;
    const timers = times.split(',').map((ms, i) => setTimeout(() => run(i), Number(ms)));
    return () => timers.forEach(clearTimeout);
  }, [times]);
}

/** A list of one-shot effects plus `emit`, drawn by `useFxPicture` (the same effects the board uses). */
export function useFx(still: boolean) {
  const fx = useSharedValue<Effect[]>([]);
  const emit = useCallback(
    (e: EffectInput) => {
      if (still && (e.kind === 'burst' || e.kind === 'confetti')) return;
      const now = Date.now();
      fx.set([...fx.value.filter((f) => now - f.t0 < f.dur), { ...e, t0: now } as Effect]);
    },
    [fx, still],
  );
  return { fx, emit };
}

/** Skia picture of the live effects in `fx`; put it in a `<Picture>` on top of a canvas. */
export function useFxPicture(fx: SharedValue<Effect[]>) {
  const clock = useClock();
  const prev = usePictureSlot();
  const blank = emptyPicture();
  return useDerivedValue(() => {
    // Reading the clock re-runs this every frame while effects play.
    if (clock.value < 0) return blank;
    const list = fx.value;
    const now = Date.now();
    let live = false;
    for (let i = 0; i < list.length && !live; i++) live = now - list[i].t0 < list[i].dur;
    if (!live) return skipPicture(prev, blank);
    return recordPicture(prev, (canvas) => drawEffects(canvas, list, now));
  }, [blank]);
}

/** Springs its children in (scale + rise + fade) after `delay` ms (scaled by the tour speed). */
export function Pop({
  delay = 0,
  from = 0.6,
  rise = 18,
  still,
  style,
  children,
}: {
  delay?: number;
  from?: number;
  rise?: number;
  still?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  const v = useSharedValue(still ? 1 : 0);
  const wait = useTime()(delay);
  useEffect(() => {
    if (still) return;
    v.set(withDelay(wait, withSpring(1, { damping: 11, stiffness: 170, mass: 0.8 })));
  }, [wait, still, v]);
  const anim = useAnimatedStyle(() => ({
    opacity: Math.min(1, v.value * 1.6),
    transform: [{ translateY: (1 - v.value) * rise }, { scale: from + (1 - from) * v.value }],
  }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** Scene headline: big, glowing, springs up word by word. `\n` starts a new line (e.g. one per sentence). */
export function Caption({ text, delay = 0, still, size = 30, style }: { text: string; delay?: number; still?: boolean; size?: number; style?: StyleProp<ViewStyle> }) {
  const ink = useInk();
  let n = 0;
  return (
    <View style={[{ alignItems: 'center' }, style]} accessible accessibilityRole="header" accessibilityLabel={text.replace(/\n/g, ' ')}>
      {text.split('\n').map((line, l) => (
        <View key={l} style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' }}>
          {line.split(' ').map((w, i) => (
            <Pop key={i} delay={delay + n++ * 70} from={0.7} rise={14} still={still} style={{ marginHorizontal: size * 0.14 }}>
              <Text style={[captionStyle, { fontSize: size, lineHeight: size * 1.25, color: ink.text, textShadowColor: withAlpha(ink.accent, 0.35) }]}>{w}</Text>
            </Pop>
          ))}
        </View>
      ))}
    </View>
  );
}

const captionStyle: TextStyle = {
  fontFamily: fonts.titleBold,
  textAlign: 'center',
  letterSpacing: 0.3,
  textShadowRadius: 14,
  textShadowOffset: { width: 0, height: 0 },
};

/** Counts from 0 to `to` over `ms` after `delay`, easing out. */
export function useCountUp(to: number, sceneMs: number, sceneDelay: number, still: boolean) {
  const t = useTime();
  const ms = t(sceneMs);
  const delay = t(sceneDelay);
  const [n, setN] = useState(still ? to : 0);
  useEffect(() => {
    if (still) return;
    let raf = 0;
    let start = 0;
    const t = setTimeout(() => {
      const tick = (now: number) => {
        if (!start) start = now;
        const k = Math.min(1, (now - start) / ms);
        setN(Math.round(to * (1 - Math.pow(1 - k, 3))));
        if (k < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => {
      clearTimeout(t);
      cancelAnimationFrame(raf);
    };
  }, [to, ms, delay, still]);
  return n;
}

/** Gentle forever-breathing scale, for call-to-action buttons. */
export function Breathe({ still, children, style }: { still?: boolean; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const v = useSharedValue(0);
  useEffect(() => {
    if (still) return;
    v.set(withRepeat(withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }), -1, true));
    return () => cancelAnimation(v);
  }, [still, v]);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: 1 + 0.045 * v.value }] }));
  return <Animated.View style={[style, anim]}>{children}</Animated.View>;
}

/** Deterministic 0..1 noise, for particle layouts that look random but never jump between renders. */
export function rand(seed: number, i: number): number {
  'worklet';
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
