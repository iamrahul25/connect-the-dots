import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { GlassButton } from '../ui/GlassButton';
import { RankBadge } from '../ui/RankBadge';
import type { Rank } from '../data/ranks';
import { TIER_COLORS } from '../theme/ranks';
import { withAlpha } from '../board/color';
import { fonts, tokens } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/useTheme';
import { useScale } from '../theme/scale';
import { audio } from '../services/audio';
import { haptics } from '../services/haptics';

export interface ResultInfo {
  stars: number;
  moves: number;
  best: number;
  perfect: number;
  packCompleted: boolean;
  usedHint: boolean;
  streak?: number;
  /** Daily: all three tiers of the day are now solved. */
  perfectDay?: boolean;
  /** The rank this solve's stars just reached. */
  rankUp?: Rank;
}

interface Props {
  result: ResultInfo;
  nextLabel: string;
  onNext: () => void;
  onReplay: () => void;
  onLevels: () => void;
  reduceMotion: boolean;
}

const TITLES = ['Solved', 'Solved!', 'Brilliant!', 'Perfect!'];

function Star({ index, earned, reduceMotion }: { index: number; earned: boolean; reduceMotion: boolean }) {
  const { star } = useTheme();
  const { s } = useScale();
  const pop = useSharedValue(earned ? 0 : 1);
  const rot = useSharedValue(earned && !reduceMotion ? -40 : 0);
  useEffect(() => {
    if (!earned) return;
    const delay = 380 + index * 170;
    pop.value = withDelay(delay, withSequence(withSpring(1.35, { damping: 7, stiffness: 260 }), withSpring(1, tokens.motion.spring)));
    rot.value = withDelay(delay, withSpring(0, { damping: 9 }));
    const t = setTimeout(() => {
      audio.play(`star_${index + 1}` as 'star_1');
      haptics.soft();
    }, delay);
    return () => clearTimeout(t);
  }, [earned, index, pop, rot]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.value }, { rotate: `${rot.value}deg` }] }));
  return (
    <Animated.View style={[style, index === 1 && { marginTop: -s(14) }]}>
      <Ionicons name={earned ? 'star' : 'star-outline'} size={s(index === 1 ? 58 : 46)} color={earned ? star.filled : star.empty} />
    </Animated.View>
  );
}

export function ResultModal({ result, nextLabel, onNext, onReplay, onLevels, reduceMotion }: Props) {
  const styles = useStyles();
  const backdrop = useSharedValue(0);
  const card = useSharedValue(0);
  useEffect(() => {
    backdrop.value = withTiming(1, { duration: 300 });
    card.value = withSpring(1, { damping: 15, stiffness: 140 });
  }, [backdrop, card]);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, card.value * 1.5),
    transform: [{ translateY: (1 - card.value) * 260 }, { scale: 0.9 + 0.1 * card.value }],
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]} />
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View style={[styles.card, cardStyle]}>
          <Text style={styles.title}>{TITLES[result.stars]}</Text>
          <View style={styles.stars}>
            {[0, 1, 2].map((i) => (
              <Star key={i} index={i} earned={i < result.stars} reduceMotion={reduceMotion} />
            ))}
          </View>
          <View style={styles.stats}>
            <Stat label="Moves" value={String(result.moves)} />
            <Stat label="Perfect" value={String(result.perfect)} />
            <Stat label="Best" value={String(result.best)} />
          </View>
          {result.usedHint && <Text style={styles.note}>Hint used · replay without hints for ★★★</Text>}
          {result.streak !== undefined && result.streak > 0 && (
            <Text style={[styles.reward, styles.streak]}>🔥 {result.streak}-day streak</Text>
          )}
          {result.perfectDay && <Text style={[styles.reward, styles.crown]}>👑 Perfect day: all 3 solved!</Text>}
          {result.packCompleted && <Text style={styles.reward}>Pack complete! 🎉</Text>}
          {result.rankUp && <RankUpBanner rank={result.rankUp} reduceMotion={reduceMotion} />}
          <GlassButton label={nextLabel} icon="play" variant="primary" size="lg" onPress={onNext} style={styles.next} />
          <View style={styles.row}>
            <GlassButton label="Replay" icon="refresh" onPress={onReplay} style={{ flex: 1 }} />
            <GlassButton label="Levels" icon="grid" onPress={onLevels} style={{ flex: 1 }} />
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

function RankUpBanner({ rank, reduceMotion }: { rank: Rank; reduceMotion: boolean }) {
  const styles = useStyles();
  const { s } = useScale();
  const accent = TIER_COLORS[rank.tier].accent;
  const pop = useSharedValue(reduceMotion ? 1 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    pop.value = withDelay(1100, withSequence(withSpring(1.12, { damping: 8, stiffness: 220 }), withSpring(1, tokens.motion.spring)));
  }, [pop, reduceMotion]);
  const style = useAnimatedStyle(() => ({ opacity: Math.min(1, pop.value), transform: [{ scale: 0.6 + 0.4 * pop.value }] }));
  return (
    <Animated.View
      style={[styles.rankUp, { borderColor: withAlpha(accent, 0.6), backgroundColor: withAlpha(accent, 0.14) }, style]}
      accessible
      accessibilityLabel={`Rank up! You reached ${rank.name}`}
    >
      <RankBadge rank={rank} size={s(48)} />
      <View>
        <Text style={styles.rankUpLabel}>Rank up!</Text>
        <Text style={[styles.rankUpName, { color: accent }]}>{rank.name}</Text>
      </View>
    </Animated.View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const styles = useStyles();
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const useStyles = makeStyles((t, s) => ({
  backdrop: { backgroundColor: t.box.overlay },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: s(400),
    borderRadius: s(28),
    padding: s(24),
    alignItems: 'center',
    backgroundColor: t.box.surface,
    borderWidth: 1,
    borderColor: t.box.border,
    shadowColor: t.box.shadow,
    shadowOpacity: 1,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  title: { fontFamily: fonts.titleBold, fontSize: s(34), color: t.text.primary, letterSpacing: 0.5 },
  stars: { flexDirection: 'row', alignItems: 'center', gap: s(8), marginVertical: s(14), height: s(76) },
  stats: { flexDirection: 'row', gap: s(12), marginTop: s(4) },
  stat: { alignItems: 'center', minWidth: s(70) },
  statValue: { fontFamily: fonts.title, fontSize: s(24), color: t.text.primary },
  statLabel: { fontFamily: fonts.body, fontSize: s(12), color: t.text.secondary, textTransform: 'uppercase', letterSpacing: 1 },
  note: { fontFamily: fonts.body, fontSize: s(12), color: t.text.secondary, marginTop: s(12), textAlign: 'center' },
  reward: { fontFamily: fonts.bodyBold, fontSize: s(15), color: t.icon.hint, marginTop: s(10) },
  streak: { color: t.icon.streak },
  crown: { color: t.icon.star },
  rankUp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(10),
    marginTop: s(12),
    paddingVertical: s(6),
    paddingLeft: s(8),
    paddingRight: s(18),
    borderRadius: tokens.radius.pill,
    borderWidth: 1.5,
  },
  rankUpLabel: { fontFamily: fonts.bodyBold, fontSize: s(11), letterSpacing: 1.5, textTransform: 'uppercase', color: t.text.secondary },
  rankUpName: { fontFamily: fonts.titleBold, fontSize: s(20), lineHeight: s(24) },
  next: { alignSelf: 'stretch', marginTop: s(18) },
  row: { flexDirection: 'row', gap: s(10), marginTop: s(10), alignSelf: 'stretch' },
}));
