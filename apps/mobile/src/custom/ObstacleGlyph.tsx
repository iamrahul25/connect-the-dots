import React, { useMemo } from 'react';
import { Image, View } from 'react-native';
import { Canvas, drawAsPicture, Group, Path, RoundedRect, Skia } from '@shopify/react-native-skia';
import { useSharedValue } from 'react-native-reanimated';
import { bakedPixels, useBakedImage } from '../ui/bakedImage';
import { HatchedTile } from '../ui/HatchedTile';
import { KeyBadge, KeyMark, keyPath } from '../board/LockMarks';
import { TeleportGate } from '../board/TeleportGate';
import { TurnPiece } from '../board/TurnPiece';
import { lockColor, teleporterColor, type UiTheme } from '../theme/config';
import { tokens } from '../theme/tokens';
import { useTheme } from '../theme/useTheme';

export type GlyphKind = 'wall' | 'bridge' | 'warp' | 'teleporter' | 'tunnel' | 'rotator' | 'lock';

type BoardColors = UiTheme['board'];

/** Art is drawn at a board-like cell size and scaled, so stroke minimums keep the board's proportions at any size. */
const REF = 48;

/**
 * One board square showing an obstacle the way the board draws it, so tools and labels match the board.
 * `baked` renders it once into a cached image instead of a live canvas, for screens that show many at once:
 * browsers only allow a handful of live WebGL contexts.
 */
export function ObstacleGlyph({ kind, size, baked = false }: { kind: GlyphKind; size: number; baked?: boolean }) {
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
        overflow: 'hidden',
      }}
    >
      {baked ? (
        <BakedArt kind={kind} size={size} board={board} />
      ) : (
        <Canvas style={{ width: size, height: size }} pointerEvents="none">
          <Group transform={[{ scale: size / REF }]}>
            <GlyphArt kind={kind} board={board} />
          </Group>
        </Canvas>
      )}
    </View>
  );
}

/** The obstacle drawn with the board's own pieces, in a REF-sized cell. */
function GlyphArt({ kind, board }: { kind: Exclude<GlyphKind, 'wall'>; board: BoardColors }) {
  const clock = useSharedValue(0);
  const pulse = useSharedValue(0.8);
  const c = REF / 2;
  const pieceColors = { box: board.bridgeBox, border: board.bridgeBorder, shadow: board.bridgeShadow };
  switch (kind) {
    case 'bridge':
      return <BridgeArt board={board} />;
    case 'warp':
      return <WarpArt board={board} />;
    case 'teleporter':
      return <TeleportGate x={c} y={c} cell={REF} color={teleporterColor(0)} clock={clock} pulse={pulse} reduceMotion />;
    case 'tunnel':
    case 'rotator':
      return (
        <TurnPiece kind={kind} cx={c} cy={c} cell={REF} deck={REF * 0.76} pathW={REF * tokens.pathWidthRatio} turn={0} reduceMotion colors={pieceColors} />
      );
    case 'lock':
      return <KeyArt />;
  }
}

function BridgeArt({ board }: { board: BoardColors }) {
  const deck = REF * 0.76;
  const inset = (REF - deck) / 2;
  const corner = REF * 0.18;
  const rails = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    for (const f of [0.2, 0.8]) {
      b.moveTo(inset + deck * f, inset + deck * 0.16);
      b.lineTo(inset + deck * f, inset + deck * 0.84);
    }
    return b.build();
  }, [inset, deck]);
  return (
    <Group>
      <RoundedRect x={inset} y={inset + REF * 0.07} width={deck} height={deck} r={corner} color={board.bridgeShadow} />
      <RoundedRect x={inset} y={inset} width={deck} height={deck} r={corner} color={board.bridgeBox} />
      <Path path={rails} color={board.bridgeRail} style="stroke" strokeWidth={Math.max(1.5, REF * 0.05)} strokeCap="round" />
      <RoundedRect x={inset} y={inset} width={deck} height={deck} r={corner} color={board.bridgeBorder} style="stroke" strokeWidth={Math.max(2, REF * 0.07)} />
    </Group>
  );
}

/** A warp gate on its tinted lane, with the glow and outward chevron the board frame shows. */
function WarpArt({ board }: { board: BoardColors }) {
  const t = REF * 0.28;
  const len = REF * 0.8;
  const glow = t * 0.45;
  const x = (REF - t) / 2;
  const y = (REF - len) / 2;
  const arrow = useMemo(() => {
    const a = t * 0.3;
    const b = Skia.PathBuilder.Make();
    b.moveTo(REF / 2 - a * 0.5, REF / 2 + a);
    b.lineTo(REF / 2 + a * 0.5, REF / 2);
    b.lineTo(REF / 2 - a * 0.5, REF / 2 - a);
    return b.build();
  }, [t]);
  return (
    <Group>
      <RoundedRect x={x - glow} y={y - glow} width={t + glow * 2} height={len + glow * 2} r={t / 2 + glow} color={board.warpGlow} opacity={0.8} />
      <RoundedRect x={x} y={y} width={t} height={len} r={t / 2} color={board.warp} />
      <Path path={arrow} color={board.warpArrow} style="stroke" strokeWidth={Math.max(1.2, t * 0.18)} strokeCap="round" strokeJoin="round" />
    </Group>
  );
}

function KeyArt() {
  const path = useMemo(() => keyPath(REF / 2, REF / 2, REF), []);
  const color = lockColor(0);
  return (
    <Group>
      <KeyBadge x={REF / 2} y={REF / 2} cell={REF} color={color} />
      <KeyMark path={path} cell={REF} color={color} />
    </Group>
  );
}

// ---- Baked: drawn once into a cached image instead of a live canvas ----

const glyphKey = (kind: GlyphKind, px: number, board: BoardColors) =>
  ['glyph', kind, px, board.cellEmpty, board.bridgeBox, board.bridgeBorder, board.bridgeShadow, board.bridgeRail, board.warp, board.warpGlow, board.warpArrow].join('|');

function BakedArt({ kind, size, board }: { kind: Exclude<GlyphKind, 'wall'>; size: number; board: BoardColors }) {
  const px = bakedPixels(size);
  const uri = useBakedImage(glyphKey(kind, px, board), px, async (canvas) => {
    const picture = await drawAsPicture(
      <Group transform={[{ scale: px / REF }]}>
        <GlyphArt kind={kind} board={board} />
      </Group>,
    );
    canvas.drawPicture(picture);
    picture.dispose();
  });
  if (!uri) return null;
  return <Image source={{ uri }} style={{ width: size, height: size }} accessibilityIgnoresInvertColors />;
}
