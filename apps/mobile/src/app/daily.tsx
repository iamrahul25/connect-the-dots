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
import { useScale } from '../theme/scale';
import { withAlpha } from '../board/color';
import { useProgress } from '../store/progress';
import { audio } from '../services/audio';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DIFFICULTY = ['10×10 · Expert', '6×6 · Easy', '7×7 · Easy+', '7×7 · Medium', '8×8 · Medium+', '8×8 · Hard', '9×9 · Hard+'];

export default function Daily() {
  const theme = useTheme();
  const styles = useStyles();
  const { s } = useScale();
  const daily = useProgress((st) => st.daily);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = dateKey(today);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  useFocusEffect(
    React.useCallback(() => {
      audio.playMusic(musicFor('daily'));
    }, []),
  );

  const weeks = useMemo(() => {
    const first = new Date(month);
    const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const cells: (Date | null)[] = Array.from({ length: first.getDay() }, () => null);
    for (let d = 1; d <= days; d++) cells.push(new Date(month.getFullYear(), month.getMonth(), d));
    while (cells.length % 7) cells.push(null);
    const out: (Date | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) out.push(cells.slice(i, i + 7));
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
        {todayDone && <Stars count={daily.completed[todayKey].stars} size={s(20)} />}
        <GlassButton
          label={todayDone ? 'Play again' : 'Play today'}
          icon="play"
          variant="primary"
          size="lg"
          onPress={() => router.push(`/play/daily-${todayKey}`)}
          style={styles.playToday}
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
          {weeks.map((week, w) => (
            <View key={w} style={styles.weekRow}>
              {week.map((d, i) => {
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
                      {done && <Ionicons name="checkmark" size={s(10)} color={cal.solvedText} style={styles.check} />}
                    </Pressable>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </View>
    </Screen>
  );
}

function Stat({ icon, color, value, label }: { icon: keyof typeof Ionicons.glyphMap; color: string; value: number; label: string }) {
  const styles = useStyles();
  const { s } = useScale();
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={s(22)} color={color} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((t, s) => ({
  streakRow: { flexDirection: 'row', gap: s(10) },
  stat: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: s(12),
    borderRadius: s(18),
    backgroundColor: t.box.background,
    borderWidth: 1,
    borderColor: t.box.border,
  },
  statValue: { fontFamily: fonts.titleBold, fontSize: s(24), color: t.text.primary, marginTop: 2 },
  statLabel: { fontFamily: fonts.body, fontSize: s(11), color: t.text.secondary, textTransform: 'uppercase', letterSpacing: 1 },
  todayCard: {
    marginTop: s(14),
    padding: s(20),
    borderRadius: s(24),
    alignItems: 'center',
    backgroundColor: t.box.background,
    borderWidth: 1.5,
    gap: s(4),
  },
  todayLabel: { fontFamily: fonts.bodyBold, fontSize: s(12), letterSpacing: 2, color: t.text.secondary },
  todayDiff: { fontFamily: fonts.titleBold, fontSize: s(26), color: t.text.primary },
  playToday: { marginTop: s(16), alignSelf: 'stretch' },
  calendar: { marginTop: s(14), padding: s(12), borderRadius: s(24), backgroundColor: t.box.surface, borderWidth: 1, borderColor: t.box.border },
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  month: { fontFamily: fonts.title, fontSize: s(18), color: t.text.primary },
  week: { flexDirection: 'row', marginTop: s(6) },
  dow: { flex: 1, textAlign: 'center', fontFamily: fonts.bodyBold, fontSize: s(12), color: t.text.muted },
  days: { marginTop: s(6) },
  weekRow: { flexDirection: 'row' },
  day: { flex: 1, aspectRatio: 1, padding: s(3) },
  dayInner: {
    flex: 1,
    borderRadius: s(12),
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: t.calendar.day,
  },
  dayText: { fontFamily: fonts.bodyBold, fontSize: s(14), color: t.calendar.dayText },
  check: { position: 'absolute', bottom: s(3) },
}));
