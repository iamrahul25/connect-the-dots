import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import type { Level, Uniqueness } from '@ctd/core';
import { GlassButton } from '../ui/GlassButton';
import { fonts } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/useTheme';
import { useScale } from '../theme/scale';
import { withAlpha } from '../board/color';
import { encodeSharedLevel, levelFileName } from '../services/levelShare';
import { downloadLevelFile, shareLevelFile } from '../services/levelFiles';
import { useCustomLevels } from '../store/customLevels';
import { haptics } from '../services/haptics';

interface Props {
  visible: boolean;
  name: string;
  level: Level;
  uniqueness: Uniqueness;
  /** Author to put in the file; defaults to the player's own name (editable) for their levels. */
  author?: string;
  onPlay?: () => void;
  onClose: () => void;
}

export const UNIQUENESS_NOTE: Record<Uniqueness, string> = {
  unique: 'Exactly one solution. Nice and fair!',
  multiple: 'Heads up: this level can be solved in more than one way.',
  unknown: "This board is too open to check whether it has only one solution.",
};

/** Level is ready: copy its JSON, save it as a file, or send it through the share sheet. */
export function ShareLevelDialog({ visible, name, level, uniqueness, author, onPlay, onClose }: Props) {
  const theme = useTheme();
  const styles = useStyles();
  const { s } = useScale();
  const ownLevel = author === undefined;
  const savedAuthor = useCustomLevels((st) => st.author);
  const [authorText, setAuthorText] = useState(author ?? savedAuthor);
  const [status, setStatus] = useState<string | null>(null);
  const [wasVisible, setWasVisible] = useState(visible);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setStatus(null);
  }
  const card = useSharedValue(0);

  useEffect(() => {
    card.value = visible ? withSpring(1, { damping: 16, stiffness: 180 }) : 0;
  }, [visible, card]);
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: 0.9 + 0.1 * card.value }] }));

  const by = (ownLevel ? authorText : author ?? '').trim();
  const rememberAuthor = () => {
    if (ownLevel && by !== savedAuthor) useCustomLevels.getState().setAuthor(by);
  };
  const run = async (what: 'copy' | 'download' | 'share') => {
    rememberAuthor();
    try {
      if (what === 'copy') {
        await Clipboard.setStringAsync(encodeSharedLevel(level, name, by));
        setStatus('Copied! Paste it in a chat or email.');
      } else if (what === 'download') {
        const r = await downloadLevelFile(levelFileName(name), encodeSharedLevel(level, name, by, true));
        setStatus(r === 'saved' ? `Saved ${levelFileName(name)}` : null);
      } else {
        await shareLevelFile(levelFileName(name), encodeSharedLevel(level, name, by, true));
      }
      haptics.success();
    } catch {
      setStatus("Couldn't do that on this device. Try copying instead.");
      haptics.warning();
    }
  };

  const warn = uniqueness !== 'unique';
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Pressable style={[StyleSheet.absoluteFill, styles.backdrop]} onPress={onClose} accessibilityLabel="Close" />
        <Animated.View style={[styles.card, cardStyle]}>
          <View style={[styles.iconWrap, { backgroundColor: withAlpha(theme.status.success, 0.14) }]}>
            <Ionicons name="share-social" size={s(30)} color={theme.status.success} />
          </View>
          <Text style={styles.title} numberOfLines={1}>
            {name}
          </Text>
          <Text style={styles.message}>
            {level.size.width}×{level.size.height} · {level.dots.length} colors · {level.difficulty.band}
          </Text>
          <View style={[styles.note, { backgroundColor: withAlpha(warn ? theme.status.warning : theme.status.success, 0.12) }]}>
            <Ionicons name={warn ? 'alert-circle' : 'checkmark-circle'} size={s(18)} color={warn ? theme.status.warning : theme.status.success} />
            <Text style={styles.noteText}>{UNIQUENESS_NOTE[uniqueness]}</Text>
          </View>
          {ownLevel && (
            <TextInput
              value={authorText}
              onChangeText={setAuthorText}
              onBlur={rememberAuthor}
              placeholder="Your name (optional)"
              placeholderTextColor={theme.text.muted}
              maxLength={40}
              style={styles.input}
              accessibilityLabel="Your name"
            />
          )}
          <View style={styles.actions}>
            <GlassButton label="Copy JSON" icon="copy" onPress={() => run('copy')} style={styles.action} />
            <GlassButton label="Download .json" icon="download" onPress={() => run('download')} style={styles.action} />
            <GlassButton label="Share file" icon="share-outline" onPress={() => run('share')} style={styles.action} />
          </View>
          {status && <Text style={styles.status}>{status}</Text>}
          <View style={styles.buttons}>
            <GlassButton label="Close" onPress={onClose} style={styles.button} />
            {onPlay && <GlassButton label="Play" icon="play" variant="primary" onPress={onPlay} style={styles.button} />}
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
  message: { fontFamily: fonts.body, fontSize: s(14), color: t.text.secondary, textAlign: 'center', marginTop: s(4), textTransform: 'capitalize' },
  note: { flexDirection: 'row', alignItems: 'center', gap: s(8), alignSelf: 'stretch', marginTop: s(14), padding: s(10), borderRadius: s(14) },
  noteText: { flex: 1, fontFamily: fonts.body, fontSize: s(13), color: t.text.primary },
  input: {
    alignSelf: 'stretch',
    marginTop: s(12),
    paddingHorizontal: s(14),
    height: s(44),
    borderRadius: s(14),
    borderWidth: 1,
    borderColor: t.box.border,
    backgroundColor: t.box.background,
    color: t.text.primary,
    fontFamily: fonts.body,
    fontSize: s(15),
  },
  actions: { alignSelf: 'stretch', gap: s(10), marginTop: s(16) },
  action: { alignSelf: 'stretch' },
  status: { fontFamily: fonts.bodyBold, fontSize: s(13), color: t.status.success, textAlign: 'center', marginTop: s(10) },
  buttons: { flexDirection: 'row', gap: s(10), marginTop: s(18), alignSelf: 'stretch' },
  button: { flex: 1 },
}));
