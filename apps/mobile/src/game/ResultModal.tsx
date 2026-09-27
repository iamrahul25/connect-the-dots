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
import { colors, fonts, tokens } from '../theme/tokens';
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
  accent: string;
  nextLabel: string;
  onNext: () => void;
  onReplay: () => void;
  onLevels: () => void;
  reduceMotion: boolean;
}

const TITLES = ['Solved', 'Solved!', 'Brilliant!', 'Perfect!'];

function Star({ index, earned, reduceMotion }: { index: number; earned: boolean; reduceMotion: boolean }) {
  const s = useSharedValue(earned ? 0 : 1);
  const rot = useSharedValue(earned && !reduceMotion ? -40 : 0);
  useEffect(() => {
    if (!earned) return;
    const delay = 380 + index * 170;
    s.value = withDelay(delay, withSequence(withSpring(1.35, { damping: 7, stiffness: 260 }), withSpring(1, tokens.motion.spring)));
    rot.value = withDelay(delay, withSpring(0, { damping: 9 }));
    const t = setTimeout(() => {
      audio.play(`star_${index + 1}` as 'star_1');
      haptics.soft();
    }, delay);
    return () => clearTimeout(t);
  }, [earned, index, s, rot]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: s.value }, { rotate: `${rot.value}deg` }] }));
  return (
    <Animated.View style={[style, index === 1 && { marginTop: -14 }]}>
      <Ionicons name={earned ? 'star' : 'star-outline'} size={index === 1 ? 58 : 46} color={earned ? colors.star : 'rgba(255,255,255,0.25)'} />
    </Animated.View>
  );
}

export function ResultModal({ result, accent, nextLabel, onNext, onReplay, onLevels, reduceMotion }: Props) {
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
            <Text style={[styles.reward, { color: '#FF9F43' }]}>🔥 {result.streak}-day streak</Text>
          )}
          {result.packCompleted && <Text style={[styles.reward, { color: accent }]}>Pack complete! 🎉</Text>}
          {result.hintsEarned > 0 && <Text style={styles.reward}>+{result.hintsEarned} hint{result.hintsEarned > 1 ? 's' : ''} 💡</Text>}
          <GlassButton label={nextLabel} icon="play" variant="primary" accent={accent} size="lg" onPress={onNext} style={{ alignSelf: 'stretch', marginTop: 18 }} />
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
  return (
    <View style={{ alignItems: 'center', minWidth: 70 }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(5,4,18,0.55)' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 28,
    padding: 24,
    alignItems: 'center',
    backgroundColor: 'rgba(30,24,64,0.88)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  title: { fontFamily: fonts.titleBold, fontSize: 34, color: colors.text, letterSpacing: 0.5 },
  stars: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 14, height: 76 },
  stats: { flexDirection: 'row', gap: 12, marginTop: 4 },
  statValue: { fontFamily: fonts.title, fontSize: 24, color: colors.text },
  statLabel: { fontFamily: fonts.body, fontSize: 12, color: colors.textDim, textTransform: 'uppercase', letterSpacing: 1 },
  note: { fontFamily: fonts.body, fontSize: 12, color: colors.textDim, marginTop: 12 },
  reward: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.gold, marginTop: 10 },
  row: { flexDirection: 'row', gap: 10, marginTop: 10, alignSelf: 'stretch' },
});
