import React from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { rankProgress } from '../data/ranks';
import { TIER_COLORS } from '../theme/ranks';
import { fonts, tokens } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/useTheme';
import { useScale } from '../theme/scale';
import { audio } from '../services/audio';
import { haptics } from '../services/haptics';
import { BUTTON_H } from './GlassButton';
import { RankBadge } from './RankBadge';

/** Header pill with the player's rank emblem, name and progress toward the next rank. */
export function RankButton({ stars, onPress }: { stars: number; onPress: () => void }) {
  const theme = useTheme();
  const styles = useStyles();
  const { s } = useScale();
  const press = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const { rank, next, fraction, remaining } = rankProgress(stars);
  const accent = TIER_COLORS[rank.tier].accent;

  return (
    <Animated.View style={anim}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Rank ${rank.name}${next ? `, ${remaining} stars to ${next.name}` : ''}. Open rank journey`}
        onPressIn={() => {
          audio.unlock();
          press.set(withSpring(0.94, tokens.motion.spring));
        }}
        onPressOut={() => press.set(withSpring(1, tokens.motion.spring))}
        onPress={() => {
          audio.play('button', { volume: 0.6 });
          haptics.light();
          onPress();
        }}
        style={[styles.pill, { height: s(BUTTON_H.sm), backgroundColor: theme.button.background, shadowColor: theme.button.shadow }]}
      >
        <View style={styles.badge}>
          <RankBadge rank={rank} size={s(38)} />
        </View>
        <View style={styles.body}>
          <Text style={styles.name} numberOfLines={1}>
            {rank.name}
          </Text>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${(next ? fraction : 1) * 100}%`, backgroundColor: accent }]} />
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const useStyles = makeStyles((t, s) => ({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(6),
    paddingLeft: s(3),
    paddingRight: s(14),
    borderRadius: tokens.radius.pill,
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  badge: { marginVertical: -s(4) },
  body: { gap: s(4) },
  name: { fontFamily: fonts.title, fontSize: s(14), color: t.button.label, letterSpacing: 0.3 },
  track: { width: s(64), height: s(5), borderRadius: s(3), backgroundColor: t.progress.track, overflow: 'hidden' },
  fill: { height: s(5), borderRadius: s(3) },
}));
