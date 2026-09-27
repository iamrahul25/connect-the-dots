import React from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, tokens } from '../theme/tokens';
import { lighten } from '../board/color';
import { audio } from '../services/audio';
import { haptics } from '../services/haptics';

type IconName = keyof typeof Ionicons.glyphMap;

interface Props {
  label?: string;
  sublabel?: string;
  icon?: IconName;
  iconColor?: string;
  onPress?: () => void;
  /** Defaults to `solid` for labeled buttons and `glass` for icon-only ones. */
  variant?: 'primary' | 'solid' | 'glass' | 'ghost';
  accent?: string;
  disabled?: boolean;
  size?: 'lg' | 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
  badge?: string | number;
  accessibilityLabel?: string;
}

const BTN = colors.button;

/** Pill-shaped glass button with press-down spring, sound and haptic. */
export function GlassButton({
  label,
  sublabel,
  icon,
  iconColor,
  onPress,
  variant,
  accent = colors.textPure,
  disabled,
  size = 'md',
  style,
  badge,
  accessibilityLabel,
}: Props) {
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const iconOnly = !label;
  const height = size === 'lg' ? 64 : size === 'md' ? 52 : 44;
  const kind = variant ?? (iconOnly ? 'glass' : 'solid');
  const primary = kind === 'primary';
  const ink = primary ? BTN.badgeText : colors.textPure;

  const fill =
    kind === 'primary' ? [lighten(accent, 0.2), accent] as const
    : kind === 'solid' ? [BTN.highlight, BTN.bg] as const
    : kind === 'glass' ? [colors.glassHighlight, 'rgba(255,255,255,0)'] as const
    : null;

  return (
    <Animated.View style={[anim, style, disabled && { opacity: 0.4 }]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? label}
        disabled={disabled}
        onPressIn={() => {
          audio.unlock();
          scale.value = withSpring(0.94, tokens.motion.spring);
        }}
        onPressOut={() => (scale.value = withSpring(1, tokens.motion.spring))}
        onPress={() => {
          audio.play('button', { volume: 0.6 });
          haptics.light();
          onPress?.();
        }}
        style={[
          styles.base,
          {
            height,
            minWidth: height,
            paddingHorizontal: iconOnly ? 0 : size === 'lg' ? 28 : 20,
            backgroundColor: primary ? accent : kind === 'solid' ? BTN.bg : kind === 'ghost' ? 'transparent' : colors.glassStrong,
            borderColor: primary ? 'rgba(255,255,255,0.5)' : kind === 'solid' ? BTN.border : colors.glassBorder,
            borderWidth: kind === 'ghost' ? 0 : 1,
            shadowColor: primary ? accent : BTN.shadow,
          },
        ]}
      >
        {fill && <LinearGradient colors={fill} start={{ x: 0, y: 0 }} end={{ x: 0, y: 0.6 }} style={styles.sheen} />}
        {icon && <Ionicons name={icon} size={size === 'lg' ? 26 : 22} color={iconColor ?? ink} />}
        {label && (
          <View style={{ alignItems: iconOnly ? 'center' : 'flex-start' }}>
            <Text style={[styles.label, { fontSize: size === 'lg' ? 22 : 17, color: ink }]}>{label}</Text>
            {sublabel && <Text style={[styles.sub, { color: primary ? 'rgba(38,27,80,0.7)' : colors.textDim }]}>{sublabel}</Text>}
          </View>
        )}
        {badge !== undefined && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: tokens.radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  sheen: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: tokens.radius.pill, pointerEvents: 'none' },
  label: { fontFamily: fonts.title, letterSpacing: 0.3 },
  sub: { fontFamily: fonts.body, fontSize: 12, marginTop: -2 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: BTN.badge,
    borderWidth: 1,
    borderColor: BTN.badgeHighlight,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: 11, color: BTN.badgeText },
});
