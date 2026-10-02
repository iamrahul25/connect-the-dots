import React, { useEffect } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { Puzzle } from '@ctd/core';
import { GlassButton } from '../ui/GlassButton';
import { HatchedTile } from '../ui/HatchedTile';
import { fonts, tokens } from '../theme/tokens';
import type { DotStyle, Palette } from '../theme/config';
import { makeStyles, useTheme } from '../theme/useTheme';

export type ObstacleKind = 'walls' | 'bridges' | 'warps';

const KINDS: ObstacleKind[] = ['walls', 'bridges', 'warps'];

const INFO: Record<ObstacleKind, { name: string; looks: string; rule: string }> = {
  walls: {
    name: 'Walls',
    looks: 'Dark tiles with diagonal stripes.',
    rule: 'Flows can’t pass through them, so route around. Walls don’t need filling.',
  },
  bridges: {
    name: 'Bridges',
    looks: 'Raised tiles with a bold outline and side rails.',
    rule: 'Two flows cross here: one straight across, one straight over. No turning on a bridge, and both lanes must be filled.',
  },
  warps: {
    name: 'Warps',
    looks: 'Glowing gates with arrows at both ends of a tinted row or column.',
    rule: 'Drag a flow off one bar and it re-enters from the matching bar on the other side.',
  },
};

export function obstaclesIn(puzzle: Puzzle): ObstacleKind[] {
  return KINDS.filter((k) => puzzle[k].length > 0);
}

interface Props {
  puzzle: Puzzle;
  palette: Palette;
  onClose: () => void;
}

/** Explains the level's obstacles, each with a mini board showing how it is drawn. */
export function ObstacleInfo({ puzzle, palette, onClose }: Props) {
  const styles = useStyles();
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
const WARP_T = 8;
const WARP_GLOW = 3;
type Pt = [row: number, col: number];

function Plate({ rows, cols, children }: { rows: number; cols: number; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={[styles.plate, { width: cols * C + PAD * 2, height: rows * C + PAD * 2 }]}>
      <View style={{ position: 'absolute', left: PAD, top: PAD, width: cols * C, height: rows * C }}>{children}</View>
    </View>
  );
}

function Tiles({ rows, cols, walls = [] }: { rows: number; cols: number; walls?: Pt[] }) {
  const styles = useStyles();
  const { board } = useTheme();
  const out: React.ReactNode[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const pos = { position: 'absolute', left: c * C + 1.5, top: r * C + 1.5 } as const;
      out.push(
        walls.some(([wr, wc]) => wr === r && wc === c) ? (
          <HatchedTile key={`${r}-${c}`} size={C - 3} radius={C * board.cellRadius} color={board.cellWall} stripe={board.wallStripe} style={pos} />
        ) : (
          <View key={`${r}-${c}`} style={[styles.tile, pos]} />
        ),
      );
    }
  }
  return <>{out}</>;
}

function Pipe({ from, to, color }: { from: Pt; to: Pt; color: DotStyle }) {
  const { board } = useTheme();
  const w = C * tokens.pathWidthRatio;
  const x1 = (Math.min(from[1], to[1]) + 0.5) * C;
  const x2 = (Math.max(from[1], to[1]) + 0.5) * C;
  const y1 = (Math.min(from[0], to[0]) + 0.5) * C;
  const y2 = (Math.max(from[0], to[0]) + 0.5) * C;
  return (
    <View
      style={{
        position: 'absolute',
        left: x1 - w / 2,
        top: y1 - w / 2,
        width: x2 - x1 + w,
        height: y2 - y1 + w,
        borderRadius: w / 2,
        backgroundColor: color.line,
        opacity: board.lineOpacity,
      }}
    />
  );
}

function Dot({ at, color }: { at: Pt; color: DotStyle }) {
  const d = C * tokens.dotRatio;
  return (
    <View
      style={{
        position: 'absolute',
        left: (at[1] + 0.5) * C - d / 2,
        top: (at[0] + 0.5) * C - d / 2,
        width: d,
        height: d,
        borderRadius: d / 2,
        backgroundColor: color.dot,
      }}
    />
  );
}

function WallPreview({ color }: { color: DotStyle }) {
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

function BridgePreview({ across, over }: { across: DotStyle; over: DotStyle }) {
  const styles = useStyles();
  return (
    <Plate rows={3} cols={3}>
      <Tiles rows={3} cols={3} />
      <Pipe from={[1, 0]} to={[1, 2]} color={across} />
      <View style={[styles.bridge, styles.bridgeShadow]} />
      <View style={styles.bridge}>
        <View style={[styles.rail, { left: '14%' }]} />
        <View style={[styles.rail, { right: '14%' }]} />
      </View>
      <Pipe from={[0, 1]} to={[2, 1]} color={over} />
      <Dot at={[1, 0]} color={across} />
      <Dot at={[1, 2]} color={across} />
      <Dot at={[0, 1]} color={over} />
      <Dot at={[2, 1]} color={over} />
    </Plate>
  );
}

function WarpPreview({ color }: { color: DotStyle }) {
  const styles = useStyles();
  const { board } = useTheme();
  return (
    <Plate rows={1} cols={4}>
      <Tiles rows={1} cols={4} />
      <View style={styles.lane} />
      {(['left', 'right'] as const).map((side) => (
        <View key={side} style={[styles.warpGlow, { left: (side === 'left' ? -4 : 4 * C + 4) - WARP_T / 2 - WARP_GLOW }]}>
          <View style={styles.warp}>
            <Ionicons name={side === 'left' ? 'chevron-back' : 'chevron-forward'} size={WARP_T + 2} color={board.warpArrow} />
          </View>
        </View>
      ))}
      <Pipe from={[0, 2]} to={[0, 3.25]} color={color} />
      <Pipe from={[0, -0.25]} to={[0, 0]} color={color} />
      <Dot at={[0, 2]} color={color} />
      <Dot at={[0, 0]} color={color} />
    </Plate>
  );
}

const useStyles = makeStyles((t) => ({
  backdrop: { backgroundColor: t.box.overlay },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '90%',
    borderRadius: 28,
    padding: 22,
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
  title: { fontFamily: fonts.titleBold, fontSize: 28, color: t.text.primary },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: t.text.secondary, marginBottom: 16, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 12,
    borderRadius: 18,
    backgroundColor: t.box.background,
    borderWidth: 1,
    borderColor: t.box.border,
  },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  name: { fontFamily: fonts.title, fontSize: 18, color: t.text.primary },
  count: { fontFamily: fonts.bodyBold, fontSize: 13, color: t.text.secondary },
  looks: { fontFamily: fonts.bodyBold, fontSize: 13, color: t.board.warp, marginTop: 2 },
  rule: { fontFamily: fonts.body, fontSize: 13, color: t.text.secondary, marginTop: 2 },
  plate: { borderRadius: 12, backgroundColor: t.background.color },
  tile: {
    position: 'absolute',
    width: C - 3,
    height: C - 3,
    borderRadius: C * t.board.cellRadius,
    backgroundColor: t.board.cellEmpty,
  },
  bridge: {
    position: 'absolute',
    left: C + C * 0.12,
    top: C + C * 0.12,
    width: C * 0.76,
    height: C * 0.76,
    borderRadius: C * 0.18,
    backgroundColor: t.board.bridgeBox,
    borderWidth: 2.5,
    borderColor: t.board.bridgeBorder,
  },
  bridgeShadow: { top: C + C * 0.12 + 2, backgroundColor: t.board.bridgeShadow, borderWidth: 0 },
  rail: { position: 'absolute', top: '16%', bottom: '16%', width: 1.5, borderRadius: 1, backgroundColor: t.board.bridgeRail },
  lane: { position: 'absolute', left: 1.5, top: 1.5, width: 4 * C - 3, height: C - 3, borderRadius: C * t.board.cellRadius, backgroundColor: t.board.warpTint },
  warpGlow: { position: 'absolute', top: C * 0.1 - WARP_GLOW, padding: WARP_GLOW, borderRadius: WARP_T, backgroundColor: t.board.warpGlow },
  warp: { width: WARP_T, height: C * 0.8, borderRadius: WARP_T / 2, backgroundColor: t.board.warp, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
}));
