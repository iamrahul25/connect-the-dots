import React, { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { Canvas, Skia, useClock } from '@shopify/react-native-skia';
import { Ionicons } from '@expo/vector-icons';
import type { Puzzle } from '@ctd/core';
import { bakedPixels, useBakedImage } from '../ui/bakedImage';
import { GlassButton } from '../ui/GlassButton';
import { symbolPath } from '../board/symbols';
import { HatchedTile } from '../ui/HatchedTile';
import { ClosedDoor, KeyBadge, KeyMark, keyPath, OpenDoor, padlockPaths } from '../board/LockMarks';
import { TeleportGate } from '../board/TeleportGate';
import { TurnPiece } from '../board/TurnPiece';
import { useSettings } from '../store/settings';
import { fonts, tokens } from '../theme/tokens';
import { lockColor, teleporterColor, type DotStyle, type Palette } from '../theme/config';
import { makeStyles, useTheme } from '../theme/useTheme';
import { C, Flow, FlowHead, TapRipple, useFade, useFlow, useScript, useTap, type FlowControl, type Pt } from './previewMotion';

export type ObstacleKind = 'walls' | 'bridges' | 'warps' | 'teleporters' | 'tunnels' | 'rotators' | 'locks';

export const OBSTACLE_KINDS: ObstacleKind[] = ['walls', 'bridges', 'warps', 'teleporters', 'tunnels', 'rotators', 'locks'];

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
  teleporters: {
    name: 'Teleporters',
    looks: 'Pairs of swirling portals in matching colors.',
    rule: 'Enter one ring and the flow jumps to its twin, then keeps going from there. Works both ways.',
  },
  tunnels: {
    name: 'Tunnels',
    looks: 'A raised piece with a straight groove and a small turn arrow.',
    rule: 'Flows only pass along the groove. Tap it to turn it a quarter; turning it cuts any flow inside.',
  },
  rotators: {
    name: 'Rotators',
    looks: 'A round dial with an L-shaped groove and a small turn arrow.',
    rule: 'Flows turn the corner along the groove. Tap it to rotate it clockwise; rotating cuts any flow inside.',
  },
  locks: {
    name: 'Keys & Doors',
    looks: 'A key on a glowing badge and a padlocked door tile in the same color.',
    rule: 'Connect a flow through the key to open its door. The door must then be filled; breaking that flow locks it again.',
  },
};

export const obstacleName = (k: ObstacleKind) => INFO[k].name;

const countOf = (puzzle: Puzzle, k: ObstacleKind) => (puzzle[k] ?? []).length;

export function obstaclesIn(puzzle: Puzzle): ObstacleKind[] {
  return OBSTACLE_KINDS.filter((k) => countOf(puzzle, k) > 0);
}

interface Props {
  puzzle: Puzzle;
  palette: Palette;
  onClose: () => void;
  /** Shows a button that switches to the full how-to-play guide. */
  onRules?: () => void;
}

/** Explains the level's obstacles, each with a mini board showing how it is drawn. */
export function ObstacleInfo({ puzzle, palette, onClose, onRules }: Props) {
  const styles = useStyles();
  return (
    <InfoSheet
      title="Obstacles"
      subtitle="Found in this level"
      onClose={onClose}
      footer={onRules && <GlassButton label="How to play" icon="help-circle" outlined onPress={onRules} style={styles.footerButton} />}
    >
      {obstaclesIn(puzzle).map((k) => (
        <ObstacleRow key={k} kind={k} palette={palette} count={countOf(puzzle, k)} />
      ))}
    </InfoSheet>
  );
}

/** Centered card over a dimmed backdrop; tapping the backdrop or "Got it" closes it. */
export function InfoSheet({
  title,
  subtitle,
  onClose,
  footer,
  children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  /** Extra button placed beside "Got it". */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
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

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel={`Close ${title.toLowerCase()}`} />
      </Animated.View>
      <View style={styles.center} pointerEvents="box-none">
        <Animated.View style={[styles.card, cardStyle]}>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
          <ScrollView style={{ alignSelf: 'stretch' }} contentContainerStyle={{ gap: 12 }} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
          <View style={styles.footer}>
            {footer}
            <GlassButton label="Got it" onPress={onClose} style={styles.footerButton} />
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

/** One obstacle: its mini board preview beside how it looks and how it plays. */
export function ObstacleRow({ kind: k, palette, count }: { kind: ObstacleKind; palette: Palette; count?: number }) {
  const styles = useStyles();
  const color = (i: number) => inkOf(palette, i);
  return (
    <View style={styles.row}>
      {k === 'walls' && <WallPreview color={color(0)} />}
      {k === 'bridges' && <BridgePreview across={color(1)} over={color(2)} />}
      {k === 'warps' && <WarpPreview color={color(3)} />}
      {k === 'teleporters' && <TeleportPreview color={color(4)} />}
      {k === 'tunnels' && <PiecePreview kind="tunnel" a={color(5)} b={color(1)} />}
      {k === 'rotators' && <PiecePreview kind="rotator" a={color(6)} b={color(2)} />}
      {k === 'locks' && <LockPreview keyColor={color(7)} doorColor={color(4)} />}
      <View style={{ flex: 1 }}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{INFO[k].name}</Text>
          {count !== undefined && <Text style={styles.count}>×{count}</Text>}
        </View>
        <Text style={styles.looks}>{INFO[k].looks}</Text>
        <Text style={styles.rule}>{INFO[k].rule}</Text>
      </View>
    </View>
  );
}

// ---- Mini board previews: plain views mirroring the Skia board styling, each looping a short demo -------

export { C, type Pt };
const PAD = 12;
const WARP_T = 8;
const WARP_GLOW = 3;

const BASICS_A: Pt[][] = [[[0, 0], [0, 2]]];
const BASICS_B: Pt[][] = [[[1, 0], [1, 2], [2, 2], [2, 0]]];
const WALL_BUMP: Pt[][] = [[[1, 0], [1, 0.45]]];
const WALL_ROUTE: Pt[][] = [[[1, 0], [0, 0], [0, 2], [1, 2]]];
const BRIDGE_ACROSS: Pt[][] = [[[1, 0], [1, 2]]];
const BRIDGE_OVER: Pt[][] = [[[0, 1], [2, 1]]];
const WARP_ROUTE: Pt[][] = [[[0, 0], [0, -0.25]], [[0, 3.25], [0, 2]]];
const TELEPORT_ROUTE: Pt[][] = [[[0, 0], [0, 1]], [[0, 3], [0, 4]]];
const TUNNEL_A: Pt[][] = [[[1, 0], [1, 2]]];
const TUNNEL_B: Pt[][] = [[[0, 1], [2, 1]]];
const ROTATOR_A: Pt[][] = [[[2, 1], [1, 1], [1, 2]]];
const ROTATOR_B: Pt[][] = [[[1, 0], [1, 1], [0, 1]]];
const LOCK_KEY: Pt[][] = [[[0, 0], [0, 2]]];
const LOCK_DOOR: Pt[][] = [[[1, 0], [1, 2]]];

const endsOf = (strokes: Pt[][]): Pt[] => [strokes[0][0], strokes[strokes.length - 1][strokes[strokes.length - 1].length - 1]];

/** A flow's two dots and its drag head; placed after every `Flow` line so they sit on top. */
function Ends({ strokes, color, flow, fade }: { strokes: Pt[][]; color: Ink; flow: FlowControl; fade: SharedValue<number> }) {
  return (
    <>
      {endsOf(strokes).map((at, i) => (
        <Dot key={i} at={at} color={color} />
      ))}
      <FlowHead strokes={strokes} color={color} flow={flow} fade={fade} />
    </>
  );
}

/** Two flows drawn one after the other: the core rule of linking each pair. */
export function BasicsPreview({ palette }: { palette: Palette }) {
  const a = useFlow();
  const b = useFlow();
  const { fade, out, show } = useFade();
  const ca = inkOf(palette, 0);
  const cb = inkOf(palette, 1);
  useScript({
    length: 5200,
    steps: [
      [300, () => a.draw(800)],
      [1400, () => b.draw(1400)],
      [4100, () => out()],
    ],
    reset: () => {
      a.set(0);
      b.set(0);
      show();
    },
    final: () => {
      a.set(1);
      b.set(1);
    },
  });
  return (
    <Plate rows={3} cols={3}>
      <Tiles rows={3} cols={3} />
      <Flow strokes={BASICS_A} color={ca} flow={a} fade={fade} />
      <Flow strokes={BASICS_B} color={cb} flow={b} fade={fade} />
      <Ends strokes={BASICS_A} color={ca} flow={a} fade={fade} />
      <Ends strokes={BASICS_B} color={cb} flow={b} fade={fade} />
    </Plate>
  );
}

export function Plate({ rows, cols, children }: { rows: number; cols: number; children: React.ReactNode }) {
  const styles = useStyles();
  return (
    <View style={[styles.plate, { width: cols * C + PAD * 2, height: rows * C + PAD * 2 }]}>
      <View style={{ position: 'absolute', left: PAD, top: PAD, width: cols * C, height: rows * C }}>{children}</View>
    </View>
  );
}

export function Tiles({ rows, cols, walls = [] }: { rows: number; cols: number; walls?: Pt[] }) {
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

/** A palette color plus its index, which picks the dot's colorblind symbol as on the board. */
export type Ink = DotStyle & { symbol: number };
export const inkOf = (palette: Palette, i: number): Ink => ({ ...palette[i % palette.length], symbol: i });

export function Dot({ at, color }: { at: Pt; color: Ink }) {
  const colorblind = useSettings((s) => s.colorblind);
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
    >
      {colorblind && <DotSymbol index={color.symbol} size={d} />}
    </View>
  );
}

function DotSymbol({ index, size }: { index: number; size: number }) {
  const { board } = useTheme();
  const px = bakedPixels(size);
  const uri = useBakedImage(['symbol', index % 12, px, board.colorblindSymbol].join('|'), px, (canvas) => {
    const path = symbolPath(index, px / 2, px / 2, (px / 2) * 0.45);
    const paint = Skia.Paint();
    paint.setAntiAlias(true);
    paint.setColor(Skia.Color(board.colorblindSymbol));
    canvas.drawPath(path, paint);
    paint.dispose();
    path.dispose?.();
  });
  if (!uri) return null;
  return <Image source={{ uri }} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />;
}

/** The flow bumps into the wall, backs off, then routes around it. */
function WallPreview({ color }: { color: Ink }) {
  const bump = useFlow();
  const route = useFlow();
  const { fade, out, show } = useFade();
  useScript({
    length: 5000,
    steps: [
      [300, () => bump.draw(350)],
      [750, () => bump.cut(250)],
      [1200, () => route.draw(1400)],
      [3900, () => out()],
    ],
    reset: () => {
      bump.set(0);
      route.set(0);
      show();
    },
    final: () => route.set(1),
  });
  return (
    <Plate rows={3} cols={3}>
      <Tiles rows={3} cols={3} walls={[[1, 1]]} />
      <Flow strokes={WALL_BUMP} color={color} flow={bump} fade={fade} />
      <Flow strokes={WALL_ROUTE} color={color} flow={route} fade={fade} />
      <Ends strokes={WALL_ROUTE} color={color} flow={route} fade={fade} />
      <FlowHead strokes={WALL_BUMP} color={color} flow={bump} fade={fade} />
    </Plate>
  );
}

/** One flow runs under the bridge, then a second crosses straight over it. */
function BridgePreview({ across, over }: { across: Ink; over: Ink }) {
  const styles = useStyles();
  const a = useFlow();
  const b = useFlow();
  const { fade, out, show } = useFade();
  useScript({
    length: 4400,
    steps: [
      [300, () => a.draw(800)],
      [1400, () => b.draw(800)],
      [3300, () => out()],
    ],
    reset: () => {
      a.set(0);
      b.set(0);
      show();
    },
    final: () => {
      a.set(1);
      b.set(1);
    },
  });
  return (
    <Plate rows={3} cols={3}>
      <Tiles rows={3} cols={3} />
      <Flow strokes={BRIDGE_ACROSS} color={across} flow={a} fade={fade} />
      <View style={[styles.bridge, styles.bridgeShadow]} />
      <View style={styles.bridge}>
        <View style={[styles.rail, { left: '14%' }]} />
        <View style={[styles.rail, { right: '14%' }]} />
      </View>
      <Flow strokes={BRIDGE_OVER} color={over} flow={b} fade={fade} />
      <Ends strokes={BRIDGE_ACROSS} color={across} flow={a} fade={fade} />
      <Ends strokes={BRIDGE_OVER} color={over} flow={b} fade={fade} />
    </Plate>
  );
}

/** The flow leaves through one gate and comes back in through the other. */
function WarpPreview({ color }: { color: Ink }) {
  const styles = useStyles();
  const { board } = useTheme();
  const flow = useFlow();
  const { fade, out, show } = useFade();
  useScript({
    length: 4000,
    steps: [
      [300, () => flow.draw(1500)],
      [2900, () => out()],
    ],
    reset: () => {
      flow.set(0);
      show();
    },
    final: () => flow.set(1),
  });
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
      <Flow strokes={WARP_ROUTE} color={color} flow={flow} fade={fade} />
      <Ends strokes={WARP_ROUTE} color={color} flow={flow} fade={fade} />
    </Plate>
  );
}

/** A Skia layer over the plate's cells, for previews drawn with the board's own components. */
function Sketch({ rows, cols, children }: { rows: number; cols: number; children: React.ReactNode }) {
  return (
    <Canvas style={{ position: 'absolute', left: 0, top: 0, width: cols * C, height: rows * C }} pointerEvents="none">
      {children}
    </Canvas>
  );
}

/** The flow enters one portal and carries on out of its twin. */
function TeleportPreview({ color }: { color: Ink }) {
  const gate = teleporterColor(0);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const clock = useClock();
  const pulse = useDerivedValue(() => (reduceMotion ? 0.8 : 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(clock.value / 450))), [reduceMotion]);
  const flow = useFlow();
  const { fade, out, show } = useFade();
  useScript({
    length: 4000,
    steps: [
      [300, () => flow.draw(1500)],
      [2900, () => out()],
    ],
    reset: () => {
      flow.set(0);
      show();
    },
    final: () => flow.set(1),
  });
  return (
    <Plate rows={1} cols={5}>
      <Tiles rows={1} cols={5} />
      <Sketch rows={1} cols={5}>
        {[1, 3].map((c) => (
          <TeleportGate key={c} x={(c + 0.5) * C} y={0.5 * C} cell={C} color={gate} clock={clock} pulse={pulse} reduceMotion={reduceMotion} />
        ))}
      </Sketch>
      <Flow strokes={TELEPORT_ROUTE} color={color} flow={flow} fade={fade} />
      <Ends strokes={TELEPORT_ROUTE} color={color} flow={flow} fade={fade} />
    </Plate>
  );
}

/**
 * Two flows take turns through the piece: a tap turns it, cutting the flow inside, and the
 * other pair's flow follows the groove. A tunnel lines up with a pair every quarter turn; a
 * rotator (base up + right) links the A pair at one turn and the B pair at three.
 */
function PiecePreview({ kind, a: ca, b: cb }: { kind: 'tunnel' | 'rotator'; a: Ink; b: Ink }) {
  const { board } = useTheme();
  const tunnel = kind === 'tunnel';
  const [A, B] = tunnel ? [TUNNEL_A, TUNNEL_B] : [ROTATOR_A, ROTATOR_B];
  const a = useFlow();
  const b = useFlow();
  const { t, tap } = useTap();
  const [turn, setTurn] = useState(0);
  const { fade } = useFade();
  const rotate = (cut?: FlowControl) => {
    tap();
    setTurn((v) => (v + 1) % (tunnel ? 2 : 4));
    cut?.cut();
  };
  useScript(
    tunnel
      ? {
          length: 4600,
          steps: [
            [400, () => a.draw(800)],
            [1900, () => rotate(a)],
            [2400, () => b.draw(800)],
            [3900, () => rotate(b)],
          ],
          reset: () => {
            a.set(0);
            b.set(0);
            setTurn(0);
          },
          final: () => a.set(1),
        }
      : {
          length: 5600,
          steps: [
            [400, () => rotate()],
            [800, () => a.draw(700)],
            [2300, () => rotate(a)],
            [2900, () => rotate()],
            [3300, () => b.draw(700)],
            [4800, () => rotate(b)],
          ],
          reset: () => {
            a.set(0);
            b.set(0);
            setTurn(0);
          },
          final: () => {
            setTurn(1);
            a.set(1);
          },
        },
  );
  return (
    <Plate rows={3} cols={3}>
      <Tiles rows={3} cols={3} />
      <Sketch rows={3} cols={3}>
        <TurnPiece
          kind={kind}
          cx={1.5 * C}
          cy={1.5 * C}
          cell={C}
          deck={C * 0.76}
          pathW={C * tokens.pathWidthRatio}
          turn={turn}
          reduceMotion={false}
          colors={{ box: board.bridgeBox, border: board.bridgeBorder, shadow: board.bridgeShadow }}
        />
      </Sketch>
      <Flow strokes={A} color={ca} flow={a} fade={fade} />
      <Flow strokes={B} color={cb} flow={b} fade={fade} />
      <Ends strokes={A} color={ca} flow={a} fade={fade} />
      <Ends strokes={B} color={cb} flow={b} fade={fade} />
      <TapRipple at={[1, 1]} t={t} />
    </Plate>
  );
}

/** A flow through the key opens the door, a second flow fills it, and breaking the key flow locks it again. */
function LockPreview({ keyColor, doorColor }: { keyColor: Ink; doorColor: Ink }) {
  const { board } = useTheme();
  const lock = lockColor(0);
  const shapes = useMemo(() => ({ key: keyPath(1.5 * C, 0.5 * C, C), padlock: padlockPaths(1.5 * C, 1.5 * C, C) }), []);
  const door = { x: C + 1.5, y: C + 1.5, width: C - 3, height: C - 3, r: C * board.cellRadius };
  const k = useFlow();
  const d = useFlow();
  const { t, tap } = useTap();
  const { fade } = useFade();
  const [open, setOpen] = useState(false);
  useScript({
    length: 5400,
    steps: [
      [400, () => k.draw(900)],
      [
        1350,
        () => {
          setOpen(true);
          tap();
        },
      ],
      [1900, () => d.draw(900)],
      [3500, () => k.cut(400)],
      [
        3900,
        () => {
          setOpen(false);
          tap();
          d.cut(300);
        },
      ],
    ],
    reset: () => {
      k.set(0);
      d.set(0);
      setOpen(false);
    },
    final: () => {
      setOpen(true);
      k.set(1);
      d.set(1);
    },
  });
  return (
    <Plate rows={2} cols={3}>
      <Tiles rows={2} cols={3} />
      <Sketch rows={2} cols={3}>
        <KeyBadge x={1.5 * C} y={0.5 * C} cell={C} color={lock} />
        {open ? <OpenDoor rect={door} cell={C} color={lock} /> : <ClosedDoor rect={door} cell={C} color={lock} padlock={shapes.padlock} />}
      </Sketch>
      <Flow strokes={LOCK_KEY} color={keyColor} flow={k} fade={fade} />
      <Flow strokes={LOCK_DOOR} color={doorColor} flow={d} fade={fade} />
      <Ends strokes={LOCK_KEY} color={keyColor} flow={k} fade={fade} />
      <Ends strokes={LOCK_DOOR} color={doorColor} flow={d} fade={fade} />
      <Sketch rows={2} cols={3}>
        <KeyMark path={shapes.key} cell={C} color={lock} />
      </Sketch>
      <TapRipple at={[1, 1]} t={t} />
    </Plate>
  );
}

const useStyles = makeStyles((t, s) => ({
  backdrop: { backgroundColor: t.box.overlay },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  card: {
    width: '100%',
    maxWidth: s(440),
    maxHeight: '90%',
    borderRadius: s(28),
    padding: s(22),
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
  footer: { flexDirection: 'row', alignSelf: 'stretch', gap: s(10), marginTop: 16 },
  footerButton: { flex: 1 },
  title: { fontFamily: fonts.titleBold, fontSize: s(28), color: t.text.primary },
  subtitle: { fontFamily: fonts.body, fontSize: s(13), color: t.text.secondary, marginBottom: s(16), textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: s(14),
    padding: s(12),
    borderRadius: s(18),
    backgroundColor: t.box.background,
    borderWidth: 1,
    borderColor: t.box.border,
  },
  nameRow: { flexDirection: 'row', alignItems: 'baseline', gap: s(6) },
  name: { fontFamily: fonts.title, fontSize: s(18), color: t.text.primary },
  count: { fontFamily: fonts.bodyBold, fontSize: s(13), color: t.text.secondary },
  looks: { fontFamily: fonts.bodyBold, fontSize: s(13), color: t.board.warp, marginTop: 2 },
  rule: { fontFamily: fonts.body, fontSize: s(13), color: t.text.secondary, marginTop: 2 },
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
