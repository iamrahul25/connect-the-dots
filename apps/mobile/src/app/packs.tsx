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
import { manifest, maxStars } from '../data/levels';
import { packSolved, packStars, totalStars, useProgress } from '../store/progress';
import { audio } from '../services/audio';

const DETAILS: Record<number, { grid: string; feature?: string }> = {
  1: { grid: '5×5 – 8×8' },
  2: { grid: '7×7 – 10×10', feature: 'Walls' },
  3: { grid: '8×8 – 11×11', feature: 'Bridges' },
  4: { grid: '9×9 – 12×12', feature: 'Warps' },
  5: { grid: '11×11 – 12×14', feature: 'All 3 obstacles' },
  6: { grid: '8×8 – 11×11', feature: 'Teleporters' },
  7: { grid: '9×9 – 12×12', feature: 'Tunnels' },
  8: { grid: '10×10 – 12×13', feature: 'Rotators' },
  9: { grid: '10×10 – 12×13', feature: 'Keys & Doors' },
  10: { grid: '11×11 – 12×14', feature: 'All 7 obstacles' },
};

const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)));

export default function Packs() {
  const levels = useProgress((s) => s.levels);
  const theme = useTheme();
  const styles = useStyles();
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const { s } = layout;
  const stripW = layout.width - insets.left - insets.right;
  const cardW = Math.min(s(320), stripW - 72);
  const room = layout.height - insets.top - insets.bottom - layout.landscapeClearance - s(150);
  const cardH = Math.max(s(320), Math.min(room, s(440)));
  const stars = totalStars(levels);
  const pad = clamp(cardW * 0.075, s(18), s(30));
  const medallion = clamp(Math.min(cardW * 0.46, cardH * 0.32), s(96), s(180));
  const nameSize = clamp(cardW * 0.115, s(28), s(46));
  const gridSize = clamp(cardW * 0.048, s(13), s(18));
  const metaSize = clamp(cardW * 0.043, s(12), s(16));

  useFocusEffect(
    React.useCallback(() => {
      audio.playMusic('dawn');
    }, []),
  );

  return (
    <Screen title="Level Packs" subtitle={`${stars} ★ collected`} back scroll center width="full">
      <ScrollView
        horizontal
        snapToInterval={cardW + s(16)}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: (stripW - cardW) / 2, gap: s(16), alignItems: 'center' }}
        style={{ flexGrow: 0, marginHorizontal: -layout.gutter }}
      >
        {manifest.packs.map((p) => {
          const accent = packCardAccent(theme, p.theme);
          const solved = packSolved(levels, p.id);
          const pStars = packStars(levels, p.id);
          return (
            <Pressable
              key={p.id}
              onPress={() => router.push(`/pack/${p.id}`)}
              style={({ pressed }) => [{ width: cardW, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
            >
              <View style={[styles.card, { height: cardH, padding: pad, borderColor: withAlpha(accent, 0.45) }]}>
                <View style={[styles.packNo, { backgroundColor: withAlpha(accent, 0.16) }]}>
                  <Text style={styles.packNoText}>PACK {p.id}</Text>
                </View>

                <View style={styles.hero}>
                  <View style={{ width: medallion, height: medallion, alignItems: 'center', justifyContent: 'center' }}>
                    <View
                      style={[
                        styles.halo,
                        { width: medallion * 1.32, height: medallion * 1.32, borderRadius: medallion * 0.66, backgroundColor: accent },
                      ]}
                    />
                    <View
                      style={[
                        styles.medallion,
                        {
                          width: medallion,
                          height: medallion,
                          borderRadius: medallion / 2,
                          backgroundColor: withAlpha(accent, 0.14),
                          borderColor: withAlpha(accent, 0.35),
                        },
                      ]}
                    >
                      <Ionicons
                        name={PACK_ICONS[p.theme] as keyof typeof Ionicons.glyphMap}
                        size={Math.round(medallion * 0.5)}
                        color={accent}
                      />
                    </View>
                  </View>
                </View>

                <View style={styles.info}>
                  <Text style={[styles.packName, { fontSize: nameSize, lineHeight: Math.round(nameSize * 1.15) }]} numberOfLines={1} adjustsFontSizeToFit>
                    {p.name}
                  </Text>
                  <View style={styles.detailRow}>
                    <Text style={[styles.grid, { fontSize: gridSize }]}>{DETAILS[p.id]?.grid}</Text>
                    {DETAILS[p.id]?.feature && (
                      <View style={[styles.chip, { backgroundColor: withAlpha(accent, 0.16) }]}>
                        <Text style={[styles.chipText, { fontSize: metaSize - 1 }]}>{DETAILS[p.id]?.feature}</Text>
                      </View>
                    )}
                  </View>
                </View>

                <View style={styles.footer}>
                  <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${(solved / p.levels.length) * 100}%`, backgroundColor: accent }]} />
                  </View>
                  <View style={styles.statsRow}>
                    <Text style={[styles.meta, { fontSize: metaSize }]}>
                      {solved}/{p.levels.length} solved
                    </Text>
                    <View style={styles.starStat}>
                      <Stars count={1} max={1} size={metaSize + 1} />
                      <Text style={[styles.meta, { fontSize: metaSize }]}>
                        {pStars}/{maxStars(p.id)}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <Text style={styles.hint}>Swipe to browse · more packs coming soon</Text>
    </Screen>
  );
}

const useStyles = makeStyles((t, s) => ({
  card: {
    borderRadius: s(30),
    alignItems: 'center',
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: t.box.background,
  },
  packNo: { paddingHorizontal: s(12), paddingVertical: s(5), borderRadius: 999 },
  packNoText: { fontFamily: fonts.bodyBold, fontSize: s(12), letterSpacing: 2.5, color: t.text.primary },
  hero: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingVertical: s(12) },
  halo: { position: 'absolute', opacity: 0.08 },
  medallion: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  info: { alignSelf: 'stretch', alignItems: 'center', gap: s(8) },
  packName: { fontFamily: fonts.titleBold, color: t.text.primary, textAlign: 'center' },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: s(8) },
  grid: { fontFamily: fonts.body, color: t.text.secondary },
  chip: { paddingHorizontal: s(10), paddingVertical: s(3), borderRadius: 999 },
  chipText: { fontFamily: fonts.bodyBold, color: t.text.primary },
  footer: { alignSelf: 'stretch', marginTop: s(22), gap: s(10) },
  progressTrack: { height: s(8), borderRadius: s(4), backgroundColor: t.progress.track, overflow: 'hidden' },
  progressFill: { height: s(8), borderRadius: s(4) },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  starStat: { flexDirection: 'row', alignItems: 'center', gap: s(4) },
  meta: { fontFamily: fonts.body, color: t.text.secondary },
  hint: { fontFamily: fonts.body, fontSize: s(13), color: t.text.muted, textAlign: 'center', marginTop: s(18) },
}));
