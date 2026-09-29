import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../../ui/Screen';
import { Stars } from '../../ui/Stars';
import { MiniBoard } from '../../ui/MiniBoard';
import { colors, fonts } from '../../theme/tokens';
import { COLORBLIND_PALETTE, PALETTE, themeFor } from '../../theme/themes';
import { getLevel, getPack, globalNumber, maxStars } from '../../data/levels';
import { isLevelUnlocked, isPackUnlocked, packStars, useProgress } from '../../store/progress';
import { useSettings } from '../../store/settings';
import { useUi } from '../../store/ui';
import { audio } from '../../services/audio';

export default function PackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pack = getPack(Number(id));
  const levels = useProgress((s) => s.levels);
  const inProgress = useProgress((s) => s.inProgress);
  const colorblind = useSettings((s) => s.colorblind);
  useSettings((s) => s.unlockAll);
  const { width } = useWindowDimensions();
  const theme = themeFor(pack?.theme);

  useFocusEffect(
    React.useCallback(() => {
      if (!pack) return;
      useUi.getState().setTheme(pack.theme);
      audio.playMusic(theme.music);
    }, [pack, theme.music]),
  );

  if (!pack || !isPackUnlocked(levels, pack.id)) {
    return (
      <Screen title="Locked" back>
        <Text style={styles.empty}>This pack is still locked.</Text>
      </Screen>
    );
  }

  const cols = width > 700 ? 5 : 4;
  const contentW = Math.min(width - 32, 620);
  const tile = Math.floor((contentW - (cols - 1) * 12) / cols);
  const palette = colorblind ? COLORBLIND_PALETTE : PALETTE;

  return (
    <Screen title={pack.name} subtitle={`${packStars(levels, pack.id)} / ${maxStars(pack.id)} ★`} back>
      <ScrollView contentContainerStyle={[styles.grid, { width: contentW }]} showsVerticalScrollIndicator={false}>
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
                  borderColor: current ? theme.accent : colors.glassBorder,
                  backgroundColor: current ? `${theme.accent}22` : colors.glass,
                  transform: [{ scale: pressed ? 0.95 : 1 }],
                  opacity: unlocked ? 1 : 0.45,
                },
              ]}
            >
              {rec ? (
                <MiniBoard level={level} size={tile - 26} palette={palette} />
              ) : unlocked ? (
                <View style={styles.center}>
                  <Text style={[styles.num, { color: current ? theme.accent : colors.text }]}>{globalNumber(lid)}</Text>
                  <Text style={styles.size}>
                    {level.size.width}×{level.size.height}
                  </Text>
                  {inProgress[lid] && <View style={[styles.dot, { backgroundColor: theme.accent }]} />}
                </View>
              ) : (
                <Ionicons name="lock-closed" size={22} color={colors.textFaint} />
              )}
              <View style={styles.footer}>
                {rec ? <Stars count={rec.stars} size={12} /> : <Text style={styles.footerText}>{unlocked ? '' : globalNumber(lid)}</Text>}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignSelf: 'center', paddingBottom: 24 },
  tile: { borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 10 },
  center: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  num: { fontFamily: fonts.titleBold, fontSize: 28 },
  size: { fontFamily: fonts.body, fontSize: 12, color: colors.textDim },
  dot: { width: 6, height: 6, borderRadius: 3, marginTop: 4 },
  footer: { height: 24, justifyContent: 'center' },
  footerText: { fontFamily: fonts.body, fontSize: 12, color: colors.textFaint },
  empty: { fontFamily: fonts.body, color: colors.textDim, textAlign: 'center', marginTop: 40 },
});
