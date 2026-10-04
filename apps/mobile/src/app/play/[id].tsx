import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { DAILY_TIER_NAMES, DAILY_TIERS, isDailyTier, parseDateKey, WEEKDAY_NAMES, type DailyTier, type Level } from '@ctd/core';
import { GameScreen } from '../../game/GameScreen';
import { Screen } from '../../ui/Screen';
import { fonts } from '../../theme/tokens';
import { makeStyles, useTheme } from '../../theme/useTheme';
import { dailyFromBank, generateDaily, getLevel, globalNumber, nextLevelId, packOfLevel } from '../../data/levels';
import { isLevelUnlocked, useProgress } from '../../store/progress';
import { useSettings } from '../../store/settings';

const DAILY_PREFIX = 'daily-';
const DAILY_ID = /^daily-(\d{4}-\d{2}-\d{2})-(\w+)$/;

export default function PlayRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (id?.startsWith(DAILY_PREFIX)) {
    const m = DAILY_ID.exec(id);
    if (!m || !isDailyTier(m[2])) return <InvalidDaily />;
    return <DailyPlay key={id} dateKey={m[1]} tier={m[2]} />;
  }
  return <PackPlay id={id ?? ''} />;
}

function InvalidDaily() {
  const styles = useStyles();
  return (
    <Screen title="Daily" back>
      <Text style={styles.msg}>Invalid daily puzzle.</Text>
    </Screen>
  );
}

function PackPlay({ id }: { id: string }) {
  const styles = useStyles();
  const level = getLevel(id);
  const pack = packOfLevel(id);
  useSettings((s) => s.unlockAll);
  const unlocked = useProgress((s) => isLevelUnlocked(s.levels, id));

  useEffect(() => {
    if (level && unlocked) useProgress.getState().setLastPlayed(id);
  }, [id, level, unlocked]);

  if (!level || !pack || !unlocked) {
    return (
      <Screen title={level ? 'Locked' : 'Not found'} back>
        <Text style={styles.msg}>{level ? 'Solve the previous level first.' : `No level "${id}".`}</Text>
      </Screen>
    );
  }

  const next = nextLevelId(id);
  const nextPack = next ? packOfLevel(next) : undefined;
  const nextLabel = !next ? 'More soon' : nextPack && nextPack.id !== pack.id ? `${nextPack.name}` : 'Next';

  return (
    <GameScreen
      key={id}
      level={level}
      mode="pack"
      title={`Level ${globalNumber(id)}`}
      subtitle={`${pack.name} · ${level.size.width}×${level.size.height}`}
      pack={pack.theme}
      nextLabel={nextLabel}
      onNext={() => {
        if (next && isLevelUnlocked(useProgress.getState().levels, next)) router.replace(`/play/${next}`);
        else router.replace(`/pack/${pack.id}`);
      }}
      onLevels={() => router.dismissTo(`/pack/${pack.id}`)}
    />
  );
}

function DailyPlay({ dateKey, tier }: { dateKey: string; tier: DailyTier }) {
  const theme = useTheme();
  const styles = useStyles();
  const [level, setLevel] = useState<Level | null | undefined>(() => dailyFromBank(dateKey, tier));
  const daily = useMemo(() => ({ key: dateKey, tier }), [dateKey, tier]);
  // Snapshot on open: the tier being played counts as done once it's solved.
  const [nextTier] = useState(() => {
    const day = useProgress.getState().daily.completed[dateKey];
    return DAILY_TIERS.find((t) => t !== tier && !day?.[t]);
  });

  useEffect(() => {
    if (level !== undefined) return;
    // Yield a frame so the spinner renders before the synchronous generator runs.
    const t = setTimeout(() => setLevel(generateDaily(dateKey, tier)), 60);
    return () => clearTimeout(t);
  }, [dateKey, tier, level]);

  if (level === undefined) {
    return (
      <Screen title="Daily" back>
        <View style={styles.center}>
          <ActivityIndicator color={theme.accent.color} size="large" />
          <Text style={styles.msg}>Crafting today’s puzzle…</Text>
        </View>
      </Screen>
    );
  }
  if (level === null) {
    return (
      <Screen title="Daily" back>
        <Text style={styles.msg}>Couldn’t build this puzzle. Try again later.</Text>
      </Screen>
    );
  }

  const d = parseDateKey(dateKey);
  return (
    <GameScreen
      key={level.id}
      level={level}
      mode="daily"
      daily={daily}
      title={`Daily · ${DAILY_TIER_NAMES[tier]}`}
      subtitle={`${WEEKDAY_NAMES[d.getDay()]} · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${level.size.width}×${level.size.height}`}
      pack="daily"
      nextLabel={nextTier ? DAILY_TIER_NAMES[nextTier] : 'Calendar'}
      onNext={() => router.replace(nextTier ? `/play/daily-${dateKey}-${nextTier}` : '/daily')}
      onLevels={() => router.dismissTo('/daily')}
    />
  );
}

const useStyles = makeStyles((t, s) => ({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: s(16) },
  msg: { fontFamily: fonts.body, fontSize: s(15), color: t.text.secondary, textAlign: 'center', marginTop: s(24) },
}));
