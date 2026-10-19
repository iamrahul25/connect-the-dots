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

/** One board square showing an obstacle the way the board draws it, so tools and labels match the board. */
export function ObstacleGlyph({ kind, size }: { kind: GlyphKind; size: number }) {
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
      {kind === 'teleporter' && <Gate size={size} />}
      {(kind === 'tunnel' || kind === 'rotator') && <Piece kind={kind} size={size} />}
      {kind === 'lock' && <Key size={size} />}
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
