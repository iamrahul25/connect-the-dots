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
import { mix } from '../../board/color';
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

  const { s } = layout;
  const cols = layout.tablet ? 5 : 4;
  const gap = s(12);
  const footerH = s(26);
  const contentW = layout.contentWidth('wide');
  const tile = Math.floor((contentW - (cols - 1) * gap) / cols);
  const numSize = Math.round(Math.min(s(48), Math.max(s(24), tile * 0.32)));
  const detailSize = Math.round(Math.min(s(18), Math.max(s(12), tile * 0.115)));

  return (
    <Screen title={pack.name} subtitle={`${packStars(levels, pack.id)} / ${maxStars(pack.id)} ★`} back scroll width="wide" contentStyle={[styles.grid, { gap }]}>
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
                height: tile + footerH,
                borderColor: current ? accent : theme.box.border,
                backgroundColor: current
                  ? mix(theme.box.background, accent, 0.14)
                  : unlocked
                    ? theme.box.background
                    : mix(theme.background.color, theme.box.background, 0.55),
                transform: [{ scale: pressed ? 0.95 : 1 }],
              },
            ]}
          >
            {rec ? (
              <MiniBoard level={level} size={tile - footerH} palette={palette} />
            ) : unlocked ? (
              <View style={styles.center}>
                <Text style={[styles.num, { color: theme.text.primary, fontSize: numSize }]}>{globalNumber(lid)}</Text>
                <Text style={[styles.size, { fontSize: detailSize }]}>
                  {level.size.width}×{level.size.height}
                </Text>
                {inProgress[lid] && <View style={[styles.dot, { backgroundColor: accent }]} />}
              </View>
            ) : (
              <Ionicons name="lock-closed" size={s(22)} color={theme.icon.locked} />
            )}
            <View style={styles.footer}>
              {rec ? <Stars count={rec.stars} size={s(12)} /> : <Text style={[styles.footerText, { fontSize: detailSize }]}>{unlocked ? '' : globalNumber(lid)}</Text>}
            </View>
          </Pressable>
        );
      })}
    </Screen>
  );
}

const useStyles = makeStyles((t, s) => ({
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  tile: { borderRadius: s(18), borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', paddingTop: s(10) },
  center: { alignItems: 'center', justifyContent: 'center', flex: 1 },
  num: { fontFamily: fonts.titleBold },
  size: { fontFamily: fonts.body, color: t.text.secondary, marginTop: 2 },
  dot: { width: s(8), height: s(8), borderRadius: s(4), marginTop: s(6) },
  footer: { height: s(24), justifyContent: 'center' },
  footerText: { fontFamily: fonts.body, color: t.text.muted },
  empty: { fontFamily: fonts.body, fontSize: s(15), color: t.text.secondary, textAlign: 'center', marginTop: s(40) },
}));
