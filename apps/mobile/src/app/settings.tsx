import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../ui/Screen';
import { GlassButton } from '../ui/GlassButton';
import { colors, fonts } from '../theme/tokens';
import { withAlpha } from '../board/color';
import { COLORBLIND_PALETTE, PALETTE, THEMES } from '../theme/themes';
import { useSettings, type SettingsState } from '../store/settings';
import { useProgress } from '../store/progress';
import { haptics } from '../services/haptics';

type Key = Exclude<keyof SettingsState, 'set'>;

type Row = { key: Key; icon: keyof typeof Ionicons.glyphMap; label: string; sub: string; native?: boolean };

const ROWS: Row[] = [
  { key: 'music', icon: 'musical-notes', label: 'Music', sub: 'Ambient soundtrack per pack' },
  { key: 'sfx', icon: 'volume-high', label: 'Sound effects', sub: 'Notes, chimes and pops' },
  { key: 'haptics', icon: 'phone-portrait', label: 'Haptics', sub: 'Vibration feedback', native: true },
  { key: 'colorblind', icon: 'eye', label: 'Colorblind mode', sub: 'Accessible palette + symbols on dots' },
  { key: 'reduceMotion', icon: 'pause-circle', label: 'Reduce motion', sub: 'Calmer animations and effects' },
  { key: 'idleHints', icon: 'sparkles', label: 'Idle nudges', sub: 'Gentle shimmer when you pause' },
];

const DEV_ROWS: Row[] = [
  { key: 'unlockAll', icon: 'lock-open', label: 'Unlock all levels', sub: 'Play any pack or level without earning it' },
  { key: 'unlimitedHints', icon: 'bulb', label: 'Unlimited hints', sub: 'Use hints without spending them' },
];

const accent = THEMES.dawn.accent;

function ToggleRow({ row, divider }: { row: Row; divider: boolean }) {
  const value = useSettings((s) => s[row.key]);
  const set = useSettings((s) => s.set);
  return (
    <Pressable
      onPress={() => {
        set({ [row.key]: !value });
        haptics.selection();
      }}
      style={[styles.row, divider && styles.divider]}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
    >
      <View style={styles.iconWrap}>
        <Ionicons name={row.icon} size={20} color={accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{row.label}</Text>
        <Text style={styles.sub}>{row.sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={(v) => set({ [row.key]: v })}
        trackColor={{ false: colors.meter.track, true: accent }}
        thumbColor={colors.textPure}
        {...(Platform.OS === 'web' ? { activeThumbColor: colors.textPure } : {})}
      />
    </Pressable>
  );
}

export default function Settings() {
  const colorblind = useSettings((s) => s.colorblind);
  const [confirm, setConfirm] = useState(false);
  const palette = colorblind ? COLORBLIND_PALETTE : PALETTE;

  return (
    <Screen title="Settings" back>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.group}>
          {ROWS.filter((r) => !r.native || Platform.OS !== 'web').map((r, i) => (
            <ToggleRow key={r.key} row={r} divider={i > 0} />
          ))}
        </View>

        {__DEV__ && (
          <>
            <Text style={styles.section}>Developer</Text>
            <View style={styles.group}>
              {DEV_ROWS.map((r, i) => (
                <ToggleRow key={r.key} row={r} divider={i > 0} />
              ))}
            </View>
          </>
        )}

        <Text style={styles.section}>Palette preview</Text>
        <View style={[styles.group, styles.palette]}>
          {palette.map((c) => (
            <View key={c} style={[styles.swatch, { backgroundColor: c, shadowColor: c }]} />
          ))}
        </View>

        <View style={styles.buttons}>
          <GlassButton label="Credits" icon="heart" onPress={() => router.push('/credits')} />
          {confirm ? (
            <View style={styles.confirm}>
              <Text style={styles.sub}>Erase all stars, hints and streaks?</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                <GlassButton label="Cancel" size="sm" onPress={() => setConfirm(false)} />
                <GlassButton
                  label="Reset"
                  size="sm"
                  variant="primary"
                  accent={colors.danger}
                  onPress={() => {
                    useProgress.getState().reset();
                    haptics.warning();
                    setConfirm(false);
                  }}
                />
              </View>
            </View>
          ) : (
            <GlassButton label="Reset progress" icon="trash" variant="ghost" onPress={() => setConfirm(true)} />
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingBottom: 24 },
  group: { borderRadius: 22, backgroundColor: colors.glass, borderWidth: 1, borderColor: colors.glassBorder, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.glassBorder },
  iconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(accent, 0.14) },
  label: { fontFamily: fonts.title, fontSize: 17, color: colors.text },
  sub: { fontFamily: fonts.body, fontSize: 13, color: colors.textDim },
  section: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 2, color: colors.textFaint, marginTop: 22, marginBottom: 8, textTransform: 'uppercase' },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 16, justifyContent: 'center' },
  swatch: { width: 30, height: 30, borderRadius: 15, shadowOpacity: 0.6, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
  buttons: { marginTop: 24, gap: 12, alignItems: 'center' },
  confirm: { alignItems: 'center', padding: 14, borderRadius: 18, backgroundColor: withAlpha(colors.danger, 0.1) },
});
