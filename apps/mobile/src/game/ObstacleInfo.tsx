import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import type { Puzzle } from '@ctd/core';
import { GlassButton } from '../ui/GlassButton';
import { colors, fonts, tokens } from '../theme/tokens';
import { flowStyle } from '../theme/themes';
import { withAlpha } from '../board/color';

export type ObstacleKind = 'walls' | 'bridges' | 'warps';

const KINDS: ObstacleKind[] = ['walls', 'bridges', 'warps'];

const INFO: Record<ObstacleKind, { name: string; looks: string; rule: string }> = {
  walls: {
    name: 'Walls',
    looks: 'Dark, sunken tiles with no glass surface.',
    rule: 'Flows can’t pass through them, so route around. Walls don’t need filling.',
  },
  bridges: {
    name: 'Bridges',
    looks: 'Raised glass tiles with a bright outline.',
    rule: 'Two flows cross here: one straight across, one straight over. No turning on a bridge, and both lanes must be filled.',
  },
  warps: {
    name: 'Warps',
    looks: 'Glowing cyan bars on opposite edges of a row or column.',
    rule: 'Drag a flow off one bar and it re-enters from the matching bar on the other side.',
  },
};

export function obstaclesIn(puzzle: Puzzle): ObstacleKind[] {
  return KINDS.filter((k) => puzzle[k].length > 0);
}

interface Props {
  puzzle: Puzzle;
  palette: readonly string[];
  onClose: () => void;
}

/** Explains the level's obstacles, each with a mini board showing how it is drawn. */
export function ObstacleInfo({ puzzle, palette, onClose }: Props) {
  const backdrop = useSharedValue(0);
  const card = useSharedValue(0);
  useEffect(() => {
    backdrop.value = withTiming(1, { duration: 220 });
    card.value = withSpring(1, { damping: 16, stiffness: 170 });
  }, [backdrop, card]);
  const backdropStyle = useAnimatedStyle(() => ({ opacity: backdrop.value }));
  const cardStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, card.value * 1.5),
    transform: [{ translateY: (1 - card.value) * 120 }, { scale: 0.94 + 0.06 * card.value }],
  }));

  const kinds = obstaclesIn(puzzle);
  const color = (i: number) => palette[i % palette.length];

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close obstacle info" />
      </Animated.View>
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View style={[styles.card, cardStyle]}>
          <Text style={styles.title}>Obstacles</Text>
          <Text style={styles.subtitle}>Found in this level</Text>
          <ScrollView style={{ alignSelf: 'stretch' }} contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
            {kinds.map((k) => (
              <View key={k} style={styles.row}>
                {k === 'walls' && <WallPreview color={color(0)} />}
                {k === 'bridges' && <BridgePreview across={color(1)} over={color(2)} />}
                {k === 'warps' && <WarpPreview color={color(3)} />}
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{INFO[k].name}</Text>
                    <Text style={styles.count}>×{puzzle[k].length}</Text>
                  </View>
                  <Text style={styles.looks}>{INFO[k].looks}</Text>
                  <Text style={styles.rule}>{INFO[k].rule}</Text>
                </View>
              </View>
            ))}
          </ScrollView>
          <GlassButton label="Got it" onPress={onClose} style={{ alignSelf: 'stretch', marginTop: 16 }} />
        </Animated.View>
      </View>
    </View>
  );
}

// ---- Mini board previews: plain views mirroring the Skia board styling -------

const C = 28;
const PAD = 12;
type Pt = [row: number, col: number];

function Plate({ rows, cols, children }: { rows: number; cols: number; children: React.ReactNode }) {
  return (
    <View style={[styles.plate, { width: cols * C + PAD * 2, height: rows * C + PAD * 2 }]}>
      <View style={{ position: 'absolute', left: PAD, top: PAD, width: cols * C, height: rows * C }}>{children}</View>
    </View>
  );
}

function Tiles({ rows, cols, walls = [] }: { rows: number; cols: number; walls?: Pt[] }) {
  const out: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const wall = walls.some(([wr, wc]) => wr === r && wc === c);
      out.push(
        <View key={`${r}-${c}`} style={[styles.tile, { left: c * C + 1.5, top: r * C + 1.5 }, wall && styles.wall]}>
          {wall && <View style={styles.wallInner} />}
        </View>,
      );
    }
  }
  return <>{out}</>;
}

function Pipe({ from, to, color }: { from: Pt; to: Pt; color: string }) {
  const f = flowStyle(color);
  const x1 = (Math.min(from[1], to[1]) + 0.5) * C;
  const x2 = (Math.max(from[1], to[1]) + 0.5) * C;
  const y1 = (Math.min(from[0], to[0]) + 0.5) * C;
  const y2 = (Math.max(from[0], to[0]) + 0.5) * C;
  const layer = (w: number, bg: string, opacity = 1) => (
    <View
      style={{
        position: 'absolute',
        left: x1 - w / 2,
        top: y1 - w / 2,
        width: x2 - x1 + w,
        height: y2 - y1 + w,
        borderRadius: w / 2,
        backgroundColor: bg,
        opacity,
      }}
    />
  );
  const w = C * tokens.pathWidthRatio;
  return (
    <>
      {layer(w, f.pipeShadow)}
      {layer(w * 0.76, f.pipe)}
      {layer(w * 0.22, f.pipeHighlight, 0.6)}
    </>
  );
}

function Dot({ at, color }: { at: Pt; color: string }) {
  const f = flowStyle(color);
  const d = C * tokens.dotRatio;
  return (
    <View
      style={[
        styles.dot,
        { left: (at[1] + 0.5) * C - d / 2, top: (at[0] + 0.5) * C - d / 2, width: d, height: d, backgroundColor: f.base, borderColor: f.bright, shadowColor: f.glow },
      ]}
    >
      <View style={styles.dotShine} />
    </View>
  );
}

function WallPreview({ color }: { color: string }) {
  return (
    <Plate rows={3} cols={3}>
      <Tiles rows={3} cols={3} walls={[[1, 1]]} />
      <Pipe from={[1, 0]} to={[0, 0]} color={color} />
      <Pipe from={[0, 0]} to={[0, 2]} color={color} />
      <Pipe from={[0, 2]} to={[1, 2]} color={color} />
      <Dot at={[1, 0]} color={color} />
      <Dot at={[1, 2]} color={color} />
    </Plate>
  );
}

function BridgePreview({ across, over }: { across: string; over: string }) {
  return (
    <Plate rows={3} cols={3}>
      <Tiles rows={3} cols={3} />
      <Pipe from={[1, 0]} to={[1, 2]} color={across} />
      <View style={styles.bridge} />
      <Pipe from={[0, 1]} to={[2, 1]} color={over} />
      <Dot at={[1, 0]} color={across} />
      <Dot at={[1, 2]} color={across} />
      <Dot at={[0, 1]} color={over} />
      <Dot at={[2, 1]} color={over} />
    </Plate>
  );
}

function WarpPreview({ color }: { color: string }) {
  const bar = { top: C * 0.18, height: C * 0.64 };
  return (
    <Plate rows={1} cols={4}>
      <Tiles rows={1} cols={4} />
      <View style={[styles.warp, bar, { left: -9 }]} />
      <View style={[styles.warp, bar, { left: 4 * C + 3 }]} />
      <Pipe from={[0, 2]} to={[0, 3.25]} color={color} />
      <Pipe from={[0, -0.25]} to={[0, 0]} color={color} />
      <Dot at={[0, 2]} color={color} />
      <Dot at={[0, 0]} color={color} />
    </Plate>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: colors.overlay },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    borderRadius: 28,
    padding: 22,
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    shadowColor: colors.board.shadow,
    shadowOpacity: 0.5,
    shadowRadius: 30,
    shadowOffset: { width: 0, height: 16 },
    elevation: 12,
  },
  title: { fontFamily: fonts.titleBold, fontSize: 28, color: colors.text },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: colors.textDim, marginBottom: 16, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: 18,
    backgroundColor: colors.glass,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  name: { fontFamily: fonts.title, fontSize: 18, color: colors.text },
  count: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.textDim },
  looks: { fontFamily: fonts.bodyBold, fontSize: 13, color: colors.warp, marginTop: 2 },
  rule: { fontFamily: fonts.body, fontSize: 13, color: colors.textDim, marginTop: 2 },
  plate: {
    borderRadius: 12,
    backgroundColor: colors.board.bg,
    borderWidth: 1.5,
    borderColor: colors.board.border,
  },
  tile: {
    position: 'absolute',
    width: C - 3,
    height: C - 3,
    borderRadius: C * 0.2,
    backgroundColor: colors.cell.base,
    borderWidth: 1,
    borderColor: colors.cell.border,
  },
  wall: { backgroundColor: withAlpha(colors.board.shadow, 0.85), borderWidth: 0, alignItems: 'center', justifyContent: 'center' },
  wallInner: { width: '76%', height: '76%', borderRadius: C * 0.14, backgroundColor: withAlpha(colors.cell.border, 0.25) },
  bridge: {
    position: 'absolute',
    left: C + C * 0.14,
    top: C + C * 0.14,
    width: C * 0.72,
    height: C * 0.72,
    borderRadius: C * 0.16,
    backgroundColor: withAlpha(colors.board.bg, 0.72),
    borderWidth: 1.2,
    borderColor: colors.board.borderHighlight,
  },
  warp: {
    position: 'absolute',
    width: 6,
    borderRadius: 3,
    backgroundColor: colors.warp,
    shadowColor: colors.warp,
    shadowOpacity: 0.9,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  dot: {
    position: 'absolute',
    borderRadius: 999,
    borderWidth: 1,
    shadowOpacity: 0.8,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 0 },
  },
  dotShine: { position: 'absolute', left: '22%', top: '18%', width: '26%', height: '26%', borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.6)' },
});
