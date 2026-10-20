import React, { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Obstacle, SuiteId } from '@ctd/core';
import { Screen } from '../ui/Screen';
import { useLayout } from '../ui/layout';
import { Stars } from '../ui/Stars';
import { fonts, tokens } from '../theme/tokens';
import { PACK_ICONS } from '../theme/packs';
import { packCardAccent } from '../theme/config';
import { makeStyles, useTheme } from '../theme/useTheme';
import { withAlpha } from '../board/color';
import { ObstacleGlyph, type GlyphKind } from '../custom/ObstacleGlyph';
import { manifest, maxStars, packGridRange, type Pack } from '../data/levels';
import { packSolved, packStars, totalStars, useProgress } from '../store/progress';
import { audio } from '../services/audio';

const TAB_LABELS: Record<SuiteId, string> = { single: 'Single', multi: 'Multiple', handcrafted: 'Handcrafted' };
const SUITE_BLURBS: Record<SuiteId, string> = {
  single: 'One obstacle type per pack',
  multi: 'Obstacles mixed together',
  handcrafted: 'Puzzles designed by hand',
};

const GLYPHS: Record<Obstacle, GlyphKind> = {
  walls: 'wall',
  bridges: 'bridge',
  warps: 'warp',
  teleporters: 'teleporter',
  tunnels: 'tunnel',
  rotators: 'rotator',
  locks: 'lock',
};

/** Remembered while the app runs, so coming back to this screen reopens the same tab. */
let lastSuite: SuiteId = 'single';
const rememberSuite = (id: SuiteId) => {
  lastSuite = id;
};

const clamp = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)));

export default function Packs() {
  const levels = useProgress((s) => s.levels);
  const styles = useStyles();
  const theme = useTheme();
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const [suiteId, setSuiteId] = useState<SuiteId>(() => lastSuite);
  const suite = manifest.suites.find((s) => s.id === suiteId) ?? manifest.suites[0];
  const { s } = layout;
  const stripW = layout.width - insets.left - insets.right;
  const cardW = Math.min(s(320), stripW - 72);
  const room = layout.height - insets.top - insets.bottom - layout.landscapeClearance - s(230);
  const cardH = Math.max(s(320), Math.min(room, s(440)));
  const ready = suite.packs.filter((p) => p.levels.length > 0).length;

  useFocusEffect(
    React.useCallback(() => {
      audio.playMusic('dawn');
    }, []),
  );

  const selectSuite = (id: SuiteId) => {
    rememberSuite(id);
    setSuiteId(id);
  };

  return (
    <Screen title="Level Packs" subtitle={`${totalStars(levels)} ★ collected`} back scroll center width="full">
      <View style={[styles.tabs, { width: Math.min(stripW - layout.gutter * 2, s(440)) }]}>
        {manifest.suites.map((st) => (
          <Pressable
            key={st.id}
            onPress={() => selectSuite(st.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: st.id === suite.id }}
            accessibilityLabel={st.name}
            style={[styles.tab, st.id === suite.id && { backgroundColor: theme.accent.color }]}
          >
            <Text
              style={[styles.tabText, { color: st.id === suite.id ? theme.accent.onColor : theme.text.secondary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {TAB_LABELS[st.id]}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.blurb}>
        {suite.name} · {SUITE_BLURBS[suite.id]}
      </Text>

      <ScrollView
        key={suite.id}
        horizontal
        snapToInterval={cardW + s(16)}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: (stripW - cardW) / 2, gap: s(16), alignItems: 'center' }}
        style={{ flexGrow: 0, marginHorizontal: -layout.gutter }}
      >
        {suite.packs.length === 0 ? (
          <PackCard width={cardW} height={cardH} label={suite.name.toUpperCase()} name={`${suite.name} packs`} icon="construct" theme="eclipse" />
        ) : (
          suite.packs.map((p, i) => (
            <PackCard
              key={p.id}
              pack={p}
              width={cardW}
              height={cardH}
              label={`PACK ${i + 1}`}
              name={p.name}
              theme={p.theme}
              solved={packSolved(levels, p.id)}
              stars={packStars(levels, p.id)}
            />
          ))
        )}
      </ScrollView>
      <Text style={styles.hint}>
        {suite.packs.length === 0
          ? 'Hand-designed packs are on the way'
          : `Swipe to browse · ${ready} ${ready === 1 ? 'pack' : 'packs'}${ready < suite.packs.length ? ` · ${suite.packs.length - ready} coming soon` : ''}`}
      </Text>
    </Screen>
  );
}

/** A pack card; without a pack (or with an empty one) it is a locked "coming soon" card. */
function PackCard({
  pack,
  width,
  height,
  label,
  name,
  theme: packTheme,
  icon,
  solved = 0,
  stars = 0,
}: {
  pack?: Pack;
  width: number;
  height: number;
  label: string;
  name: string;
  theme: string;
  icon?: keyof typeof Ionicons.glyphMap;
  solved?: number;
  stars?: number;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const { s } = useLayout();
  const accent = packCardAccent(theme, packTheme);
  const soon = !pack || pack.levels.length === 0;
  const pad = clamp(width * 0.075, s(18), s(30));
  const medallion = clamp(Math.min(width * 0.46, height * 0.32), s(96), s(180));
  const nameSize = clamp(width * (name.length > 24 ? 0.08 : 0.115), s(22), s(46));
  const gridSize = clamp(width * 0.048, s(13), s(18));
  const metaSize = clamp(width * 0.043, s(12), s(16));
  const total = pack?.levels.length ?? 0;

  return (
    <Pressable
      disabled={soon}
      onPress={() => pack && router.push(`/pack/${pack.id}`)}
      accessibilityLabel={soon ? `${name}, coming soon` : `${name}, ${solved} of ${total} solved`}
      style={({ pressed }) => [{ width, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      <View style={[styles.card, { height, padding: pad, borderColor: withAlpha(accent, soon ? 0.2 : 0.45) }]}>
        <View style={[styles.packNo, { backgroundColor: withAlpha(accent, 0.16) }]}>
          <Text style={styles.packNoText}>{label}</Text>
        </View>

        <View style={[styles.hero, soon && { opacity: 0.45 }]}>
          <View style={{ width: medallion, height: medallion, alignItems: 'center', justifyContent: 'center' }}>
            <View
              style={[styles.halo, { width: medallion * 1.32, height: medallion * 1.32, borderRadius: medallion * 0.66, backgroundColor: accent }]}
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
              {pack && pack.obstacles.length > 0 ? (
                <GlyphCluster obstacles={pack.obstacles} size={medallion} />
              ) : (
                <Ionicons
                  name={icon ?? (PACK_ICONS[packTheme] as keyof typeof Ionicons.glyphMap)}
                  size={Math.round(medallion * 0.5)}
                  color={accent}
                />
              )}
            </View>
          </View>
        </View>

        <View style={styles.info}>
          <Text
            style={[styles.packName, { fontSize: nameSize, lineHeight: Math.round(nameSize * 1.15) }]}
            numberOfLines={2}
            adjustsFontSizeToFit
          >
            {name}
          </Text>
          {!soon && (
            <View style={styles.detailRow}>
              <Text style={[styles.grid, { fontSize: gridSize }]}>{packGridRange(pack!)}</Text>
              <View style={[styles.chip, { backgroundColor: withAlpha(accent, 0.16) }]}>
                <Text style={[styles.chipText, { fontSize: metaSize - 1 }]}>
                  {total} {total === 1 ? 'level' : 'levels'}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.footer}>
          {soon ? (
            <View style={styles.soonRow}>
              <Ionicons name="lock-closed" size={metaSize + 1} color={theme.icon.locked} />
              <Text style={[styles.meta, { fontSize: metaSize }]}>Coming soon</Text>
            </View>
          ) : (
            <>
              <View style={styles.progressTrack}>
                <View style={[styles.progressFill, { width: `${(solved / total) * 100}%`, backgroundColor: accent }]} />
              </View>
              <View style={styles.statsRow}>
                <Text style={[styles.meta, { fontSize: metaSize }]}>
                  {solved}/{total} solved
                </Text>
                <View style={styles.starStat}>
                  <Stars count={1} max={1} size={metaSize + 1} />
                  <Text style={[styles.meta, { fontSize: metaSize }]}>
                    {stars}/{maxStars(pack!.id)}
                  </Text>
                </View>
              </View>
            </>
          )}
        </View>
      </View>
    </Pressable>
  );
}

/** The pack's obstacles drawn as board squares, packed into a grid that fits inside the round medallion. */
function GlyphCluster({ obstacles, size }: { obstacles: Obstacle[]; size: number }) {
  const n = obstacles.length;
  const cols = n === 1 ? 1 : n <= 4 ? 2 : 3;
  const gap = Math.round(size * 0.04);
  const box = size * (n === 1 ? 0.5 : 0.64);
  const glyph = Math.floor((box - gap * (cols - 1)) / cols);
  return (
    <View style={{ width: cols * glyph + (cols - 1) * gap, flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap }}>
      {obstacles.map((o) => (
        <ObstacleGlyph key={o} kind={GLYPHS[o]} size={glyph} flat />
      ))}
    </View>
  );
}

const useStyles = makeStyles((t, s) => ({
  tabs: {
    flexDirection: 'row',
    alignSelf: 'center',
    padding: s(4),
    borderRadius: tokens.radius.pill,
    backgroundColor: t.box.background,
    borderWidth: 1,
    borderColor: t.box.border,
  },
  tab: { flex: 1, height: s(40), borderRadius: tokens.radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: s(8) },
  tabText: { fontFamily: fonts.bodyBold, fontSize: s(14) },
  blurb: { fontFamily: fonts.body, fontSize: s(13), color: t.text.secondary, textAlign: 'center', marginTop: s(10), marginBottom: s(14) },
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
  soonRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: s(6), height: s(36) },
  progressTrack: { height: s(8), borderRadius: s(4), backgroundColor: t.progress.track, overflow: 'hidden' },
  progressFill: { height: s(8), borderRadius: s(4) },
  statsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  starStat: { flexDirection: 'row', alignItems: 'center', gap: s(4) },
  meta: { fontFamily: fonts.body, color: t.text.secondary },
  hint: { fontFamily: fonts.body, fontSize: s(13), color: t.text.muted, textAlign: 'center', marginTop: s(18) },
}));
