import React, { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { GlassButton } from './GlassButton';
import { fonts } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/useTheme';
import { useScale } from '../theme/scale';
import { withAlpha } from '../board/color';

type IconName = keyof typeof Ionicons.glyphMap;

interface Props {
  visible: boolean;
  title: string;
  message: string;
  icon?: IconName;
  confirmLabel: string;
  cancelLabel?: string;
  /** Colors the icon and confirm button with `status.danger` for destructive actions. */
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Centered pop-up asking the player to confirm an action. Tapping the backdrop or Android back cancels. */
export function ConfirmDialog({ visible, title, message, icon, confirmLabel, cancelLabel = 'Cancel', danger, onConfirm, onCancel }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const { s } = useScale();
  const card = useSharedValue(0);
  useEffect(() => {
    card.value = visible ? withSpring(1, { damping: 16, stiffness: 180 }) : 0;
  }, [visible, card]);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.9 + 0.1 * card.value }] }));
  const tone = danger ? theme.status.danger : theme.accent.color;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <View style={styles.root}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onCancel} accessibilityLabel={cancelLabel} />
        <Animated.View style={[styles.card, cardStyle]} accessibilityRole="alert">
          {icon && (
            <View style={[styles.iconWrap, { backgroundColor: withAlpha(tone, 0.14) }]}>
              <Ionicons name={icon} size={s(30)} color={tone} />
            </View>
          )}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.buttons}>
            <GlassButton label={cancelLabel} onPress={onCancel} style={styles.button} />
            <GlassButton
              label={confirmLabel}
              variant="primary"
              accent={danger ? theme.status.danger : undefined}
              onPress={onConfirm}
              style={styles.button}
            />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const useStyles = makeStyles((t, s) => ({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  backdrop: { backgroundColor: t.box.overlay },
  card: {
    width: '100%',
    maxWidth: s(380),
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
  iconWrap: { width: s(60), height: s(60), borderRadius: s(30), alignItems: 'center', justifyContent: 'center', marginBottom: s(14) },
  title: { fontFamily: fonts.titleBold, fontSize: s(24), color: t.text.primary, textAlign: 'center' },
  message: { fontFamily: fonts.body, fontSize: s(15), color: t.text.secondary, textAlign: 'center', marginTop: s(8) },
  buttons: { flexDirection: 'row', gap: s(10), marginTop: s(22), alignSelf: 'stretch' },
  button: { flex: 1 },
}));
