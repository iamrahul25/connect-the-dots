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
  hintsEarned: number;
  packCompleted: boolean;
  usedHint: boolean;
  streak?: number;
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
          {result.packCompleted && <Text style={styles.reward}>Pack complete! 🎉</Text>}
          {result.hintsEarned > 0 && <Text style={styles.reward}>+{result.hintsEarned} hint{result.hintsEarned > 1 ? 's' : ''} 💡</Text>}
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
  next: { alignSelf: 'stretch', marginTop: s(18) },
  row: { flexDirection: 'row', gap: s(10), marginTop: s(10), alignSelf: 'stretch' },
}));
