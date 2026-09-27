import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { parseDateKey, WEEKDAY_NAMES, type Level } from '@ctd/core';
import { GameScreen, goBackOr } from '../../game/GameScreen';
import { Screen } from '../../ui/Screen';
import { colors, fonts } from '../../theme/tokens';
import { dailyFromBank, generateDaily, getLevel, globalNumber, nextLevelId, packOfLevel } from '../../data/levels';
import { isLevelUnlocked, useProgress } from '../../store/progress';

const DAILY_PREFIX = 'daily-';

export default function PlayRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (id?.startsWith(DAILY_PREFIX)) return <DailyPlay dateKey={id.slice(DAILY_PREFIX.length)} />;
  return <PackPlay id={id ?? ''} />;
}

function PackPlay({ id }: { id: string }) {
  const level = getLevel(id);
  const pack = packOfLevel(id);
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
      themeId={pack.theme}
      nextLabel={nextLabel}
      onNext={() => {
        if (next && isLevelUnlocked(useProgress.getState().levels, next)) router.replace(`/play/${next}`);
        else router.replace(`/pack/${pack.id}`);
      }}
      onLevels={() => goBackOr(`/pack/${pack.id}`)}
    />
  );
}

function DailyPlay({ dateKey }: { dateKey: string }) {
  const [level, setLevel] = useState<Level | null | undefined>(() => dailyFromBank(dateKey));

  useEffect(() => {
    if (level !== undefined) return;
    // Yield a frame so the spinner renders before the synchronous generator runs.
    const t = setTimeout(() => setLevel(generateDaily(dateKey)), 60);
    return () => clearTimeout(t);
  }, [dateKey, level]);

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return (
      <Screen title="Daily" back>
        <Text style={styles.msg}>Invalid date.</Text>
      </Screen>
    );
  }
  if (level === undefined) {
    return (
      <Screen title="Daily" back>
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} size="large" />
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
      key={dateKey}
      level={level}
      mode="daily"
      dailyKey={dateKey}
      title="Daily Puzzle"
      subtitle={`${WEEKDAY_NAMES[d.getDay()]} · ${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`}
      themeId="daily"
      nextLabel="Calendar"
      onNext={() => router.replace('/daily')}
      onLevels={() => goBackOr('/daily')}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16 },
  msg: { fontFamily: fonts.body, fontSize: 15, color: colors.textDim, textAlign: 'center', marginTop: 24 },
});
