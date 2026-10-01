import React, { useState } from 'react';
import { Platform, Pressable, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Canvas, Circle, Group, Path } from '@shopify/react-native-skia';
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
const SWATCH_GAP = 10;

const THEME_META: Record<ThemeId, { icon: keyof typeof Ionicons.glyphMap; tagline: string }> = {
  autumn: { icon: 'leaf', tagline: 'Warm & cozy' },
  winter: { icon: 'snow', tagline: 'Cool & crisp' },
  spring: { icon: 'flower', tagline: 'Fresh & floral' },
  summer: { icon: 'sunny', tagline: 'Bright & sunny' },
};

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
  const meta = THEME_META[id];
  const l = preview.landscape;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${themeName(id)} theme, ${meta.tagline}`}
      style={({ pressed }) => [
        styles.themeCard,
        compact && styles.themeCardRow,
        { backgroundColor: preview.box.surface, borderColor: selected ? current.accent.color : preview.box.border },
        selected && styles.themeCardSelected,
        pressed && { transform: [{ scale: 0.96 }] },
      ]}
    >
      <View style={[styles.scene, { backgroundColor: preview.background.color }]}>
        <View style={[styles.sun, { backgroundColor: l.sun }]} />
        <View style={[styles.hill, styles.hillFar, { backgroundColor: l.hillFar }]} />
        <View style={[styles.hill, styles.hillMid, { backgroundColor: l.hillMid }]} />
        <View style={[styles.hill, styles.hillNear, { backgroundColor: l.hillNear }]} />
        <View style={[styles.tree, { left: '18%' }]}>
          <View style={[styles.leaf, { backgroundColor: l.leafDark }]} />
          <View style={[styles.trunk, { backgroundColor: l.trunk }]} />
        </View>
        <View style={[styles.tree, styles.treeSmall, { right: '20%' }]}>
          <View style={[styles.leaf, styles.leafSmall, { backgroundColor: l.leaf }]} />
          <View style={[styles.trunk, { backgroundColor: l.trunkDark }]} />
        </View>
        <View style={[styles.seasonBadge, { backgroundColor: preview.accent.color }]}>
          <Ionicons name={meta.icon} size={14} color={preview.accent.onColor} />
        </View>
        {selected && (
          <View style={[styles.themeCheck, { backgroundColor: current.accent.color }]}>
            <Ionicons name="checkmark" size={14} color={current.accent.onColor} />
          </View>
        )}
      </View>
      <View style={styles.themeInfo}>
        <Text style={[styles.themeName, { color: preview.text.primary }]} numberOfLines={1}>
          {themeName(id)}
        </Text>
        <Text style={[styles.themeTagline, { color: preview.text.secondary }]} numberOfLines={1}>
          {selected ? 'Active' : meta.tagline}
        </Text>
      </View>
    </Pressable>
  );
}

/** Every swatch in one canvas: each Skia canvas on web holds its own WebGL context, and browsers drop the oldest past ~16. */
function PalettePreview() {
  const theme = useTheme();
  const palette = usePalette();
  const colorblind = useSettings((s) => s.colorblind);
  const [width, setWidth] = useState(0);
  const r = SWATCH / 2;
  const perRow = Math.max(1, Math.floor((width + SWATCH_GAP) / (SWATCH + SWATCH_GAP)));
  const rows = Math.ceil(palette.length / perRow);
  const height = rows * SWATCH + (rows - 1) * SWATCH_GAP;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: width > 0 ? height : SWATCH }}>
      {width > 0 && (
        <Canvas style={{ width, height }}>
          {palette.map((d, i) => {
            const row = Math.floor(i / perRow);
            const inRow = Math.min(perRow, palette.length - row * perRow);
            const rowWidth = inRow * SWATCH + (inRow - 1) * SWATCH_GAP;
            const cx = (width - rowWidth) / 2 + (i % perRow) * (SWATCH + SWATCH_GAP) + r;
            const cy = row * (SWATCH + SWATCH_GAP) + r;
            return (
              <Group key={d.slot}>
                <Circle cx={cx} cy={cy} r={r} color={d.dot} />
                {colorblind && <Path path={symbolPath(i, cx, cy, r * 0.45)} color={theme.board.colorblindSymbol} />}
              </Group>
            );
          })}
        </Canvas>
      )}
    </View>
  );
}

export default function Settings() {
  const theme = useTheme();
  const styles = useStyles();
  const themeId = useSettings((s) => s.theme);
  const set = useSettings((s) => s.set);
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
        <PalettePreview />
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
    padding: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    shadowColor: t.box.shadow,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  themeCardRow: { flexBasis: '22%' },
  themeCardSelected: { borderWidth: 3, padding: 4.5 },
  scene: { height: 76, borderRadius: 14, overflow: 'hidden' },
  sun: { position: 'absolute', top: 10, right: '30%', width: 22, height: 22, borderRadius: 11, opacity: 0.85 },
  hill: { position: 'absolute', borderRadius: 999 },
  hillFar: { width: 170, height: 170, left: '-30%', bottom: -132, opacity: 0.75 },
  hillMid: { width: 150, height: 150, right: '-35%', bottom: -118, opacity: 0.9 },
  hillNear: { width: 220, height: 220, left: '-10%', bottom: -200 },
  tree: { position: 'absolute', bottom: 12, alignItems: 'center' },
  treeSmall: { bottom: 14 },
  leaf: { width: 12, height: 20, borderRadius: 6 },
  leafSmall: { width: 10, height: 15, borderRadius: 5 },
  trunk: { width: 2, height: 7, borderRadius: 1 },
  seasonBadge: { position: 'absolute', top: 8, left: 8, width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  themeInfo: { paddingHorizontal: 8, paddingTop: 8, paddingBottom: 6, gap: 2 },
  themeName: { fontFamily: fonts.title, fontSize: 17 },
  themeTagline: { fontFamily: fonts.body, fontSize: 12 },
  themeCheck: { position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  group: { borderRadius: 22, backgroundColor: t.box.background, borderWidth: 1, borderColor: t.box.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14 },
  divider: { borderTopWidth: 1, borderTopColor: t.box.border },
  iconWrap: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(t.accent.color, 0.22) },
  label: { fontFamily: fonts.title, fontSize: 17, color: t.text.primary },
  sub: { fontFamily: fonts.body, fontSize: 13, color: t.text.secondary },
  section: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 2, color: t.text.muted, marginTop: 22, marginBottom: 8, textTransform: 'uppercase' },
  palette: { padding: 16 },
  buttons: { marginTop: 24, gap: 12, alignItems: 'center' },
  confirm: { alignItems: 'center', padding: 14, borderRadius: 18, backgroundColor: withAlpha(t.status.danger, 0.1) },
}));
