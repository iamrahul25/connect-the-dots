import React, { useCallback, useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../ui/Screen';
import { RankBadge } from '../ui/RankBadge';
import { useLayout } from '../ui/layout';
import { COMING_SOON_RANKS, RANKS, rankProgress, STARS_PER_RANK, type Rank } from '../data/ranks';
import { TIER_COLORS } from '../theme/ranks';
import { fonts, tokens } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/useTheme';
import { withAlpha } from '../board/color';
import { totalStars, useProgress } from '../store/progress';
import { useSettings } from '../store/settings';

type Row = { kind: 'soon'; key: string } | { kind: 'rank'; key: string; rank: Rank };

/** Highest first, like a ladder: coming-soon placeholders, then Legendary III down to Bronze I. */
const ROWS: Row[] = [
  ...Array.from({ length: COMING_SOON_RANKS }, (_, i): Row => ({ kind: 'soon', key: `soon-${i}` })),
  ...[...RANKS].reverse().map((rank): Row => ({ kind: 'rank', key: `rank-${rank.index}`, rank })),
];

export default function Ranks() {
  const styles = useStyles();
  const levels = useProgress((s) => s.levels);
  const stars = totalStars(levels);
  const progress = rankProgress(stars);
  const current = progress.rank;

  const scroll = useRef<ScrollView>(null);
  const viewH = useRef(0);
  const rowFrame = useRef<{ y: number; h: number } | null>(null);
  const scrolled = useRef(false);
  const scrollToCurrent = useCallback(() => {
    const row = rowFrame.current;
    if (scrolled.current || !row || !viewH.current) return;
    scrolled.current = true;
    scroll.current?.scrollTo({ y: Math.max(0, row.y + row.h / 2 - viewH.current / 2), animated: false });
  }, []);

  return (
    <Screen title="Rank Journey" subtitle={`${stars} ★ collected`} back contentStyle={styles.column}>
      <Hero stars={stars} />
      <ScrollView
        ref={scroll}
        style={styles.scroll}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onLayout={(e) => {
          viewH.current = e.nativeEvent.layout.height;
          scrollToCurrent();
        }}
      >
        {ROWS.map((row, i) =>
          row.kind === 'soon' ? (
            <ComingSoonRow key={row.key} first={i === 0} />
          ) : (
            <RankRow
              key={row.key}
              rank={row.rank}
              stars={stars}
              current={row.rank.index === current.index}
              last={i === ROWS.length - 1}
              onLayout={
                row.rank.index === current.index
                  ? (e: LayoutChangeEvent) => {
                      rowFrame.current = { y: e.nativeEvent.layout.y, h: e.nativeEvent.layout.height };
                      scrollToCurrent();
                    }
                  : undefined
              }
            />
          ),
        )}
        <Text style={styles.footnote}>
          Every {STARS_PER_RANK} stars earns a new rank.{'\n'}Solve levels in any pack to earn up to 3 stars each.
        </Text>
      </ScrollView>
    </Screen>
  );
}

/** The player's current rank, with progress toward the next one. */
function Hero({ stars }: { stars: number }) {
  const styles = useStyles();
  const theme = useTheme();
  const { s } = useLayout();
  const { rank, next, earned, remaining, fraction } = rankProgress(stars);
  const accent = TIER_COLORS[rank.tier].accent;
  const reduceMotion = useSettings((st) => st.reduceMotion);
  const still = useReducedMotion() || reduceMotion;

  const float = useSharedValue(0);
  useEffect(() => {
    if (still) {
      float.value = 0;
      return;
    }
    const ease = Easing.inOut(Easing.sin);
    float.value = withRepeat(withSequence(withTiming(1, { duration: 1600, easing: ease }), withTiming(0, { duration: 1600, easing: ease })), -1, false);
    return () => cancelAnimation(float);
  }, [still, float]);
  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: -4 * float.value }, { scale: 1 + 0.03 * float.value }] }));

  return (
    <View style={[styles.hero, { borderColor: withAlpha(accent, 0.5), backgroundColor: theme.box.surface }]}>
      <View style={[StyleSheet.absoluteFill, { backgroundColor: withAlpha(accent, 0.1) }]} />
      <View style={styles.heroBadgeWrap}>
        <View style={[styles.heroGlow, { backgroundColor: withAlpha(accent, 0.2) }]} />
        <Animated.View style={floatStyle}>
          <RankBadge rank={rank} size={s(92)} />
        </Animated.View>
      </View>
      <View style={styles.heroBody}>
        <Text style={styles.heroLabel}>Current rank</Text>
        <Text style={[styles.heroName, { color: accent }]} numberOfLines={1} adjustsFontSizeToFit>
          {rank.name}
        </Text>
        <View style={styles.heroTrack}>
          <View style={[styles.heroFill, { width: `${(next ? fraction : 1) * 100}%`, backgroundColor: accent }]} />
        </View>
        <View style={styles.heroMetaRow}>
          <Ionicons name="star" size={s(13)} color={theme.icon.star} />
          <Text style={styles.heroMeta} numberOfLines={1}>
            {next ? (
              <>
                {earned}/{STARS_PER_RANK} · <Text style={styles.heroMetaStrong}>{remaining}</Text> to {next.name}
              </>
            ) : (
              'Top rank reached! More ranks soon'
            )}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Left threshold, a node on the vertical track, and the rank's card. */
function RankRow({
  rank,
  stars,
  current,
  last,
  onLayout,
}: {
  rank: Rank;
  stars: number;
  current: boolean;
  last: boolean;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { s } = useLayout();
  const accent = TIER_COLORS[rank.tier].accent;
  const reached = stars >= rank.minStars;
  const above = RANKS[rank.index + 1];
  const lineOn = theme.star.filled;
  const lineOff = theme.progress.track;
  const { earned, remaining, fraction, next } = rankProgress(stars);

  let status: string;
  if (current) status = next ? `${remaining} ★ to rank up` : 'Top rank';
  else if (reached) status = 'Unlocked';
  else status = `${rank.minStars - stars} more ★`;

  return (
    <View style={styles.row} onLayout={onLayout}>
      <View style={styles.thresholdCol}>
        {current ? (
          <View style={[styles.thresholdPill, { backgroundColor: accent }]}>
            <Text style={[styles.threshold, { color: '#FFFFFF' }]}>{rank.minStars}</Text>
          </View>
        ) : (
          <Text style={[styles.threshold, !reached && { color: theme.text.muted }]}>{rank.minStars}</Text>
        )}
      </View>

      <View style={styles.lineCol}>
        <View style={[styles.lineTop, { backgroundColor: above && stars >= above.minStars ? lineOn : lineOff }]} />
        {!last && <View style={[styles.lineBottom, { backgroundColor: reached ? lineOn : lineOff }]} />}
        {current ? (
          <View style={[styles.nodeCurrent, { borderColor: accent, backgroundColor: theme.box.surface }]}>
            <View style={[styles.nodeCurrentDot, { backgroundColor: accent }]} />
          </View>
        ) : (
          <View style={[styles.node, { backgroundColor: reached ? lineOn : lineOff, borderColor: theme.box.surface }]} />
        )}
      </View>

      <View
        style={[
          styles.card,
          current && { borderColor: accent, borderWidth: 2, backgroundColor: withAlpha(accent, 0.14) },
          !reached && styles.cardLocked,
        ]}
      >
        <View style={[styles.tile, { backgroundColor: withAlpha(accent, reached ? 0.16 : 0.06) }]}>
          <RankBadge rank={rank} size={s(50)} muted={!reached} />
          {!reached && (
            <View style={[styles.lock, { backgroundColor: theme.box.surface }]}>
              <Ionicons name="lock-closed" size={s(10)} color={theme.icon.locked} />
            </View>
          )}
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.rankName, !reached && { color: theme.text.secondary }]} numberOfLines={1}>
            {rank.name}
          </Text>
          <Text style={[styles.status, current && { color: accent }]} numberOfLines={1}>
            {status}
          </Text>
          {current && next && (
            <View style={styles.rowTrack}>
              <View style={[styles.rowFill, { width: `${fraction * 100}%`, backgroundColor: accent }]} />
              <Text style={styles.rowTrackText}>
                {earned}/{STARS_PER_RANK}
              </Text>
            </View>
          )}
        </View>
        {reached && !current && <Ionicons name="checkmark-circle" size={s(22)} color={theme.icon.success} />}
      </View>
    </View>
  );
}

function ComingSoonRow({ first }: { first: boolean }) {
  const styles = useStyles();
  const theme = useTheme();
  const { s } = useLayout();
  return (
    <View style={styles.row}>
      <View style={styles.thresholdCol}>
        <Text style={[styles.threshold, { color: theme.text.muted }]}>???</Text>
      </View>
      <View style={styles.lineCol}>
        {!first && <View style={[styles.lineTop, styles.lineDashed, { borderColor: theme.progress.track }]} />}
        <View style={[styles.lineBottom, styles.lineDashed, { borderColor: theme.progress.track }]} />
        <View style={[styles.node, styles.nodeSoon, { borderColor: theme.text.muted, backgroundColor: theme.box.surface }]} />
      </View>
      <View style={[styles.card, styles.cardSoon, { borderColor: withAlpha(theme.text.muted, 0.6) }]}>
        <View style={[styles.tile, styles.tileSoon, { borderColor: withAlpha(theme.text.muted, 0.6) }]}>
          <Ionicons name="sparkles" size={s(24)} color={theme.text.muted} />
        </View>
        <View style={styles.cardBody}>
          <Text style={[styles.rankName, { color: theme.text.secondary }]}>Coming soon</Text>
          <Text style={styles.status}>New ranks on the way</Text>
        </View>
      </View>
    </View>
  );
}

const useStyles = makeStyles((t, s) => ({
  column: { flex: 1, alignSelf: 'center' },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(14),
    padding: s(14),
    paddingRight: s(18),
    borderRadius: s(24),
    borderWidth: 2,
    overflow: 'hidden',
    marginBottom: s(12),
  },
  heroBadgeWrap: { width: s(100), height: s(100), alignItems: 'center', justifyContent: 'center' },
  heroGlow: { position: 'absolute', width: s(96), height: s(96), borderRadius: s(48) },
  heroBody: { flex: 1, gap: s(4) },
  heroLabel: { fontFamily: fonts.bodyBold, fontSize: s(11), letterSpacing: 1.5, textTransform: 'uppercase', color: t.text.secondary },
  heroName: { fontFamily: fonts.titleBold, fontSize: s(28), lineHeight: s(32) },
  heroTrack: { height: s(10), borderRadius: s(5), backgroundColor: t.progress.track, overflow: 'hidden', marginTop: s(4) },
  heroFill: { height: s(10), borderRadius: s(5) },
  heroMetaRow: { flexDirection: 'row', alignItems: 'center', gap: s(4), marginTop: s(2) },
  heroMeta: { flexShrink: 1, fontFamily: fonts.body, fontSize: s(13), color: t.text.secondary },
  heroMetaStrong: { fontFamily: fonts.bodyBold, color: t.text.primary },

  scroll: { flex: 1 },
  list: { paddingTop: s(4), paddingBottom: s(16) },
  row: { flexDirection: 'row', alignItems: 'stretch' },
  thresholdCol: { width: s(52), alignItems: 'flex-end', justifyContent: 'center', paddingRight: s(4) },
  threshold: { fontFamily: fonts.title, fontSize: s(15), color: t.text.primary },
  thresholdPill: { paddingHorizontal: s(8), height: s(26), borderRadius: tokens.radius.pill, justifyContent: 'center', marginRight: -s(4) },
  lineCol: { width: s(32), alignItems: 'center', justifyContent: 'center' },
  lineTop: { position: 'absolute', top: 0, height: '50%', width: s(5), borderRadius: s(3) },
  lineBottom: { position: 'absolute', bottom: 0, height: '50%', width: s(5), borderRadius: s(3) },
  lineDashed: { width: 0, borderLeftWidth: s(3), borderStyle: 'dashed', backgroundColor: 'transparent' },
  node: { width: s(16), height: s(16), borderRadius: s(8), borderWidth: s(3) },
  nodeSoon: { borderWidth: 2, borderStyle: 'dashed' },
  nodeCurrent: { width: s(26), height: s(26), borderRadius: s(13), borderWidth: s(4), alignItems: 'center', justifyContent: 'center' },
  nodeCurrentDot: { width: s(8), height: s(8), borderRadius: s(4) },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(12),
    padding: s(10),
    paddingRight: s(14),
    marginVertical: s(5),
    borderRadius: s(20),
    backgroundColor: t.box.background,
    borderWidth: 1,
    borderColor: t.box.border,
  },
  cardLocked: { opacity: 0.85 },
  cardSoon: { borderStyle: 'dashed', borderWidth: 1.5, backgroundColor: 'transparent' },
  tile: { width: s(62), height: s(62), borderRadius: s(16), alignItems: 'center', justifyContent: 'center' },
  tileSoon: { borderWidth: 1.5, borderStyle: 'dashed' },
  lock: {
    position: 'absolute',
    right: s(3),
    bottom: s(3),
    width: s(18),
    height: s(18),
    borderRadius: s(9),
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: { flex: 1, gap: s(2) },
  rankName: { fontFamily: fonts.titleBold, fontSize: s(19), color: t.text.primary },
  status: { fontFamily: fonts.bodyBold, fontSize: s(11), letterSpacing: 1, textTransform: 'uppercase', color: t.text.muted },
  rowTrack: { height: s(14), borderRadius: s(7), backgroundColor: t.progress.track, overflow: 'hidden', marginTop: s(4), justifyContent: 'center' },
  rowFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: s(7) },
  rowTrackText: { fontFamily: fonts.bodyBold, fontSize: s(10), color: t.text.primary, textAlign: 'center' },
  footnote: { fontFamily: fonts.body, fontSize: s(13), lineHeight: s(19), color: t.text.muted, textAlign: 'center', marginTop: s(16) },
}));
