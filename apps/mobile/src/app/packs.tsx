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

const DETAILS: Record<number, { grid: string; feature?: string }> = {
  1: { grid: '5×5 – 6×6' },
  2: { grid: '7×7 – 8×8', feature: 'Walls' },
  3: { grid: '8×8 – 9×9', feature: 'Bridges' },
  4: { grid: '9×9 – 10×10', feature: 'Warps' },
  5: { grid: '11×11 – 12×12', feature: 'Everything' },
};

const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)));

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
  const pad = clamp(cardW * 0.075, 20, 30);
  const medallion = clamp(Math.min(cardW * 0.46, cardH * 0.32), 104, 180);
  const nameSize = clamp(cardW * 0.115, 30, 46);
  const gridSize = clamp(cardW * 0.048, 14, 18);
  const metaSize = clamp(cardW * 0.043, 13, 16);

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
                        color={unlocked ? accent : theme.icon.locked}
                      />
                    </View>
                    {!unlocked && (
                      <View style={[styles.lockBadge, { borderColor: theme.box.background }]}>
                        <Ionicons name="lock-closed" size={16} color={theme.icon.locked} />
                      </View>
                    )}
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
                  {unlocked ? (
                    <>
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
                    </>
                  ) : (
                    <View style={styles.locked}>
                      <Text style={[styles.meta, styles.lockedText, { fontSize: metaSize }]} numberOfLines={2}>
                        {Math.max(0, (PACK_STAR_REQUIREMENTS[p.id] ?? 0) - stars)} more ★ or finish Pack {p.id - 1}
                      </Text>
                    </View>
                  )}
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

const useStyles = makeStyles((t) => ({
  card: {
    borderRadius: 30,
    alignItems: 'center',
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: t.box.background,
  },
  packNo: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 999 },
  packNoText: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 2.5, color: t.text.primary },
  hero: { flex: 1, alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', paddingVertical: 12 },
  halo: { position: 'absolute', opacity: 0.08 },
  medallion: { alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  lockBadge: {
    position: 'absolute',
    right: 4,
    bottom: 4,
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.box.pill,
  },
  info: { alignSelf: 'stretch', alignItems: 'center', gap: 8 },
  packName: { fontFamily: fonts.titleBold, color: t.text.primary, textAlign: 'center' },
  detailRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', gap: 8 },
  grid: { fontFamily: fonts.body, color: t.text.secondary },
  chip: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999 },
  chipText: { fontFamily: fonts.bodyBold, color: t.text.primary },
  footer: { alignSelf: 'stretch', marginTop: 22, gap: 10 },
  progressTrack: { height: 8, borderRadius: 4, backgroundColor: t.progress.track, overflow: 'hidden' },
  progressFill: { height: 8, borderRadius: 4 },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  starStat: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  meta: { fontFamily: fonts.body, color: t.text.secondary },
  locked: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: t.box.pill },
  lockedText: { textAlign: 'center' },
  hint: { fontFamily: fonts.body, fontSize: 13, color: t.text.muted, textAlign: 'center', marginTop: 18 },
}));
