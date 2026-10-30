import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { DAILY_TIERS, dateKey, WEEKDAY_NAMES } from '@ctd/core';
import { Screen } from '../ui/Screen';
import { Logo } from '../ui/Logo';
import { GlassButton } from '../ui/GlassButton';
import { RankButton } from '../ui/RankButton';
import { useLayout } from '../ui/layout';
import { fonts, tokens } from '../theme/tokens';
import { makeStyles, usePalette, useTheme } from '../theme/useTheme';
import { HowToPlay } from '../game/HowToPlay';
import { withAlpha } from '../board/color';
import { levelNumber, maxStars, packOfLevel } from '../data/levels';
import { daySolvedCount, nextToPlay, streaksOf, totalStars, useProgress } from '../store/progress';
import { useSettings } from '../store/settings';
import { audio } from '../services/audio';

function useCountdown() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  const s = Math.max(0, Math.floor((midnight.getTime() - now) / 1000));
  const hh = String(Math.floor(s / 3600)).padStart(2, '0');
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

function Rise({ delay, children }: { delay: number; children: React.ReactNode }) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(delay, withSpring(1, { damping: 16, stiffness: 120 }));
  }, [delay, v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ translateY: (1 - v.value) * 24 }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/** Both idle loops share this period so the header buttons take turns instead of moving together. */
const IDLE_PERIOD = 6000;

/** Pops a header button in, then gives it a small periodic flourish: a wiggle or a full turn. */
function HeaderPop({ delay, idle, still, children }: { delay: number; idle: 'wiggle' | 'spin'; still: boolean; children: React.ReactNode }) {
  const pop = useSharedValue(still ? 1 : 0);
  const turn = useSharedValue(0);
  useEffect(() => {
    if (still) {
      cancelAnimation(pop);
      cancelAnimation(turn);
      pop.value = 1;
      turn.value = 0;
      return;
    }
    pop.value = withDelay(delay, withSpring(1, { damping: 9, stiffness: 170 }));
    const ease = Easing.inOut(Easing.cubic);
    const flourish =
      idle === 'wiggle'
        ? withSequence(
            withTiming(-14, { duration: 90 }),
            withTiming(12, { duration: 120 }),
            withTiming(-7, { duration: 110 }),
            withTiming(4, { duration: 100 }),
            withTiming(0, { duration: 120 }),
            withDelay(IDLE_PERIOD - 540, withTiming(0, { duration: 0 })),
          )
        : withSequence(
            withTiming(360, { duration: 900, easing: ease }),
            withTiming(0, { duration: 0 }),
            withDelay(IDLE_PERIOD - 900, withTiming(0, { duration: 0 })),
          );
    turn.value = withDelay(delay + (idle === 'wiggle' ? 1500 : 4500), withRepeat(flourish, -1, false));
    return () => {
      cancelAnimation(pop);
      cancelAnimation(turn);
    };
  }, [still, delay, idle, pop, turn]);

  const entryTilt = idle === 'spin' ? -120 : -30;
  const style = useAnimatedStyle(() => ({
    opacity: Math.min(1, pop.value),
    transform: [{ scale: 0.4 + 0.6 * pop.value }, { rotate: `${(1 - pop.value) * entryTilt + turn.value}deg` }],
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export default function Home() {
  const theme = useTheme();
  const styles = useStyles();
  const levels = useProgress((s) => s.levels);
  const hints = useProgress((s) => s.hints);
  const unlimitedHints = useSettings((s) => __DEV__ && s.unlimitedHints);
  const daily = useProgress((s) => s.daily);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const systemReduceMotion = useReducedMotion();
  const still = reduceMotion || systemReduceMotion;
  const handcrafted = useSettings((s) => s.handcrafted);
  const { scale, s } = useLayout();
  const countdown = useCountdown();
  const next = nextToPlay(levels);
  const today = dateKey(new Date());
  const weekday = new Date().getDay();
  const dailySolved = daySolvedCount(daily.completed[today]);
  const streak = streaksOf(daily.completed).current;
  const stars = totalStars(levels);
  const palette = usePalette();
  const [helpOpen, setHelpOpen] = useState(false);

  useFocusEffect(
    React.useCallback(() => {
      audio.playMusic('dawn');
    }, []),
  );

  return (
    <>
      <Screen
        scroll
        center
        left={<RankButton stars={stars} onPress={() => router.push('/ranks')} />}
        right={
          <>
            <HeaderPop delay={150} idle="wiggle" still={still}>
              <GlassButton glyph="?" size="sm" onPress={() => setHelpOpen(true)} accessibilityLabel="How to play" />
            </HeaderPop>
            <HeaderPop delay={260} idle="spin" still={still}>
              <GlassButton icon="settings-sharp" size="sm" onPress={() => router.push('/settings')} accessibilityLabel="Settings" />
            </HeaderPop>
          </>
        }
      >
        <Rise delay={0}>
          <View style={styles.hero}>
            <Logo reduceMotion={reduceMotion} scale={scale} />
            <Text style={styles.title} numberOfLines={1} adjustsFontSizeToFit>
              Connect the Dots
            </Text>
            <Text style={styles.tagline}>Link the colors · fill every cell</Text>
          </View>
        </Rise>

        <Rise delay={120}>
          <View style={styles.statsRow}>
            <View style={styles.chip}>
              <Ionicons name="star" size={s(16)} color={theme.icon.star} />
              <Text style={styles.chipText}>
                {stars}
                <Text style={styles.chipDim}> / {maxStars()}</Text>
              </Text>
            </View>
            <View style={styles.chip}>
              <Ionicons name="bulb" size={s(16)} color={theme.icon.hint} />
              <Text style={styles.chipText}>{unlimitedHints ? '∞' : hints}</Text>
            </View>
            <View style={styles.chip}>
              <Ionicons name="flame" size={s(16)} color={theme.icon.streak} />
              <Text style={styles.chipText}>{streak}</Text>
            </View>
          </View>
        </Rise>

        <Rise delay={220}>
          <GlassButton
            label="Play"
            sublabel={`${packOfLevel(next)?.name} · Level ${levelNumber(next)}`}
            icon="play"
            variant="primary"
            size="lg"
            onPress={() => router.push(`/play/${next}`)}
            style={styles.play}
          />
        </Rise>

        <Rise delay={320}>
          <GlassButton label="Level Packs" icon="albums" size="lg" outlined onPress={() => router.push('/packs')} style={styles.packs} />
        </Rise>

        {handcrafted && (
          <Rise delay={420}>
            <GlassButton
              label="Handcrafted"
              sublabel="Create & play shared levels"
              icon="construct"
              size="lg"
              outlined
              onPress={() => router.push('/custom')}
              style={styles.packs}
            />
          </Rise>
        )}

        {/* Always the last item on the menu. */}
        <Rise delay={handcrafted ? 520 : 420}>
          <Pressable
            onPress={() => router.push('/daily')}
            style={({ pressed }) => [styles.dailyCard, { borderColor: withAlpha(theme.text.primary, 0.25) }, pressed && { transform: [{ scale: 0.98 }] }]}
          >
            <View style={[styles.dailyIcon, { backgroundColor: withAlpha(theme.icon.streak, 0.18) }]}>
              {dailySolved === DAILY_TIERS.length ? (
                <Text style={{ fontSize: s(26) }}>👑</Text>
              ) : (
                <Ionicons name={dailySolved > 0 ? 'checkmark-circle' : 'calendar'} size={s(28)} color={theme.icon.streak} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.dailyTitle}>Daily Puzzle</Text>
              <Text style={styles.dailySub}>
                {WEEKDAY_NAMES[weekday]} · {dailySolved > 0 ? `${dailySolved}/${DAILY_TIERS.length} solved` : 'Easy · Medium · Hard'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.dailyTimerLabel}>next in</Text>
              <View style={styles.timerRow} accessible accessibilityLabel={countdown}>
                {countdown.split('').map((ch, i) => (
                  <Text key={i} style={[styles.dailyTimer, ch === ':' ? styles.timerColon : styles.timerDigit]}>
                    {ch}
                  </Text>
                ))}
              </View>
            </View>
          </Pressable>
        </Rise>
      </Screen>
      {helpOpen && <HowToPlay palette={palette} onClose={() => setHelpOpen(false)} />}
    </>
  );
}

const useStyles = makeStyles((t, s) => ({
  hero: { alignItems: 'center', marginBottom: s(18) },
  title: { fontFamily: fonts.titleBold, fontSize: s(40), color: t.text.primary, marginTop: s(16), letterSpacing: 0.5, textAlign: 'center' },
  tagline: { fontFamily: fonts.body, fontSize: s(15), color: t.text.secondary, marginTop: s(4) },
  statsRow: { flexDirection: 'row', justifyContent: 'center', flexWrap: 'wrap', gap: s(10), marginBottom: s(22) },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    paddingHorizontal: s(14),
    height: s(36),
    borderRadius: tokens.radius.pill,
    backgroundColor: t.box.background,
    borderWidth: 1,
    borderColor: t.box.border,
  },
  chipText: { fontFamily: fonts.bodyBold, fontSize: s(15), color: t.text.primary },
  chipDim: { color: t.text.muted, fontFamily: fonts.body },
  play: { alignSelf: 'stretch' },
  packs: { marginTop: s(14) },
  dailyCard: {
    marginTop: s(14),
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(14),
    padding: s(16),
    borderRadius: s(22),
    backgroundColor: t.box.background,
    borderWidth: 1,
    shadowColor: t.box.shadow,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  dailyIcon: { width: s(48), height: s(48), borderRadius: s(16), alignItems: 'center', justifyContent: 'center' },
  dailyTitle: { fontFamily: fonts.title, fontSize: s(19), color: t.text.primary },
  dailySub: { fontFamily: fonts.body, fontSize: s(13), color: t.text.secondary },
  dailyTimerLabel: { fontFamily: fonts.body, fontSize: s(11), color: t.text.muted, textTransform: 'uppercase', letterSpacing: 1 },
  dailyTimer: { fontFamily: fonts.title, fontSize: s(16), color: t.text.primary, textAlign: 'center' },
  /** Fixed cells so the countdown keeps its width as digits change, whatever the font's digit widths. */
  timerRow: { flexDirection: 'row' },
  timerDigit: { width: s(10.5) },
  timerColon: { width: s(5) },
}));
