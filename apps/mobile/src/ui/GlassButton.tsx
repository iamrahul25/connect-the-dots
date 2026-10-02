import React from 'react';
import { Pressable, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { fonts, tokens } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/useTheme';
import { useScale } from '../theme/scale';
import { withAlpha } from '../board/color';
import { audio } from '../services/audio';
import { haptics } from '../services/haptics';

type IconName = keyof typeof Ionicons.glyphMap;

/** Base (phone) heights per size, before UI scaling. */
export const BUTTON_H = { lg: 64, md: 52, sm: 44 } as const;

interface Props {
  label?: string;
  sublabel?: string;
  icon?: IconName;
  iconColor?: string;
  onPress?: () => void;
  /** Defaults to `solid` for labeled buttons and `glass` for icon-only ones. */
  variant?: 'primary' | 'solid' | 'glass' | 'ghost';
  /** Hex color replacing the theme accent on a `primary` button; its ink turns white. */
  accent?: string;
  disabled?: boolean;
  size?: 'lg' | 'md' | 'sm';
  /** Draws a 1px `button.outline` border. */
  outlined?: boolean;
  style?: StyleProp<ViewStyle>;
  badge?: string | number;
  accessibilityLabel?: string;
}

/** Rounded button with press-down spring, sound and haptic. */
export function GlassButton({
  label,
  sublabel,
  icon,
  iconColor,
  onPress,
  variant,
  accent,
  disabled,
  size = 'md',
  outlined,
  style,
  badge,
  accessibilityLabel,
}: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const { s } = useScale();
  const scale = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));
  const iconOnly = !label;
  const height = s(BUTTON_H[size]);
  const kind = variant ?? (iconOnly ? 'glass' : 'solid');
  const primary = kind === 'primary';
  const btn = theme.button;

  const background = primary ? accent ?? theme.accent.color : kind === 'ghost' ? 'transparent' : btn.background;
  const ink = primary ? (accent ? theme.text.onBadge : theme.accent.onColor) : btn.label;
  const shadow = primary ? (accent ? withAlpha(accent, 0.35) : theme.accent.shadow) : btn.shadow;

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
            paddingHorizontal: iconOnly ? 0 : s(size === 'lg' ? 28 : 20),
            backgroundColor: background,
            shadowColor: kind === 'ghost' ? 'transparent' : shadow,
            elevation: kind === 'ghost' ? 0 : 3,
          },
          outlined && { borderWidth: 1, borderColor: btn.outline },
        ]}
      >
        {icon && <Ionicons name={icon} size={s(size === 'lg' ? 26 : 22)} color={iconColor ?? (primary ? ink : btn.icon)} />}
        {label && (
          <View style={{ alignItems: iconOnly ? 'center' : 'flex-start' }}>
            <Text style={[styles.label, { fontSize: s(size === 'lg' ? 22 : 17), color: ink }]}>{label}</Text>
            {sublabel && <Text style={[styles.sub, { color: primary ? withAlpha(ink, 0.75) : theme.text.secondary }]}>{sublabel}</Text>}
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

const useStyles = makeStyles((t, s) => ({
  base: {
    borderRadius: tokens.radius.pill,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: s(10),
    shadowOpacity: 1,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  label: { fontFamily: fonts.title, letterSpacing: 0.3 },
  sub: { fontFamily: fonts.body, fontSize: s(12), marginTop: -2 },
  badge: {
    position: 'absolute',
    top: -4,
    right: -4,
    minWidth: s(22),
    height: s(22),
    borderRadius: s(11),
    backgroundColor: t.button.badge,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  badgeText: { fontFamily: fonts.bodyBold, fontSize: s(11), color: t.button.badgeText },
}));
