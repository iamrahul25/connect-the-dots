import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { GlassButton } from './GlassButton';
import { fonts } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/useTheme';
import { useScale } from '../theme/scale';
import { withAlpha } from '../board/color';
import { parseSaveData, type SaveData, type SaveSummary } from '../services/saveData';
import { haptics } from '../services/haptics';

interface Props {
  visible: boolean;
  onCancel: () => void;
  onImport: (data: SaveData) => void;
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
}

/** Paste-in save data, validated, then a replace confirmation before `onImport`. Give it a new `key` per opening to clear its state. */
export function ImportSaveDialog({ visible, onCancel, onImport }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const { s } = useScale();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ data: SaveData; summary: SaveSummary } | null>(null);
  const card = useSharedValue(0);

  useEffect(() => {
    card.value = visible ? withSpring(1, { damping: 16, stiffness: 180 }) : 0;
  }, [visible, card]);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.9 + 0.1 * card.value }] }));

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

  const validate = () => {
    const result = parseSaveData(text);
    if (result.ok) {
      setPending({ data: result.data, summary: result.summary });
      setError(null);
      haptics.selection();
    } else {
      setError(result.error);
      haptics.warning();
    }
  };

  const summary = pending?.summary;
  const exportedAt = formatDate(summary?.exportedAt ?? null);
  const tone = pending ? theme.status.danger : theme.accent.color;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onCancel}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onCancel} accessibilityLabel="Cancel" />
        <Animated.View style={[styles.card, cardStyle]}>
          <View style={[styles.iconWrap, { backgroundColor: withAlpha(tone, 0.14) }]}>
            <Ionicons name={pending ? 'warning' : 'download'} size={s(30)} color={tone} />
          </View>

          {summary ? (
            <>
              <Text style={styles.title}>Replace progress?</Text>
              <Text style={styles.message}>Your current stars, hints, daily streaks and settings will be overwritten with this save.</Text>
              <View style={styles.stats}>
                <Stat icon="checkmark-circle" label="Levels solved" value={summary.levelsSolved} />
                <Stat icon="star" label="Stars" value={summary.stars} />
                <Stat icon="bulb" label="Hints" value={summary.hints} />
                <Stat icon="calendar" label="Daily puzzles" value={summary.dailySolved} />
              </View>
              {exportedAt && <Text style={styles.meta}>Exported {exportedAt}</Text>}
              <View style={styles.buttons}>
                <GlassButton label="Back" onPress={() => setPending(null)} style={styles.button} />
                <GlassButton label="Replace" variant="primary" accent={theme.status.danger} onPress={() => onImport(pending.data)} style={styles.button} />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.title}>Import save data</Text>
              <Text style={styles.message}>Paste the save data you exported earlier.</Text>
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
                placeholder='{ "app": "connect-the-dots", ... }'
                placeholderTextColor={theme.text.muted}
                style={[styles.input, error && { borderColor: theme.status.danger }]}
                textAlignVertical="top"
                accessibilityLabel="Save data"
              />
              {error && <Text style={styles.error}>{error}</Text>}
              <GlassButton label="Paste from clipboard" icon="clipboard" size="sm" variant="ghost" onPress={paste} style={styles.paste} />
              <View style={styles.buttons}>
                <GlassButton label="Cancel" onPress={onCancel} style={styles.button} />
                <GlassButton label="Import" variant="primary" disabled={!text.trim()} onPress={validate} style={styles.button} />
              </View>
            </>
          )}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Stat({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: number }) {
  const theme = useTheme();
  const styles = useStyles();
  const { s } = useScale();
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={s(16)} color={theme.icon.default} />
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={styles.statValue}>{value}</Text>
    </View>
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
    height: s(160),
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
  paste: { marginTop: s(8) },
  stats: { alignSelf: 'stretch', marginTop: s(16), borderRadius: s(16), backgroundColor: t.box.background, borderWidth: 1, borderColor: t.box.border, paddingVertical: s(4) },
  stat: { flexDirection: 'row', alignItems: 'center', gap: s(10), paddingHorizontal: s(14), paddingVertical: s(8) },
  statLabel: { flex: 1, fontFamily: fonts.body, fontSize: s(15), color: t.text.secondary },
  statValue: { fontFamily: fonts.bodyBold, fontSize: s(15), color: t.text.primary },
  meta: { fontFamily: fonts.body, fontSize: s(12), color: t.text.muted, marginTop: s(10) },
  buttons: { flexDirection: 'row', gap: s(10), marginTop: s(22), alignSelf: 'stretch' },
  button: { flex: 1 },
}));
