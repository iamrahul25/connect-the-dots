import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Screen } from '../ui/Screen';
import { useLayout } from '../ui/layout';
import { Stars } from '../ui/Stars';
import { fonts } from '../theme/tokens';
import { PACK_ICONS } from '../theme/packs';
import { packCardAccent } from '../theme/config';
import { makeStyles, useTheme } from '../theme/useTheme';
import { withAlpha } from '../board/color';
import { manifest, maxStars, PACK_STAR_REQUIREMENTS } from '../data/levels';
import { isPackUnlocked, packSolved, packStars, totalStars, useProgress } from '../store/progress';
import { useSettings } from '../store/settings';
import { audio } from '../services/audio';

const SIZES: Record<number, string> = { 1: '5×5 – 6×6', 2: '7×7 – 8×8 · walls', 3: '8×8 – 9×9 · bridges', 4: '9×9 – 10×10 · warps', 5: '11×11 – 12×12 · everything' };

export default function Packs() {
  const levels = useProgress((s) => s.levels);
  useSettings((s) => s.unlockAll);
  const theme = useTheme();
  const styles = useStyles();
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const stripW = layout.width - insets.left - insets.right;
  const cardW = layout.tablet ? 400 : Math.min(320, stripW - 72);
  const room = layout.height - insets.top - insets.bottom - layout.landscapeClearance - 150;
  const cardH = Math.max(340, Math.min(room, layout.tablet ? 540 : 440));
  const stars = totalStars(levels);

  useFocusEffect(
    React.useCallback(() => {
      audio.playMusic('dawn');
    }, []),
  );

  return (
    <Screen title="Level Packs" subtitle={`${stars} ★ collected`} back center width="full">
      <ScrollView
        horizontal
        snapToInterval={cardW + 16}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: (stripW - cardW) / 2, gap: 16, alignItems: 'center' }}
        style={{ flexGrow: 0, marginHorizontal: -layout.gutter }}
      >
        {manifest.packs.map((p) => {
          const accent = packCardAccent(theme, p.theme);
          const unlocked = isPackUnlocked(levels, p.id);
          const solved = packSolved(levels, p.id);
          const pStars = packStars(levels, p.id);
          return (
            <Pressable
              key={p.id}
              disabled={!unlocked}
              onPress={() => router.push(`/pack/${p.id}`)}
              style={({ pressed }) => [{ width: cardW, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
            >
              <View style={[styles.card, { height: cardH, borderColor: withAlpha(accent, 0.45) }]}>
                <View style={[styles.glow, { backgroundColor: accent }]} />
                <Text style={styles.packNo}>PACK {p.id}</Text>
                <Ionicons name={PACK_ICONS[p.theme] as keyof typeof Ionicons.glyphMap} size={layout.tablet ? 84 : 64} color={accent} style={{ marginVertical: 18 }} />
                <Text style={[styles.packName, layout.tablet && styles.packNameTablet]}>{p.name}</Text>
                <Text style={styles.packSizes}>{SIZES[p.id]}</Text>
                {unlocked ? (
                  <>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${(solved / p.levels.length) * 100}%`, backgroundColor: accent }]} />
                    </View>
                    <View style={styles.row}>
                      <Text style={styles.meta}>
                        {solved}/{p.levels.length} solved
                      </Text>
                      <View style={styles.row}>
                        <Stars count={1} max={1} />
                        <Text style={styles.meta}>
                          {' '}
                          {pStars}/{maxStars(p.id)}
                        </Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <View style={styles.locked}>
                    <Ionicons name="lock-closed" size={18} color={theme.icon.locked} />
                    <Text style={styles.meta}>
                      {Math.max(0, (PACK_STAR_REQUIREMENTS[p.id] ?? 0) - stars)} more ★ or finish Pack {p.id - 1}
                    </Text>
                  </View>
                )}
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.hint}>Swipe to browse · more packs coming soon</Text>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  card: {
    borderRadius: 30,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: t.box.background,
  },
  glow: { position: 'absolute', width: 220, height: 220, borderRadius: 110, opacity: 0.12, top: 40 },
  packNo: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 3, color: t.text.secondary },
  packName: { fontFamily: fonts.titleBold, fontSize: 36, color: t.text.primary },
  packNameTablet: { fontSize: 44 },
  packSizes: { fontFamily: fonts.body, fontSize: 14, color: t.text.secondary, marginTop: 4 },
  progressTrack: { alignSelf: 'stretch', height: 8, borderRadius: 4, backgroundColor: t.progress.track, marginTop: 28, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch', marginTop: 10 },
  meta: { fontFamily: fonts.body, fontSize: 13, color: t.text.secondary },
  locked: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 28, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: t.box.pill },
  hint: { fontFamily: fonts.body, fontSize: 13, color: t.text.muted, textAlign: 'center', marginTop: 18 },
}));
