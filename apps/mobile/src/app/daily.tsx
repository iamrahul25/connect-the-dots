import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { dateKey, WEEKDAY_NAMES } from '@ctd/core';
import { Screen } from '../ui/Screen';
import { GlassButton } from '../ui/GlassButton';
import { Stars } from '../ui/Stars';
import { fonts } from '../theme/tokens';
import { musicFor } from '../theme/packs';
import { makeStyles, useTheme } from '../theme/useTheme';
import { withAlpha } from '../board/color';
import { useProgress } from '../store/progress';
import { audio } from '../services/audio';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DIFFICULTY = ['10×10 · Expert', '6×6 · Easy', '7×7 · Easy+', '7×7 · Medium', '8×8 · Medium+', '8×8 · Hard', '9×9 · Hard+'];

export default function Daily() {
  const theme = useTheme();
  const styles = useStyles();
  const daily = useProgress((s) => s.daily);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = dateKey(today);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  useFocusEffect(
    React.useCallback(() => {
      audio.playMusic(musicFor('daily'));
    }, []),
  );

  const cells = useMemo(() => {
    const first = new Date(month);
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const out: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
    for (let d = 1; d <= days; d++) out.push(new Date(month.getFullYear(), month.getMonth(), d));
    return out;
  }, [month]);

  const canNext = month.getFullYear() < today.getFullYear() || month.getMonth() < today.getMonth();
  const shift = (n: number) => setMonth(new Date(month.getFullYear(), month.getMonth() + n, 1));
  const todayDone = !!daily.completed[todayKey];
  const cal = theme.calendar;

  return (
    <Screen title="Daily Puzzle" subtitle="A fresh puzzle every day" back scroll center>
      <View style={styles.streakRow}>
        <Stat icon="flame" color={theme.icon.streak} value={daily.streak} label="Streak" />
        <Stat icon="trophy" color={theme.icon.hint} value={daily.bestStreak} label="Best" />
        <Stat icon="checkmark-done" color={theme.icon.success} value={Object.keys(daily.completed).length} label="Solved" />
      </View>

      <View style={[styles.todayCard, { borderColor: withAlpha(theme.accent.color, 0.45) }]}>
        <Text style={styles.todayLabel}>TODAY · {WEEKDAY_NAMES[today.getDay()].toUpperCase()}</Text>
        <Text style={styles.todayDiff}>{DIFFICULTY[today.getDay()]}</Text>
        {todayDone && <Stars count={daily.completed[todayKey].stars} size={20} />}
        <GlassButton
          label={todayDone ? 'Play again' : 'Play today'}
          icon="play"
          variant="primary"
          size="lg"
          onPress={() => router.push(`/play/daily-${todayKey}`)}
          style={{ marginTop: 16, alignSelf: 'stretch' }}
        />
      </View>

      <View style={styles.calendar}>
        <View style={styles.monthRow}>
          <GlassButton icon="chevron-back" size="sm" variant="ghost" onPress={() => shift(-1)} accessibilityLabel="Previous month" />
          <Text style={styles.month}>{month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</Text>
          <GlassButton icon="chevron-forward" size="sm" variant="ghost" onPress={() => shift(1)} disabled={!canNext} accessibilityLabel="Next month" />
        </View>
        <View style={styles.week}>
          {DOW.map((d, i) => (
            <Text key={i} style={styles.dow}>
              {d}
            </Text>
          ))}
        </View>
        <View style={styles.days}>
          {cells.map((d, i) => {
            if (!d) return <View key={`e${i}`} style={styles.day} />;
            const key = dateKey(d);
            const done = daily.completed[key];
            const future = d.getTime() > today.getTime();
            const isToday = key === todayKey;
            return (
              <View key={key} style={styles.day}>
                <Pressable
                  disabled={future}
                  onPress={() => router.push(`/play/daily-${key}`)}
                  accessibilityLabel={`${key}${done ? ', solved' : ''}`}
                  style={({ pressed }) => [
                    styles.dayInner,
                    done && { backgroundColor: cal.solved },
                    isToday && { borderColor: cal.today, borderWidth: 2 },
                    pressed && { transform: [{ scale: 0.92 }] },
                  ]}
                >
                  <Text style={[styles.dayText, done && { color: cal.solvedText }, future && { color: cal.future }]}>{d.getDate()}</Text>
                  {done && <Ionicons name="checkmark" size={10} color={cal.solvedText} style={styles.check} />}
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>
    </Screen>
  );
}

function Stat({ icon, color, value, label }: { icon: keyof typeof Ionicons.glyphMap; color: string; value: number; label: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={22} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  streakRow: { flexDirection: 'row', gap: 10 },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 18,
    backgroundColor: t.box.background,
    borderWidth: 1,
    borderColor: t.box.border,
  },
  statValue: { fontFamily: fonts.titleBold, fontSize: 24, color: t.text.primary, marginTop: 2 },
  statLabel: { fontFamily: fonts.body, fontSize: 11, color: t.text.secondary, textTransform: 'uppercase', letterSpacing: 1 },
  todayCard: {
    marginTop: 14,
    padding: 20,
    borderRadius: 24,
    alignItems: 'center',
    backgroundColor: t.box.background,
    borderWidth: 1.5,
    gap: 4,
  },
  todayLabel: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 2, color: t.text.secondary },
  todayDiff: { fontFamily: fonts.titleBold, fontSize: 26, color: t.text.primary },
  calendar: { marginTop: 14, padding: 12, borderRadius: 24, backgroundColor: t.box.surface, borderWidth: 1, borderColor: t.box.border },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { fontFamily: fonts.title, fontSize: 18, color: t.text.primary },
  week: { flexDirection: 'row', marginTop: 6 },
  dow: { width: `${100 / 7}%`, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: 12, color: t.text.muted },
  days: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 6 },
  day: { width: `${100 / 7}%`, aspectRatio: 1, padding: 3 },
  dayInner: {
    flex: 1,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: t.calendar.day,
  },
  dayText: { fontFamily: fonts.bodyBold, fontSize: 14, color: t.calendar.dayText },
  check: { position: 'absolute', bottom: 3 },
}));
