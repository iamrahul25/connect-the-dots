import React, { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { GlassButton } from '../ui/GlassButton';
import { fonts } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/useTheme';
import { useScale } from '../theme/scale';
import { withAlpha } from '../board/color';
import { importSharedLevel, type ImportResult } from '../services/levelShare';
import { pickLevelFile } from '../services/levelFiles';
import { haptics } from '../services/haptics';

interface Props {
  visible: boolean;
  onCancel: () => void;
  onImport: (level: Extract<ImportResult, { ok: true }>) => void;
}

/** Paste level JSON or open a .json file; it's checked before it's added. Give it a new `key` per opening. */
export function ImportLevelDialog({ visible, onCancel, onImport }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const { s } = useScale();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const card = useSharedValue(0);

  useEffect(() => {
    card.value = visible ? withSpring(1, { damping: 16, stiffness: 180 }) : 0;
  }, [visible, card]);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.9 + 0.1 * card.value }] }));

  const check = (raw: string) => {
    setChecking(true);
    setError(null);
    // Yield a frame so the spinner shows before the solver runs.
    setTimeout(() => {
      const result = importSharedLevel(raw);
      setChecking(false);
      if (result.ok) {
        haptics.success();
        onImport(result);
      } else {
        setError(result.error);
        haptics.warning();
      }
    }, 50);
  };

  const paste = async () => {
    try {
      const clip = await Clipboard.getStringAsync();
      if (!clip) {
        setError('Your clipboard is empty.');
        return;
      }
      setText(clip);
      setError(null);
    } catch {
      setError("Couldn't read the clipboard. Long-press the box and paste instead.");
    }
  };

  const openFile = async () => {
    try {
      const content = await pickLevelFile();
      if (content === null) return;
      setText(content);
      check(content);
    } catch {
      setError("Couldn't open that file.");
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onCancel} accessibilityLabel="Cancel" />
        <Animated.View style={[styles.card, cardStyle]}>
          <View style={[styles.iconWrap, { backgroundColor: withAlpha(theme.accent.color, 0.14) }]}>
            <Ionicons name="download" size={s(30)} color={theme.accent.color} />
          </View>
          <Text style={styles.title}>Add a level</Text>
          <Text style={styles.message}>Paste the level JSON a friend sent you, or open their .json file.</Text>
          <TextInput
            value={text}
            onChangeText={(v) => {
              setText(v);
              if (error) setError(null);
            }}
            multiline
            autoCorrect={false}
            autoCapitalize="none"
            spellCheck={false}
            placeholder='{ "format": "connect-the-dots/level", ... }'
            placeholderTextColor={theme.text.muted}
            style={[styles.input, error && { borderColor: theme.status.danger }]}
            textAlignVertical="top"
            accessibilityLabel="Level JSON"
          />
          {error && <Text style={styles.error}>{error}</Text>}
          <View style={styles.row}>
            <GlassButton label="Paste" icon="clipboard" size="sm" variant="ghost" onPress={paste} />
            <GlassButton label="Open file" icon="folder-open" size="sm" variant="ghost" onPress={openFile} />
          </View>
          <View style={styles.buttons}>
            <GlassButton label="Cancel" onPress={onCancel} style={styles.button} />
            {checking ? (
              <View style={[styles.button, styles.spinner]}>
                <ActivityIndicator color={theme.accent.color} />
              </View>
            ) : (
              <GlassButton label="Add" variant="primary" disabled={!text.trim()} onPress={() => check(text)} style={styles.button} />
            )}
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const useStyles = makeStyles((t, s) => ({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  backdrop: { backgroundColor: t.box.overlay },
  card: {
    width: '100%',
    maxWidth: s(420),
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
  input: {
    alignSelf: 'stretch',
    height: s(150),
    marginTop: s(16),
    padding: s(12),
    borderRadius: s(16),
    borderWidth: 1,
    borderColor: t.box.border,
    backgroundColor: t.box.background,
    color: t.text.primary,
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: s(12),
  },
  error: { fontFamily: fonts.bodyBold, fontSize: s(13), color: t.status.danger, textAlign: 'center', marginTop: s(8) },
  row: { flexDirection: 'row', gap: s(8), marginTop: s(8), justifyContent: 'center' },
  buttons: { flexDirection: 'row', gap: s(10), marginTop: s(18), alignSelf: 'stretch' },
  button: { flex: 1 },
  spinner: { alignItems: 'center', justifyContent: 'center' },
}));
