import React, { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { dateKey, WEEKDAY_NAMES } from '@ctd/core';
import { Screen } from '../ui/Screen';
import { Logo } from '../ui/Logo';
import { GlassButton } from '../ui/GlassButton';
import { fonts, tokens } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/useTheme';
import { withAlpha } from '../board/color';
import { globalNumber, maxStars } from '../data/levels';
import { nextToPlay, totalStars, useProgress } from '../store/progress';
import { useSettings } from '../store/settings';
import { useUi } from '../store/ui';
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
  const dailyTheme = useTheme('daily');
  const styles = useStyles();
  const levels = useProgress((s) => s.levels);
  const hints = useProgress((s) => s.hints);
  const unlimitedHints = useSettings((s) => __DEV__ && s.unlimitedHints);
  const daily = useProgress((s) => s.daily);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const countdown = useCountdown();
  const next = nextToPlay(levels);
  const today = dateKey(new Date());
  const weekday = new Date().getDay();
  const dailyDone = !!daily.completed[today];
  const stars = totalStars(levels);

  useFocusEffect(
    React.useCallback(() => {
      useUi.getState().setPack('dawn');
      audio.playMusic('dawn');
    }, []),
  );

  return (
    <Screen right={<GlassButton icon="settings-sharp" size="sm" onPress={() => router.push('/settings')} accessibilityLabel="Settings" />}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Rise delay={0}>
          <View style={styles.hero}>
            <Logo reduceMotion={reduceMotion} />
            <Text style={styles.title}>Connect the Dots</Text>
            <Text style={styles.tagline}>Link the colors · fill every cell</Text>
          </View>
        </Rise>

        <Rise delay={120}>
          <View style={styles.statsRow}>
            <View style={styles.chip}>
              <Ionicons name="star" size={16} color={theme.icon.star} />
              <Text style={styles.chipText}>
                {stars}
                <Text style={styles.chipDim}> / {maxStars()}</Text>
              </Text>
            </View>
            <View style={styles.chip}>
              <Ionicons name="bulb" size={16} color={theme.icon.hint} />
              <Text style={styles.chipText}>{unlimitedHints ? '∞' : hints}</Text>
            </View>
            <View style={styles.chip}>
              <Ionicons name="flame" size={16} color={theme.icon.streak} />
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
            style={({ pressed }) => [styles.dailyCard, { borderColor: withAlpha(dailyTheme.accent.color, 0.45) }, pressed && { transform: [{ scale: 0.98 }] }]}
          >
            <View style={[styles.dailyIcon, { backgroundColor: withAlpha(dailyTheme.accent.color, 0.18) }]}>
              <Ionicons name={dailyDone ? 'checkmark-circle' : 'calendar'} size={28} color={dailyTheme.icon.hint} />
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
          <GlassButton label="Level Packs" icon="albums" onPress={() => router.push('/packs')} style={{ marginTop: 14 }} />
        </Rise>
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  scroll: { alignItems: 'stretch', paddingBottom: 24, width: '100%', maxWidth: 460, alignSelf: 'center' },
  hero: { alignItems: 'center', marginTop: 8, marginBottom: 18 },
  title: { fontFamily: fonts.titleBold, fontSize: 40, color: t.text.primary, marginTop: 16, letterSpacing: 0.5, textAlign: 'center' },
  tagline: { fontFamily: fonts.body, fontSize: 15, color: t.text.secondary, marginTop: 4 },
  statsRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 22 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: tokens.radius.pill,
    backgroundColor: t.box.background,
    borderWidth: 1,
    borderColor: t.box.border,
  },
  chipText: { fontFamily: fonts.bodyBold, fontSize: 15, color: t.text.primary },
  chipDim: { color: t.text.muted, fontFamily: fonts.body },
  play: { alignSelf: 'stretch' },
  dailyCard: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 16,
    borderRadius: 22,
    backgroundColor: t.box.background,
    borderWidth: 1,
    shadowColor: t.box.shadow,
    shadowOpacity: 1,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
  },
  dailyIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  dailyTitle: { fontFamily: fonts.title, fontSize: 19, color: t.text.primary },
  dailySub: { fontFamily: fonts.body, fontSize: 13, color: t.text.secondary },
  dailyTimerLabel: { fontFamily: fonts.body, fontSize: 11, color: t.text.muted, textTransform: 'uppercase', letterSpacing: 1 },
  dailyTimer: { fontFamily: fonts.title, fontSize: 16, color: t.text.primary },
}));
