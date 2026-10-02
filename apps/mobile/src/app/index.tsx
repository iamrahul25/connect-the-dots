import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { dateKey, WEEKDAY_NAMES } from '@ctd/core';
import { Screen } from '../ui/Screen';
import { Logo } from '../ui/Logo';
import { GlassButton } from '../ui/GlassButton';
import { useLayout } from '../ui/layout';
import { fonts, tokens } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/useTheme';
import { withAlpha } from '../board/color';
import { globalNumber, maxStars } from '../data/levels';
import { nextToPlay, totalStars, useProgress } from '../store/progress';
import { useSettings } from '../store/settings';
import { audio } from '../services/audio';

const DAILY_DIFFICULTY = ['Expert', 'Easy', 'Easy+', 'Medium', 'Medium+', 'Hard', 'Hard+'];

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

export default function Home() {
  const theme = useTheme();
  const styles = useStyles();
  const levels = useProgress((s) => s.levels);
  const hints = useProgress((s) => s.hints);
  const unlimitedHints = useSettings((s) => __DEV__ && s.unlimitedHints);
  const daily = useProgress((s) => s.daily);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const { scale, s } = useLayout();
  const countdown = useCountdown();
  const next = nextToPlay(levels);
  const today = dateKey(new Date());
  const weekday = new Date().getDay();
  const dailyDone = !!daily.completed[today];
  const stars = totalStars(levels);

  useFocusEffect(
    React.useCallback(() => {
      audio.playMusic('dawn');
    }, []),
  );

  return (
    <Screen scroll center right={<GlassButton icon="settings-sharp" size="sm" onPress={() => router.push('/settings')} accessibilityLabel="Settings" />}>
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
            <Text style={styles.chipText}>{daily.streak}</Text>
          </View>
        </View>
      </Rise>

      <Rise delay={220}>
        <GlassButton
          label="Play"
          sublabel={`Level ${globalNumber(next)}`}
          icon="play"
          variant="primary"
          size="lg"
          onPress={() => router.push(`/play/${next}`)}
          style={styles.play}
        />
      </Rise>

      <Rise delay={320}>
        <Pressable
          onPress={() => router.push('/daily')}
          style={({ pressed }) => [styles.dailyCard, { borderColor: withAlpha(theme.text.primary, 0.25) }, pressed && { transform: [{ scale: 0.98 }] }]}
        >
          <View style={[styles.dailyIcon, { backgroundColor: withAlpha(theme.icon.streak, 0.18) }]}>
            <Ionicons name={dailyDone ? 'checkmark-circle' : 'calendar'} size={s(28)} color={theme.icon.streak} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.dailyTitle}>Daily Puzzle</Text>
            <Text style={styles.dailySub}>
              {WEEKDAY_NAMES[weekday]} · {DAILY_DIFFICULTY[weekday]}
              {dailyDone ? ' · solved' : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.dailyTimerLabel}>next in</Text>
            <Text style={styles.dailyTimer}>{countdown}</Text>
          </View>
        </Pressable>
      </Rise>

      <Rise delay={420}>
        <GlassButton label="Level Packs" icon="albums" size="lg" outlined onPress={() => router.push('/packs')} style={styles.packs} />
      </Rise>
    </Screen>
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
  dailyTimer: { fontFamily: fonts.title, fontSize: s(16), color: t.text.primary },
}));
