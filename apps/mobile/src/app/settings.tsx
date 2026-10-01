import React, { useState } from 'react';
import { Platform, Pressable, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Canvas, Path } from '@shopify/react-native-skia';
import { Screen } from '../ui/Screen';
import { GlassButton } from '../ui/GlassButton';
import { useLayout } from '../ui/layout';
import { fonts } from '../theme/tokens';
import { withAlpha } from '../board/color';
import { symbolPath } from '../board/symbols';
import { resolveTheme, THEME_IDS, themeName, type ThemeId } from '../theme/config';
import { makeStyles, usePalette, useTheme } from '../theme/useTheme';
import { useSettings, type SettingsState } from '../store/settings';
import { useProgress } from '../store/progress';
import { haptics } from '../services/haptics';

const SWATCH = 30;

type Key = Exclude<keyof SettingsState, 'set' | 'theme'>;

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

function ToggleRow({ row, divider }: { row: Row; divider: boolean }) {
  const theme = useTheme();
  const styles = useStyles();
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
        <Ionicons name={row.icon} size={20} color={theme.icon.default} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{row.label}</Text>
        <Text style={styles.sub}>{row.sub}</Text>
      </View>
      <Switch
        value={value}
        onValueChange={(v) => set({ [row.key]: v })}
        trackColor={{ false: theme.progress.track, true: theme.accent.color }}
        thumbColor="#FFFFFF"
        {...(Platform.OS === 'web' ? { activeThumbColor: '#FFFFFF' } : {})}
      />
    </Pressable>
  );
}

function ThemeCard({ id, selected, compact, onPress }: { id: ThemeId; selected: boolean; compact: boolean; onPress: () => void }) {
  const current = useTheme();
  const styles = useStyles();
  const preview = resolveTheme(id);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${themeName(id)} theme`}
      style={({ pressed }) => [
        styles.themeCard,
        compact && styles.themeCardRow,
        { backgroundColor: preview.background.color, borderColor: selected ? current.accent.color : preview.box.border },
        selected && styles.themeCardSelected,
        pressed && { transform: [{ scale: 0.96 }] },
      ]}
    >
      <View style={styles.themeDots}>
        {preview.dots.slice(0, 4).map((d) => (
          <View key={d.slot} style={[styles.themeDot, { backgroundColor: d.dot }]} />
        ))}
      </View>
      <View style={[styles.themeAccent, { backgroundColor: preview.accent.color }]} />
      <Text style={[styles.themeName, { color: preview.text.primary }]}>{themeName(id)}</Text>
      {selected && (
        <View style={[styles.themeCheck, { backgroundColor: current.accent.color }]}>
          <Ionicons name="checkmark" size={12} color={current.accent.onColor} />
        </View>
      )}
    </Pressable>
  );
}

export default function Settings() {
  const theme = useTheme();
  const styles = useStyles();
  const themeId = useSettings((s) => s.theme);
  const set = useSettings((s) => s.set);
  const palette = usePalette();
  const colorblind = useSettings((s) => s.colorblind);
  const [confirm, setConfirm] = useState(false);
  const { tablet } = useLayout();

  return (
    <Screen title="Settings" back scroll>
      <Text style={[styles.section, { marginTop: 0 }]}>Theme</Text>
      <View style={styles.themes}>
        {THEME_IDS.map((id) => (
          <ThemeCard
            key={id}
            id={id}
            selected={id === themeId}
            compact={tablet}
            onPress={() => {
              set({ theme: id });
              haptics.selection();
            }}
          />
        ))}
      </View>

      <Text style={styles.section}>Preferences</Text>
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
        {palette.map((d, i) => (
          <View key={d.slot} style={[styles.swatch, { backgroundColor: d.dot }]}>
            {colorblind && (
              <Canvas style={styles.swatch}>
                <Path path={symbolPath(i, SWATCH / 2, SWATCH / 2, (SWATCH / 2) * 0.45)} color={theme.board.colorblindSymbol} />
              </Canvas>
            )}
          </View>
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
                accent={theme.status.danger}
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
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  themes: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  themeCard: {
    flexGrow: 1,
    flexBasis: '45%',
    padding: 14,
    borderRadius: 20,
    borderWidth: 1.5,
    gap: 10,
    shadowColor: t.box.shadow,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  themeCardRow: { flexBasis: '22%' },
  themeCardSelected: { borderWidth: 2.5 },
  themeDots: { flexDirection: 'row', gap: 6 },
  themeDot: { width: 18, height: 18, borderRadius: 9 },
  themeAccent: { height: 6, width: 44, borderRadius: 3 },
  themeName: { fontFamily: fonts.title, fontSize: 17 },
  themeCheck: { position: 'absolute', top: 10, right: 10, width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  group: { borderRadius: 22, backgroundColor: t.box.background, borderWidth: 1, borderColor: t.box.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  divider: { borderTopWidth: 1, borderTopColor: t.box.border },
  iconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(t.accent.color, 0.22) },
  label: { fontFamily: fonts.title, fontSize: 17, color: t.text.primary },
  sub: { fontFamily: fonts.body, fontSize: 13, color: t.text.secondary },
  section: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 2, color: t.text.muted, marginTop: 22, marginBottom: 8, textTransform: 'uppercase' },
  palette: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 16, justifyContent: 'center' },
  swatch: { width: SWATCH, height: SWATCH, borderRadius: SWATCH / 2 },
  buttons: { marginTop: 24, gap: 12, alignItems: 'center' },
  confirm: { alignItems: 'center', padding: 14, borderRadius: 18, backgroundColor: withAlpha(t.status.danger, 0.1) },
}));
