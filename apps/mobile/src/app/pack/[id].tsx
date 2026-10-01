import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../ui/Screen';
import { Stars } from '../../ui/Stars';
import { MiniBoard } from '../../ui/MiniBoard';
import { useLayout } from '../../ui/layout';
import { fonts } from '../../theme/tokens';
import { musicFor } from '../../theme/packs';
import { makeStyles, usePalette, useTheme } from '../../theme/useTheme';
import { withAlpha } from '../../board/color';
import { getLevel, getPack, globalNumber, maxStars } from '../../data/levels';
import { isLevelUnlocked, isPackUnlocked, packStars, useProgress } from '../../store/progress';
import { useSettings } from '../../store/settings';
import { audio } from '../../services/audio';

export default function PackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pack = getPack(Number(id));
  const levels = useProgress((s) => s.levels);
  const inProgress = useProgress((s) => s.inProgress);
  useSettings((s) => s.unlockAll);
  const layout = useLayout();
  const theme = useTheme();
  const palette = usePalette();
  const styles = useStyles();
  const accent = theme.accent.color;

  useFocusEffect(
    React.useCallback(() => {
      if (!pack) return;
      audio.playMusic(musicFor(pack.theme));
    }, [pack]),
  );

  if (!pack || !isPackUnlocked(levels, pack.id)) {
    return (
      <Screen title="Locked" back>
        <Text style={styles.empty}>This pack is still locked.</Text>
      </Screen>
    );
  }

  const cols = layout.tablet ? 5 : 4;
  const contentW = layout.contentWidth('wide');
  const tile = Math.floor((contentW - (cols - 1) * 12) / cols);

  return (
    <Screen title={pack.name} subtitle={`${packStars(levels, pack.id)} / ${maxStars(pack.id)} ★`} back scroll width="wide" contentStyle={styles.grid}>
      {pack.levels.map((lid) => {
        const level = getLevel(lid);
        if (!level) return null;
        const rec = levels[lid];
        const unlocked = isLevelUnlocked(levels, lid);
        const current = unlocked && !rec;
        return (
          <Pressable
            key={lid}
            disabled={!unlocked}
            onPress={() => router.push(`/play/${lid}`)}
            accessibilityLabel={`Level ${globalNumber(lid)}${rec ? `, ${rec.stars} stars` : unlocked ? '' : ', locked'}`}
            style={({ pressed }) => [
              styles.tile,
              {
                width: tile,
                height: tile + 26,
                borderColor: current ? accent : theme.box.border,
                backgroundColor: current ? withAlpha(accent, 0.14) : theme.box.background,
                transform: [{ scale: pressed ? 0.95 : 1 }],
                opacity: unlocked ? 1 : 0.55,
              },
            ]}
          >
            {rec ? (
              <MiniBoard level={level} size={tile - 26} palette={palette} />
            ) : unlocked ? (
              <View style={styles.center}>
                <Text style={[styles.num, { color: theme.text.primary }]}>{globalNumber(lid)}</Text>
                <Text style={styles.size}>
                  {level.size.width}×{level.size.height}
                </Text>
                {inProgress[lid] && <View style={[styles.dot, { backgroundColor: accent }]} />}
              </View>
            ) : (
              <Ionicons name="lock-closed" size={22} color={theme.icon.locked} />
            )}
            <View style={styles.footer}>
              {rec ? <Stars count={rec.stars} size={12} /> : <Text style={styles.footerText}>{unlocked ? '' : globalNumber(lid)}</Text>}
            </View>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { borderRadius: 18, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingTop: 10 },
  center: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  num: { fontFamily: fonts.titleBold, fontSize: 28 },
  size: { fontFamily: fonts.body, fontSize: 12, color: t.text.secondary },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  footer: { height: 24, justifyContent: 'center' },
  footerText: { fontFamily: fonts.body, fontSize: 12, color: t.text.muted },
  empty: { fontFamily: fonts.body, color: t.text.secondary, textAlign: 'center', marginTop: 40 },
}));
