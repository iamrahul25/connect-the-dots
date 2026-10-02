import React, { useState } from 'react';
import { Platform, Pressable, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Canvas, Circle, Group, Path } from '@shopify/react-native-skia';
import { Screen } from '../ui/Screen';
import { GlassButton } from '../ui/GlassButton';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import { useLayout } from '../ui/layout';
import { fonts } from '../theme/tokens';
import { withAlpha } from '../board/color';
import { symbolPath } from '../board/symbols';
import { resolveTheme, THEME_IDS, themeName, type ThemeId } from '../theme/config';
import { makeStyles, usePalette, useTheme } from '../theme/useTheme';
import { useScale } from '../theme/scale';
import { useSettings, type SettingsState } from '../store/settings';
import { useProgress } from '../store/progress';
import { haptics } from '../services/haptics';

const SWATCH = 30;
const SWATCH_GAP = 10;
/** Must match the themeCard / themeCardRow widths and gaps below. */
const THEME_COLS = 3;
const THEME_COLS_TABLET = 5;

const THEME_META: Record<ThemeId, { icon: keyof typeof Ionicons.glyphMap; tagline: string }> = {
  autumn: { icon: 'leaf', tagline: 'Warm & cozy' },
  winter: { icon: 'snow', tagline: 'Cool & crisp' },
  spring: { icon: 'flower', tagline: 'Fresh & floral' },
  summer: { icon: 'sunny', tagline: 'Bright & sunny' },
  night: { icon: 'moon', tagline: 'Dark & calm' },
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
  const { s } = useScale();
  const value = useSettings((st) => st[row.key]);
  const set = useSettings((st) => st.set);
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
        <Ionicons name={row.icon} size={s(20)} color={theme.icon.default} />
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

function ThemeCard({ id, selected, compact, rowEnd, onPress }: { id: ThemeId; selected: boolean; compact: boolean; rowEnd: boolean; onPress: () => void }) {
  const current = useTheme();
  const styles = useStyles();
  const { s } = useScale();
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
        !rowEnd && (compact ? styles.themeCardRowGap : styles.themeCardGap),
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
          <Ionicons name={meta.icon} size={s(14)} color={preview.accent.onColor} />
        </View>
        {selected && (
          <View style={[styles.themeCheck, { backgroundColor: current.accent.color }]}>
            <Ionicons name="checkmark" size={s(14)} color={current.accent.onColor} />
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
  const colorblind = useSettings((st) => st.colorblind);
  const { s } = useScale();
  const [width, setWidth] = useState(0);
  const swatch = s(SWATCH);
  const gap = s(SWATCH_GAP);
  const r = swatch / 2;
  const perRow = Math.max(1, Math.floor((width + gap) / (swatch + gap)));
  const rows = Math.ceil(palette.length / perRow);
  const height = rows * swatch + (rows - 1) * gap;
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ height: width > 0 ? height : swatch }}>
      {width > 0 && (
        <Canvas style={{ width, height }}>
          {palette.map((d, i) => {
            const row = Math.floor(i / perRow);
            const inRow = Math.min(perRow, palette.length - row * perRow);
            const rowWidth = inRow * swatch + (inRow - 1) * gap;
            const cx = (width - rowWidth) / 2 + (i % perRow) * (swatch + gap) + r;
            const cy = row * (swatch + gap) + r;
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
        {THEME_IDS.map((id, i) => (
          <ThemeCard
            key={id}
            id={id}
            selected={id === themeId}
            compact={tablet}
            rowEnd={(i + 1) % (tablet ? THEME_COLS_TABLET : THEME_COLS) === 0}
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
        <GlassButton label="Credits" icon="heart" iconColor={theme.icon.heart} onPress={() => router.push('/credits')} />
        <GlassButton label="Reset progress" icon="trash" iconColor={theme.status.danger} onPress={() => setConfirm(true)} />
      </View>

      <ConfirmDialog
        visible={confirm}
        icon="trash"
        title="Reset progress?"
        message="This erases all your stars, hints and daily streaks. It can't be undone."
        confirmLabel="Reset"
        danger
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          useProgress.getState().reset();
          haptics.warning();
          setConfirm(false);
        }}
      />
    </Screen>
  );
}

const useStyles = makeStyles((t, s) => ({
  themes: { flexDirection: 'row', flexWrap: 'wrap', rowGap: s(10) },
  themeCard: {
    width: '32%',
    padding: s(6),
    borderRadius: s(20),
    borderWidth: 1.5,
    shadowColor: t.box.shadow,
    shadowOpacity: 1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
  },
  themeCardGap: { marginRight: '2%' },
  themeCardRow: { width: '18.8%' },
  themeCardRowGap: { marginRight: '1.5%' },
  themeCardSelected: { borderWidth: 3, padding: s(6) - 1.5 },
  scene: { height: s(76), borderRadius: s(14), overflow: 'hidden' },
  sun: { position: 'absolute', top: s(10), right: '30%', width: s(22), height: s(22), borderRadius: s(11), opacity: 0.85 },
  hill: { position: 'absolute', borderRadius: 999 },
  hillFar: { width: s(170), height: s(170), left: '-30%', bottom: -s(132), opacity: 0.75 },
  hillMid: { width: s(150), height: s(150), right: '-35%', bottom: -s(118), opacity: 0.9 },
  hillNear: { width: s(220), height: s(220), left: '-10%', bottom: -s(200) },
  tree: { position: 'absolute', bottom: s(12), alignItems: 'center' },
  treeSmall: { bottom: s(14) },
  leaf: { width: s(12), height: s(20), borderRadius: s(6) },
  leafSmall: { width: s(10), height: s(15), borderRadius: s(5) },
  trunk: { width: 2, height: s(7), borderRadius: 1 },
  seasonBadge: { position: 'absolute', top: s(8), left: s(8), width: s(26), height: s(26), borderRadius: s(13), alignItems: 'center', justifyContent: 'center' },
  themeInfo: { paddingHorizontal: s(8), paddingTop: s(8), paddingBottom: s(6), gap: 2 },
  themeName: { fontFamily: fonts.title, fontSize: s(17) },
  themeTagline: { fontFamily: fonts.body, fontSize: s(12) },
  themeCheck: { position: 'absolute', top: s(8), right: s(8), width: s(24), height: s(24), borderRadius: s(12), alignItems: 'center', justifyContent: 'center' },
  group: { borderRadius: s(22), backgroundColor: t.box.background, borderWidth: 1, borderColor: t.box.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: s(14), paddingHorizontal: s(16), paddingVertical: s(14) },
  divider: { borderTopWidth: 1, borderTopColor: t.box.border },
  iconWrap: { width: s(36), height: s(36), borderRadius: s(12), alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(t.accent.color, 0.22) },
  label: { fontFamily: fonts.title, fontSize: s(17), color: t.text.primary },
  sub: { fontFamily: fonts.body, fontSize: s(13), color: t.text.secondary },
  section: { fontFamily: fonts.bodyBold, fontSize: s(12), letterSpacing: 2, color: t.text.muted, marginTop: s(22), marginBottom: s(8), textTransform: 'uppercase' },
  palette: { padding: s(16) },
  buttons: { marginTop: s(24), gap: s(12) },
}));
