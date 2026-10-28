import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
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
import { obstacleName } from '../game/ObstacleInfo';
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

/** Packs whose icon describes their content rather than their theme. */
const PACK_ID_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  none: 'ban-outline',
  handcrafted: 'brush',
};

/** Remembered while the app runs, so coming back to this screen reopens the same tab. */
let lastSuite: SuiteId = 'single';
const rememberSuite = (id: SuiteId) => {
  lastSuite = id;
};

export default function Packs() {
  const levels = useProgress((s) => s.levels);
  const styles = useStyles();
  const theme = useTheme();
  const layout = useLayout();
  const insets = useSafeAreaInsets();
  const [suiteId, setSuiteId] = useState<SuiteId>(() => lastSuite);
  const suite = manifest.suites.find((s) => s.id === suiteId) ?? manifest.suites[0];
  const cardW = Math.min(layout.contentWidth('narrow'), layout.width - insets.left - insets.right - layout.gutter * 2);
  const ready = suite.packs.filter((p) => p.levels.length > 0).length;
  const mix = suite.id === 'multi';

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
    <Screen title="Level Packs" subtitle={`${totalStars(levels)} ★ collected`} back scroll width="narrow">
      <View style={styles.tabs}>
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

      <View key={suite.id} style={styles.list}>
        {suite.packs.length === 0 ? (
          <PackCard width={cardW} label={suite.name.toUpperCase()} name={`${suite.name} packs`} icon="construct" theme="eclipse" />
        ) : (
          suite.packs.map((p, i) => (
            <PackCard
              key={p.id}
              pack={p}
              width={cardW}
              label={`PACK ${i + 1}`}
              name={p.name}
              theme={p.theme}
              icon={PACK_ID_ICONS[p.id]}
              mix={mix}
              solved={packSolved(levels, p.id)}
              stars={packStars(levels, p.id)}
            />
          ))
        )}
      </View>
      <Text style={styles.hint}>
        {suite.packs.length === 0
          ? 'Hand-designed packs are on the way'
          : `${ready} ${ready === 1 ? 'pack' : 'packs'}${ready < suite.packs.length ? ` · ${suite.packs.length - ready} coming soon` : ''}`}
      </Text>
    </Screen>
  );
}

/**
 * A compact pack row. Mixed packs list their obstacles as labeled chips instead of a title;
 * without a pack (or with an empty one) it is a locked "coming soon" card.
 */
function PackCard({
  pack,
  width,
  label,
  name,
  theme: packTheme,
  icon,
  mix = false,
  solved = 0,
  stars = 0,
}: {
  pack?: Pack;
  width: number;
  label: string;
  name: string;
  theme: string;
  icon?: keyof typeof Ionicons.glyphMap;
  mix?: boolean;
  solved?: number;
  stars?: number;
}) {
  const theme = useTheme();
  const styles = useStyles();
  const { s } = useLayout();
  const accent = packCardAccent(theme, packTheme);
  const soon = !pack || pack.levels.length === 0;
  const total = pack?.levels.length ?? 0;
  const obstacles = pack?.obstacles ?? [];
  const tile = s(56);

  return (
    <Pressable
      disabled={soon}
      onPress={() => pack && router.push(`/pack/${pack.id}`)}
      accessibilityLabel={soon ? `${name}, coming soon` : `${name}, ${solved} of ${total} solved`}
      style={({ pressed }) => [{ width, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <View style={[styles.card, { borderLeftColor: soon ? withAlpha(accent, 0.35) : accent }]}>
        <View style={styles.topRow}>
          <Text style={styles.packNo} numberOfLines={1}>
            {label}
          </Text>
          {soon ? (
            <Ionicons name="lock-closed" size={s(14)} color={theme.icon.locked} />
          ) : (
            <View style={styles.starStat}>
              <Stars count={1} max={1} size={s(13)} />
              <Text style={styles.meta}>
                {stars}/{maxStars(pack!.id)}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.main}>
          <View
            style={[
              styles.tile,
              { width: tile, height: tile, backgroundColor: theme.statusBar === 'light' ? theme.box.background : '#FFFFFF', borderColor: accent },
              soon && { opacity: 0.45 },
            ]}
          >
            {obstacles.length === 1 ? (
              <ObstacleGlyph kind={GLYPHS[obstacles[0]]} size={Math.round(tile * 0.6)} flat />
            ) : (
              <Ionicons
                name={icon ?? (PACK_ICONS[packTheme] as keyof typeof Ionicons.glyphMap)}
                size={Math.round(tile * 0.48)}
                color={accent}
              />
            )}
          </View>

          <View style={styles.body}>
            {!mix && (
              <Text style={styles.packName} numberOfLines={1} adjustsFontSizeToFit>
                {name}
              </Text>
            )}

            {obstacles.length > 1 && (
              <View style={styles.chips}>
                {obstacles.map((o) => (
                  <View key={o} style={[styles.chip, { backgroundColor: withAlpha(accent, 0.14) }]}>
                    <ObstacleGlyph kind={GLYPHS[o]} size={s(16)} flat />
                    <Text style={styles.chipText} numberOfLines={1}>
                      {obstacleName(o)}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.meta} numberOfLines={1}>
              {soon ? 'Coming soon' : `${packGridRange(pack!)} · ${total} ${total === 1 ? 'level' : 'levels'}`}
            </Text>

            {!soon && (
              <View style={styles.progressRow}>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${(solved / total) * 100}%`, backgroundColor: accent }]} />
                </View>
                <Text style={styles.meta}>
                  {solved}/{total}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const useStyles = makeStyles((t, s) => ({
  tabs: {
    flexDirection: 'row',
    alignSelf: 'stretch',
    padding: s(4),
    borderRadius: tokens.radius.pill,
    backgroundColor: t.box.background,
    borderWidth: 1,
    borderColor: t.box.border,
  },
  tab: { flex: 1, height: s(40), borderRadius: tokens.radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: s(8) },
  tabText: { fontFamily: fonts.bodyBold, fontSize: s(14) },
  blurb: { fontFamily: fonts.body, fontSize: s(13), color: t.text.secondary, textAlign: 'center', marginTop: s(10), marginBottom: s(14) },
  list: { gap: s(12) },
  card: {
    flexGrow: 1,
    gap: s(10),
    padding: s(14),
    borderRadius: s(10),
    borderWidth: 1,
    borderLeftWidth: 5,
    borderColor: t.box.border,
    backgroundColor: t.box.background,
    overflow: 'hidden',
  },
  main: { flexGrow: 1, flexDirection: 'row', gap: s(14) },
  tile: { alignSelf: 'center', borderRadius: s(12), borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: s(6) },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: s(8) },
  packNo: { flexShrink: 1, fontFamily: fonts.bodyBold, fontSize: s(11), letterSpacing: 1.5, color: t.text.secondary },
  packName: { fontFamily: fonts.titleBold, fontSize: s(20), lineHeight: s(24), color: t.text.primary },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: s(6) },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    paddingLeft: s(4),
    paddingRight: s(10),
    paddingVertical: s(4),
    borderRadius: tokens.radius.pill,
  },
  chipText: { fontFamily: fonts.bodyBold, fontSize: s(13), color: t.text.primary },
  starStat: { flexDirection: 'row', alignItems: 'center', gap: s(4) },
  meta: { fontFamily: fonts.body, fontSize: s(13), color: t.text.secondary },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: s(10), marginTop: 'auto', paddingTop: s(2) },
  progressTrack: { flex: 1, height: s(6), borderRadius: s(3), backgroundColor: t.progress.track, overflow: 'hidden' },
  progressFill: { height: s(6), borderRadius: s(3) },
  hint: { fontFamily: fonts.body, fontSize: s(13), color: t.text.muted, textAlign: 'center', marginTop: s(18) },
}));
