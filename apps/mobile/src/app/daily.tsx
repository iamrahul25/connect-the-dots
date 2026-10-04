import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { DAILY_TIER_NAMES, DAILY_TIERS, dateKey, parseDateKey, WEEKDAY_NAMES, type DailyTier } from '@ctd/core';
import { Screen } from '../ui/Screen';
import { GlassButton } from '../ui/GlassButton';
import { Stars } from '../ui/Stars';
import { fonts } from '../theme/tokens';
import { musicFor } from '../theme/packs';
import { makeStyles, useTheme } from '../theme/useTheme';
import type { UiTheme } from '../theme/config';
import { useScale } from '../theme/scale';
import { withAlpha } from '../board/color';
import { daySolvedCount, isDaySolved, isPerfectDay, useProgress, type DailyDay } from '../store/progress';
import { dailyPreview } from '../data/levels';
import { audio } from '../services/audio';

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const TIER_ICON: Record<DailyTier, keyof typeof Ionicons.glyphMap> = { easy: 'leaf', medium: 'flash', hard: 'diamond' };

function tierColor(theme: UiTheme, tier: DailyTier): string {
  return tier === 'easy' ? theme.icon.success : tier === 'medium' ? theme.icon.hint : theme.icon.danger;
}

export default function Daily() {
  const theme = useTheme();
  const styles = useStyles();
  const daily = useProgress((st) => st.daily);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayKey = dateKey(today);
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selected, setSelected] = useState(todayKey);

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
  const solvedDays = Object.values(daily.completed).filter(isDaySolved).length;
  const selectedDate = parseDateKey(selected);
  const selectedDay = daily.completed[selected];
  const perfect = isPerfectDay(selectedDay);
  const cal = theme.calendar;

  return (
    <Screen title="Daily Puzzle" subtitle="Three fresh puzzles every day" back scroll center>
      <View style={styles.streakRow}>
        <Stat icon="flame" color={theme.icon.streak} value={daily.streak} label="Streak" />
        <Stat icon="trophy" color={theme.icon.hint} value={daily.bestStreak} label="Best" />
        <Stat icon="checkmark-done" color={theme.icon.success} value={solvedDays} label="Days" />
      </View>

      <View style={[styles.dayCard, { borderColor: withAlpha(perfect ? theme.icon.star : theme.accent.color, 0.45) }]}>
        <Text style={styles.dayLabel}>
          {selected === todayKey
            ? `TODAY · ${WEEKDAY_NAMES[today.getDay()].toUpperCase()}`
            : selectedDate.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}
        </Text>
        <Text style={[styles.dayHint, perfect && { color: theme.icon.star }]}>
          {perfect ? '👑 Perfect day: all 3 solved' : 'Solve any one to keep your streak · all 3 for a 👑'}
        </Text>
        <View style={styles.tiers}>
          {DAILY_TIERS.map((tier) => (
            <TierRow key={tier} dateKey={selected} tier={tier} day={selectedDay} />
          ))}
        </View>
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
                const day = daily.completed[key];
                const solved = daySolvedCount(day);
                const future = d.getTime() > today.getTime();
                const isToday = key === todayKey;
                const isSelected = key === selected;
                return (
                  <View key={key} style={styles.day}>
                    <Pressable
                      disabled={future}
                      onPress={() => setSelected(key)}
                      accessibilityLabel={`${key}, ${solved} of 3 solved`}
                      accessibilityState={{ selected: isSelected }}
                      style={({ pressed }) => [
                        styles.dayInner,
                        solved > 0 && { backgroundColor: cal.solved },
                        isToday && { borderColor: cal.today, borderWidth: 2 },
                        isSelected && { borderColor: theme.accent.color, borderWidth: 2.5 },
                        pressed && { transform: [{ scale: 0.92 }] },
                      ]}
                    >
                      <Text style={[styles.dayText, solved > 0 && { color: cal.solvedText }, future && { color: cal.future }]}>{d.getDate()}</Text>
                      {solved === DAILY_TIERS.length ? (
                        <Text style={styles.crown}>👑</Text>
                      ) : (
                        solved > 0 && (
                          <View style={styles.pips}>
                            {DAILY_TIERS.map((t) => (
                              <View key={t} style={[styles.pip, { backgroundColor: day?.[t] ? cal.solvedText : withAlpha(cal.solvedText, 0.3) }]} />
                            ))}
                          </View>
                        )
                      )}
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

function TierRow({ dateKey: key, tier, day }: { dateKey: string; tier: DailyTier; day: DailyDay | undefined }) {
  const theme = useTheme();
  const styles = useStyles();
  const { s } = useScale();
  const color = tierColor(theme, tier);
  const result = day?.[tier];
  const { size, obstacles } = useMemo(() => dailyPreview(key, tier), [key, tier]);
  return (
    <Pressable
      onPress={() => router.push(`/play/daily-${key}-${tier}`)}
      accessibilityLabel={`${DAILY_TIER_NAMES[tier]}, ${size} by ${size}${result ? ', solved' : ''}`}
      style={({ pressed }) => [styles.tier, { borderColor: withAlpha(color, 0.5) }, pressed && { transform: [{ scale: 0.97 }] }]}
    >
      <View style={[styles.tierIcon, { backgroundColor: withAlpha(color, 0.18) }]}>
        <Ionicons name={TIER_ICON[tier]} size={s(20)} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.tierName}>{DAILY_TIER_NAMES[tier]}</Text>
        <Text style={styles.tierSub}>
          {size}×{size} · {obstacles} obstacle{obstacles === 1 ? '' : 's'}
        </Text>
      </View>
      {result ? <Stars count={result.stars} size={s(16)} /> : <Ionicons name="play-circle" size={s(30)} color={color} />}
    </Pressable>
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
  dayCard: {
    marginTop: s(14),
    padding: s(16),
    borderRadius: s(24),
    alignItems: 'center',
    backgroundColor: t.box.background,
    borderWidth: 1.5,
    gap: s(4),
  },
  dayLabel: { fontFamily: fonts.bodyBold, fontSize: s(12), letterSpacing: 2, color: t.text.secondary },
  dayHint: { fontFamily: fonts.body, fontSize: s(13), color: t.text.secondary, textAlign: 'center' },
  tiers: { alignSelf: 'stretch', gap: s(8), marginTop: s(10) },
  tier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(12),
    paddingVertical: s(10),
    paddingHorizontal: s(12),
    borderRadius: s(18),
    borderWidth: 1.5,
    backgroundColor: t.box.surface,
  },
  tierIcon: { width: s(40), height: s(40), borderRadius: s(14), alignItems: 'center', justifyContent: 'center' },
  tierName: { fontFamily: fonts.title, fontSize: s(18), color: t.text.primary },
  tierSub: { fontFamily: fonts.body, fontSize: s(12), color: t.text.secondary },
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
  crown: { position: 'absolute', bottom: s(1), fontSize: s(10) },
  pips: { position: 'absolute', bottom: s(4), flexDirection: 'row', gap: s(2) },
  pip: { width: s(4), height: s(4), borderRadius: s(2) },
}));
