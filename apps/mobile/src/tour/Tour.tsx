import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { GlassButton } from '../ui/GlassButton';
import Animated, { Easing, Keyframe, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Ionicons } from '@expo/vector-icons';
import { TOUR_SPEEDS, useSettings } from '../store/settings';
import { ThemeOverride, useTheme } from '../theme/useTheme';
import { isThemeId } from '../theme/config';
import { Background, LANDSCAPE_H } from '../ui/Background';
import { audio } from '../services/audio';
import { fonts } from '../theme/tokens';
import { TourTime, timeScale, useInk } from './kit';
import { GameplayScene } from './scenes/GameplayScene';
import { OBSTACLE_SLOT, ObstaclesScene } from './scenes/ObstaclesScene';
import { OBSTACLE_KINDS } from '../game/ObstacleInfo';
import { JourneyScene } from './scenes/JourneyScene';
import { DailyScene } from './scenes/DailyScene';
import { FinaleScene } from './scenes/FinaleScene';
import type { SceneProps, TourMode } from './types';

/** Scene order and how long each plays (~39 s until the Play button). The finale holds at the end. */
const SCENES = [
  { id: 'gameplay', ms: 5800 },
  { id: 'obstacles', ms: OBSTACLE_SLOT * 7 + 250 },
  { id: 'journey', ms: 4800 },
  { id: 'daily', ms: 5000 },
  { id: 'finale', ms: 6000 },
] as const;
const LAST = SCENES.length - 1;
const CHROME_H = 56;
/** Height of the Back / Next row under the stage (onboarding and help). */
const NAV_H = 76;
/** Keeps the stage readable on tablets, web and landscape. */
const MAX_STAGE_W = 520;

const enter = new Keyframe({
  0: { opacity: 0, transform: [{ scale: 1.08 }] },
  100: { opacity: 1, transform: [{ scale: 1 }], easing: Easing.out(Easing.cubic) },
}).duration(520);
const leave = new Keyframe({
  0: { opacity: 1, transform: [{ scale: 1 }] },
  100: { opacity: 0, transform: [{ scale: 0.92 }] },
}).duration(380);

interface Props {
  mode: TourMode;
  /** Record mode only: theme to film in (defaults to Autumn), independent of the player's setting. */
  theme?: string;
  /** The finale's Play button. */
  onPlay: () => void;
  /** Skip (onboarding) or close (help). */
  onClose: () => void;
}

/**
 * The animated game tour: five scenes over the game's own themed background. Onboarding and help add a
 * progress bar, Skip/Close and Back/Next buttons (no autoplay); record mode is clean, hands-free and replays on tap.
 */
export function Tour(props: Props) {
  if (props.mode !== 'record') return <TourBody {...props} />;
  const theme = isThemeId(props.theme) ? props.theme : 'autumn';
  return (
    <ThemeOverride.Provider value={theme}>
      {/* The root layout's background follows the player's theme; the recording brings its own. */}
      <Background />
      <TourBody {...props} />
    </ThemeOverride.Provider>
  );
}

function TourBody({ mode, onPlay, onClose }: Props) {
  const ink = useInk();
  const theme = useTheme();
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const userStill = useSettings((s) => s.reduceMotion);
  const still = useReducedMotion() || userStill;
  const record = mode === 'record';
  const speed = useSettings((s) => s.tourSpeed) ?? 0.5;
  const k = timeScale(speed);
  const [index, setIndex] = useState(0);
  /** Which obstacle the obstacles slide shows (onboarding and help step through them with Back / Next). */
  const [obstacle, setObstacle] = useState(0);
  const lastObstacle = OBSTACLE_KINDS.length - 1;
  const [run, setRun] = useState(0);
  const fill = useSharedValue(0);

  useEffect(() => {
    audio.playMusic('cosmos');
  }, []);

  // Record mode plays the timeline hands-free; onboarding and help wait for Next on every slide.
  useEffect(() => {
    if (!record) {
      // The obstacles slide fills its bar one obstacle at a time.
      fill.set(withTiming(SCENES[index].id === 'obstacles' ? (obstacle + 1) / OBSTACLE_KINDS.length : 1, { duration: 250 }));
      return;
    }
    // Slide lengths are in scene ms, so they stretch with the speed like everything inside them.
    const ms = SCENES[index].ms * k;
    fill.set(0);
    fill.set(withTiming(1, { duration: ms, easing: Easing.linear }));
    if (index === LAST) return;
    const t = setTimeout(() => setIndex((i) => Math.min(LAST, i + 1)), ms);
    return () => clearTimeout(t);
  }, [index, run, fill, record, k, obstacle]);

  const go = (i: number) => setIndex(Math.max(0, Math.min(LAST, i)));
  const onObstacles = !record && SCENES[index].id === 'obstacles';
  // On the obstacles slide, Next and Back move one obstacle at a time and only leave the slide at either end.
  const next = () => {
    if (onObstacles && obstacle < lastObstacle) return setObstacle(obstacle + 1);
    if (SCENES[index + 1]?.id === 'obstacles') setObstacle(0);
    go(index + 1);
  };
  const back = () => {
    if (onObstacles && obstacle > 0) return setObstacle(obstacle - 1);
    // Coming back into the obstacles slide lands on the last obstacle seen going forward.
    if (SCENES[index - 1]?.id === 'obstacles') setObstacle(lastObstacle);
    go(index - 1);
  };
  // 0.5x -> 1x -> 2x -> 4x -> 0.5x; the current slide replays at the new speed.
  const cycleSpeed = () => {
    useSettings.getState().set({ tourSpeed: TOUR_SPEEDS[(TOUR_SPEEDS.indexOf(speed) + 1) % TOUR_SPEEDS.length] });
    setRun((r) => r + 1);
  };
  // Record mode only: a tap on the finale replays the whole cut.
  const onReplay = () => {
    if (index !== LAST) return;
    setIndex(0);
    setRun((r) => r + 1);
  };

  const top = insets.top + (record ? 8 : CHROME_H);
  const stageW = Math.min(winW, MAX_STAGE_W);
  // Leave the landscape's hills and trees along the bottom uncovered, as the game screen does,
  // plus room for the Back / Next buttons outside record mode.
  const stageH = winH - top - insets.bottom - Math.round(LANDSCAPE_H * 0.55) - (record ? 0 : NAV_H);
  const props: SceneProps = { width: stageW, height: stageH, still, sound: true };
  const id = SCENES[index].id;

  return (
    <TourTime.Provider value={k}>
      <View style={styles.root}>
        <StatusBar style={theme.statusBar === 'light' ? 'light' : 'dark'} hidden={record} />

        <Pressable
          onPress={record ? onReplay : undefined}
          disabled={!record}
          style={[styles.stage, { top, left: (winW - stageW) / 2, width: stageW, height: stageH }]}
          accessible={false}
        >
          <Animated.View key={`${run}-${id}`} entering={still ? undefined : enter} exiting={still ? undefined : leave} style={StyleSheet.absoluteFill}>
            {id === 'gameplay' && <GameplayScene {...props} />}
            {id === 'obstacles' && (record ? <ObstaclesScene {...props} /> : <ObstaclesScene {...props} obstacle={obstacle} onPick={setObstacle} />)}
            {id === 'journey' && <JourneyScene {...props} />}
            {id === 'daily' && <DailyScene {...props} />}
            {id === 'finale' && <FinaleScene {...props} playLabel={mode === 'onboarding' ? "Let's play" : 'Play'} onPlay={record ? undefined : onPlay} />}
          </Animated.View>
        </Pressable>

        {!record && (
          <View style={[styles.nav, { top: top + stageH, left: (winW - stageW) / 2 + 24, width: stageW - 48 }]}>
            <View style={styles.navSide}>
              {index > 0 && <GlassButton icon="chevron-back" size="md" variant="glass" onPress={back} accessibilityLabel="Previous slide" />}
            </View>
            <GlassButton
              label={`${speed}×`}
              size="md"
              variant="glass"
              onPress={cycleSpeed}
              accessibilityLabel={`Animation speed ${speed}x. Tap to change.`}
              style={styles.speed}
            />
            <View style={[styles.navSide, styles.navEnd]}>
              {index < LAST && (
                <GlassButton
                  label="Next"
                  icon="chevron-forward"
                  variant="primary"
                  size="md"
                  onPress={next}
                  accessibilityLabel="Next slide"
                  style={styles.next}
                />
              )}
            </View>
          </View>
        )}

        {!record && (
          <View style={[styles.chrome, { top: insets.top, left: (winW - stageW) / 2 + 16, width: stageW - 32 }]}>
            <View style={styles.bars}>
              {SCENES.map((s, i) => (
                <Segment key={s.id} state={i < index ? 'done' : i === index ? 'now' : 'todo'} fill={fill} />
              ))}
            </View>
            {/* First-launch players see at least the first slide before Skip appears; help can always close. */}
            {(mode !== 'onboarding' || index > 0) && (
              <Pressable
                onPress={onClose}
                hitSlop={12}
                accessibilityRole="button"
                accessibilityLabel={mode === 'onboarding' ? 'Skip intro' : 'Close tour'}
                style={({ pressed }) => [styles.skip, { backgroundColor: ink.surface, borderColor: ink.border, shadowColor: ink.shadow }, pressed && { opacity: 0.6 }]}
              >
                {mode === 'onboarding' ? <Text style={[styles.skipText, { color: ink.text }]}>Skip</Text> : <Ionicons name="close" size={20} color={ink.text} />}
              </Pressable>
            )}
          </View>
        )}
      </View>
    </TourTime.Provider>
  );
}

function Segment({ state, fill }: { state: 'done' | 'now' | 'todo'; fill: SharedValue<number> }) {
  const ink = useInk();
  const style = useAnimatedStyle(() => ({ width: `${(state === 'done' ? 1 : state === 'now' ? fill.value : 0) * 100}%` }));
  return (
    <View style={[styles.track, { backgroundColor: ink.track }]}>
      <Animated.View style={[styles.fill, { backgroundColor: ink.accent }, style]} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, overflow: 'hidden' },
  stage: { position: 'absolute' },
  chrome: { position: 'absolute', height: CHROME_H, flexDirection: 'row', alignItems: 'center', gap: 14 },
  bars: { flex: 1, flexDirection: 'row', gap: 5 },
  nav: { position: 'absolute', height: NAV_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  navSide: { flex: 1, alignItems: 'flex-start' },
  navEnd: { alignItems: 'flex-end' },
  speed: { minWidth: 64, marginHorizontal: 8 },
  next: { minWidth: 120 },
  track: { flex: 1, height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3 },
  skip: {
    minWidth: 40,
    height: 34,
    paddingHorizontal: 14,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    shadowOpacity: 1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  skipText: { fontFamily: fonts.bodyBold, fontSize: 14, letterSpacing: 0.5 },
});
