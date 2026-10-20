import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Canvas } from '@shopify/react-native-skia';
import { useSharedValue } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { HatchedTile } from '../ui/HatchedTile';
import { KeyBadge, KeyMark, keyPath } from '../board/LockMarks';
import { TeleportGate } from '../board/TeleportGate';
import { TurnPiece } from '../board/TurnPiece';
import { lockColor, teleporterColor } from '../theme/config';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export type GlyphKind = 'wall' | 'bridge' | 'warp' | 'teleporter' | 'tunnel' | 'rotator' | 'lock';

/**
 * One board square showing an obstacle the way the board draws it, so tools and labels match the board.
 * `flat` draws every kind with plain views (no WebGL context), for screens that show many at once:
 * browsers only allow a handful of live WebGL contexts.
 */
export function ObstacleGlyph({ kind, size, flat = false }: { kind: GlyphKind; size: number; flat?: boolean }) {
  const { board } = useTheme();
  const radius = size * board.cellRadius;
  if (kind === 'wall') return <HatchedTile size={size} radius={radius} color={board.cellWall} stripe={board.wallStripe} />;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: radius,
        backgroundColor: kind === 'warp' ? board.warpTint : board.cellEmpty,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {kind === 'bridge' && <Bridge size={size} />}
      {kind === 'warp' && <Warp size={size} />}
      {kind === 'teleporter' && (flat ? <FlatGate size={size} /> : <Gate size={size} />)}
      {(kind === 'tunnel' || kind === 'rotator') && (flat ? <FlatPiece kind={kind} size={size} /> : <Piece kind={kind} size={size} />)}
      {kind === 'lock' && (flat ? <FlatKey size={size} /> : <Key size={size} />)}
    </View>
  );
}

function Bridge({ size }: { size: number }) {
  const { board } = useTheme();
  const deck = size * 0.76;
  const rail = { position: 'absolute', top: '16%', bottom: '16%', width: 1, borderRadius: 1, backgroundColor: board.bridgeRail } as const;
  return (
    <View style={{ width: deck, height: deck, borderRadius: size * 0.18, backgroundColor: board.bridgeBox, borderWidth: 1.5, borderColor: board.bridgeBorder }}>
      <View style={[rail, { left: '14%' }]} />
      <View style={[rail, { right: '14%' }]} />
    </View>
  );
}

function Warp({ size }: { size: number }) {
  const { board } = useTheme();
  return (
    <View
      style={{
        width: size * 0.32,
        height: size * 0.8,
        borderRadius: size * 0.16,
        backgroundColor: board.warp,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Ionicons name="chevron-forward" size={size * 0.34} color={board.warpArrow} />
    </View>
  );
}

function Gate({ size }: { size: number }) {
  const clock = useSharedValue(0);
  const pulse = useSharedValue(0.8);
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <TeleportGate x={size / 2} y={size / 2} cell={size} color={teleporterColor(0)} clock={clock} pulse={pulse} reduceMotion />
    </Canvas>
  );
}

function Piece({ kind, size }: { kind: 'tunnel' | 'rotator'; size: number }) {
  const { board } = useTheme();
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <TurnPiece
        kind={kind}
        cx={size / 2}
        cy={size / 2}
        cell={size}
        deck={size * 0.76}
        pathW={size * tokens.pathWidthRatio}
        turn={0}
        reduceMotion
        colors={{ box: board.bridgeBox, border: board.bridgeBorder, shadow: board.bridgeShadow }}
      />
    </Canvas>
  );
}

function FlatGate({ size }: { size: number }) {
  const color = teleporterColor(0);
  const ring = size * 0.66;
  return (
    <View style={{ width: ring, height: ring, borderRadius: ring / 2, borderWidth: size * 0.11, borderColor: color, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: size * 0.16, height: size * 0.16, borderRadius: size, backgroundColor: color }} />
    </View>
  );
}

function FlatPiece({ kind, size }: { kind: 'tunnel' | 'rotator'; size: number }) {
  const { board } = useTheme();
  const deck = size * 0.76;
  const groove = Math.max(2, size * tokens.pathWidthRatio * 0.75);
  const half = deck / 2;
  const bar = { position: 'absolute', backgroundColor: board.bridgeBorder } as const;
  return (
    <View
      style={{
        width: deck,
        height: deck,
        borderRadius: kind === 'tunnel' ? size * 0.18 : half,
        backgroundColor: board.bridgeBox,
        borderWidth: 1.5,
        borderColor: board.bridgeBorder,
        overflow: 'hidden',
      }}
    >
      {kind === 'tunnel' ? (
        <View style={[bar, { left: 0, right: 0, top: half - groove / 2 - 1.5, height: groove }]} />
      ) : (
        <>
          <View style={[bar, { top: 0, height: half - 1.5 + groove / 2, left: half - groove / 2 - 1.5, width: groove }]} />
          <View style={[bar, { right: 0, left: half - groove / 2 - 1.5, top: half - groove / 2 - 1.5, height: groove }]} />
        </>
      )}
    </View>
  );
}

function FlatKey({ size }: { size: number }) {
  const badge = size * 0.72;
  return (
    <View style={{ width: badge, height: badge, borderRadius: badge / 2, backgroundColor: lockColor(0), alignItems: 'center', justifyContent: 'center' }}>
      <Ionicons name="key" size={size * 0.4} color="#FFFFFF" />
    </View>
  );
}

function Key({ size }: { size: number }) {
  const path = useMemo(() => keyPath(size / 2, size / 2, size), [size]);
  const color = lockColor(0);
  return (
    <Canvas style={{ width: size, height: size }} pointerEvents="none">
      <KeyBadge x={size / 2} y={size / 2} cell={size} color={color} />
      <KeyMark path={path} cell={size} color={color} />
    </Canvas>
  );
}
