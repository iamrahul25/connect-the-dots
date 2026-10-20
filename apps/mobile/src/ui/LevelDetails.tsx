import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { mechanicsOf, obstacleCount, type MechanicsCount } from '@ctd/core';
import { getLevel, manifest, type Pack } from '../data/levels';
import { fonts } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/useTheme';
import { useScale } from '../theme/scale';
import { haptics } from '../services/haptics';
import { withAlpha } from '../board/color';

interface LevelRow {
  id: string;
  number: number;
  width: number;
  height: number;
  colors: number;
  obstacles: MechanicsCount;
  total: number;
}

type Column = { label: string; width: number; help: string; value: (r: LevelRow) => string | number; dimZero?: boolean };

const OBSTACLE_COLUMNS: [keyof MechanicsCount, string, number, string][] = [
  ['walls', 'Walls', 46, 'Blocked cells that flows must route around.'],
  ['bridges', 'Bridges', 56, 'Cells where two flows cross straight over each other.'],
  ['warps', 'Warps', 48, 'Rows or columns whose edges wrap around to the opposite side.'],
  ['teleporters', 'Teleporters', 76, 'Portal pairs: a flow entering one exits from its twin.'],
  ['tunnels', 'Tunnels', 54, 'Tappable pieces with a straight groove.'],
  ['rotators', 'Rotators', 60, 'Tappable dials with an L-shaped corner groove.'],
  ['locks', 'Keys', 40, 'Key and door pairs: the door opens once a flow runs through its key.'],
];

const COLUMNS: Column[] = [
  { label: 'Level', width: 44, help: 'Level number within the pack.', value: (r) => r.number },
  { label: 'Grid', width: 54, help: 'Board size, width × height in cells.', value: (r) => `${r.width}×${r.height}` },
  { label: 'Colors', width: 50, help: 'Number of color pairs to connect.', value: (r) => r.colors },
  ...OBSTACLE_COLUMNS.map(([key, label, width, help]): Column => ({ label, width, help, value: (r) => r.obstacles[key] ?? 0, dimZero: true })),
  { label: 'Total', width: 44, help: 'All obstacles in the level added together.', value: (r) => r.total, dimZero: true },
];

function rowsOf(pack: Pack): LevelRow[] {
  return pack.levels.flatMap((id, i) => {
    const level = getLevel(id);
    if (!level) return [];
    return [
      {
        id,
        number: i + 1,
        width: level.size.width,
        height: level.size.height,
        colors: level.dots.length,
        obstacles: mechanicsOf(level),
        total: obstacleCount(level),
      },
    ];
  });
}

const range = (values: number[]) => {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return lo === hi ? `${lo}` : `${lo}–${hi}`;
};

function packSummary(rows: LevelRow[]): string {
  if (rows.length === 0) return 'No levels';
  const bySize = [...rows].sort((a, b) => a.width * a.height - b.width * b.height);
  const grid = (r: LevelRow) => `${r.width}×${r.height}`;
  const small = grid(bySize[0]);
  const large = grid(bySize[bySize.length - 1]);
  return [`${rows.length} levels`, small === large ? small : `${small}–${large}`, `${range(rows.map((r) => r.colors))} colors`, `${range(rows.map((r) => r.total))} obstacles`].join(' · ');
}

function PackTable({ pack }: { pack: Pack }) {
  const theme = useTheme();
  const styles = useStyles();
  const { s } = useScale();
  const [open, setOpen] = useState(false);
  const rows = useMemo(() => rowsOf(pack), [pack]);
  const [viewW, setViewW] = useState(0);
  // Column widths are minimums; spare width is shared out in proportion so the table fills the card.
  const cell = (c: Column) => ({ flexBasis: s(c.width), flexGrow: c.width, flexShrink: 0 });

  return (
    <View>
      <Pressable
        onPress={() => {
          haptics.selection();
          setOpen((o) => !o);
        }}
        style={({ pressed }) => [styles.packHeader, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={pack.name}
      >
        <View style={{ flex: 1 }}>
          <Text style={styles.packTitle}>{pack.name}</Text>
          <Text style={styles.packSub}>{packSummary(rows)}</Text>
        </View>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={s(18)} color={theme.text.muted} />
      </Pressable>
      {open && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          onLayout={(e) => setViewW(e.nativeEvent.layout.width)}
          contentContainerStyle={[styles.tableContent, { minWidth: viewW }]}
        >
          <View style={{ flexGrow: 1 }}>
            <View style={[styles.tr, styles.thead]}>
              {COLUMNS.map((c) => (
                <Text key={c.label} style={[styles.th, cell(c)]} numberOfLines={1}>
                  {c.label}
                </Text>
              ))}
            </View>
            {rows.map((r, i) => (
              <View key={r.id} style={[styles.tr, i % 2 === 1 && styles.zebra]}>
                {COLUMNS.map((c) => {
                  const v = c.value(r);
                  return (
                    <Text key={c.label} style={[styles.td, cell(c), c.dimZero && v === 0 && styles.dim]} numberOfLines={1}>
                      {v}
                    </Text>
                  );
                })}
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

/** What each table column means. */
export function LevelDetailsLegend() {
  const styles = useStyles();
  return (
    <View style={[styles.group, styles.legend]}>
      <Text style={styles.legendIntro}>
        Each pack has its own table with one row per level. Tap a pack to open it. On narrow screens, swipe the table sideways to see every column. A dimmed 0 means the level has none of that obstacle.
      </Text>
      {COLUMNS.map((c) => (
        <View key={c.label} style={styles.legendRow}>
          <Text style={styles.legendName}>{c.label}</Text>
          <Text style={styles.legendHelp}>{c.help}</Text>
        </View>
      ))}
    </View>
  );
}

/** Every pack's levels as collapsible tables, grouped by suite: grid size, color count and obstacle counts. */
export function LevelDetails() {
  const styles = useStyles();
  return (
    <View style={styles.suites}>
      {manifest.suites.map((suite) => (
        <View key={suite.id} style={styles.suite}>
          <Text style={styles.suiteTitle}>{suite.name}</Text>
          <View style={styles.group}>
            {suite.packs.length === 0 && <Text style={[styles.packSub, styles.emptySuite]}>No packs yet</Text>}
            {suite.packs.map((p, i) => (
              <View key={p.id} style={i > 0 && styles.divider}>
                <PackTable pack={p} />
              </View>
            ))}
          </View>
        </View>
      ))}
    </View>
  );
}

const useStyles = makeStyles((t, s) => ({
  suites: { gap: s(18) },
  suite: { gap: s(8) },
  suiteTitle: { fontFamily: fonts.bodyBold, fontSize: s(13), color: t.text.secondary, textTransform: 'uppercase', letterSpacing: 1.5, marginLeft: s(6) },
  emptySuite: { padding: s(16), textAlign: 'center' },
  group: { borderRadius: s(22), backgroundColor: t.box.background, borderWidth: 1, borderColor: t.box.border, overflow: 'hidden' },
  divider: { borderTopWidth: 1, borderTopColor: t.box.border },
  packHeader: { flexDirection: 'row', alignItems: 'center', gap: s(12), paddingHorizontal: s(16), paddingVertical: s(12) },
  packTitle: { fontFamily: fonts.title, fontSize: s(17), color: t.text.primary },
  packSub: { fontFamily: fonts.body, fontSize: s(13), color: t.text.secondary },
  tableContent: { paddingHorizontal: s(8), paddingBottom: s(10) },
  tr: { flexDirection: 'row', alignItems: 'center', paddingVertical: s(6), borderRadius: s(8) },
  thead: { borderBottomWidth: 1, borderBottomColor: t.box.border, borderRadius: 0 },
  zebra: { backgroundColor: withAlpha(t.text.primary, 0.05) },
  th: { fontFamily: fonts.bodyBold, fontSize: s(12), color: t.text.secondary, textAlign: 'center' },
  td: { fontFamily: fonts.body, fontSize: s(13), color: t.text.primary, textAlign: 'center' },
  dim: { color: t.text.muted, opacity: 0.6 },
  legend: { padding: s(16), gap: s(8) },
  legendIntro: { fontFamily: fonts.body, fontSize: s(13), color: t.text.secondary, marginBottom: s(4) },
  legendRow: { flexDirection: 'row', gap: s(10) },
  legendName: { width: s(88), fontFamily: fonts.bodyBold, fontSize: s(13), color: t.text.primary },
  legendHelp: { flex: 1, fontFamily: fonts.body, fontSize: s(13), color: t.text.secondary },
}));
