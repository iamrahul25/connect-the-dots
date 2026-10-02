import React, { memo } from 'react';
import { PixelRatio, View } from 'react-native';
import type { Level } from '@ctd/core';
import { lockColor, teleporterColor, type Palette } from '../theme/config';
import { useTheme } from '../theme/useTheme';
import { HatchedTile } from './HatchedTile';

const EMPTY = 0;
const WALL = 1;
const BRIDGE = 2;

/**
 * Level thumbnail showing only the puzzle layout (dots and obstacles), never the solution,
 * so a solved card can't be used as an answer key. Plain views, no WebGL context.
 */
export const MiniBoard = memo(function MiniBoard({
  level,
  size,
  palette,
}: {
  level: Level;
  size: number;
  palette: Palette;
}) {
  const { board, box } = useTheme();
  const { width: W, height: H } = level.size;
  const pad = Math.max(3, Math.round(size * 0.05));
  // Whole device pixels per cell, so Android's pixel rounding can't make cells drift or overflow.
  const ratio = PixelRatio.get();
  const cell = Math.max(1, Math.floor(((size - pad * 2) / Math.max(W, H)) * ratio)) / ratio;
  const gap = cell > 6 ? 0.5 : 0;
  const outline = Math.max(0.5, Math.min(1, cell * 0.05));

  const kind = new Array<number>(W * H).fill(EMPTY);
  for (const [r, c] of level.walls) kind[r * W + c] = WALL;
  for (const [r, c] of level.bridges) kind[r * W + c] = BRIDGE;
  for (const t of [...(level.tunnels ?? []), ...(level.rotators ?? [])]) kind[t.cell[0] * W + t.cell[1]] = BRIDGE;
  const ring = new Array<string | null>(W * H).fill(null);
  (level.teleporters ?? []).forEach((t, i) => {
    for (const [r, c] of [t.a, t.b]) ring[r * W + c] = teleporterColor(i);
  });
  const lock = new Array<{ color: string; door: boolean } | null>(W * H).fill(null);
  (level.locks ?? []).forEach((l, i) => {
    lock[l.key[0] * W + l.key[1]] = { color: lockColor(i), door: false };
    lock[l.door[0] * W + l.door[1]] = { color: lockColor(i), door: true };
  });
  const dot = new Array<string | null>(W * H).fill(null);
  for (const d of level.dots) {
    const color = palette[d.color % palette.length].dot;
    for (const [r, c] of [d.start, d.end]) dot[r * W + c] = color;
  }

  const bar = Math.max(2, pad * 0.6);
  const warpBars: { left: number; top: number; width: number; height: number }[] = [];
  const lanes: { left: number; top: number; width: number; height: number }[] = [];
  for (const w of level.warps) {
    if (w.axis === 'row') {
      const top = pad + w.index * cell + cell * 0.1;
      warpBars.push({ left: pad - bar - 0.5, top, width: bar, height: cell * 0.8 });
      warpBars.push({ left: pad + W * cell + 0.5, top, width: bar, height: cell * 0.8 });
      lanes.push({ left: pad, top: pad + w.index * cell, width: W * cell, height: cell });
    } else {
      const left = pad + w.index * cell + cell * 0.1;
      warpBars.push({ left, top: pad - bar - 0.5, width: cell * 0.8, height: bar });
      warpBars.push({ left, top: pad + H * cell + 0.5, width: cell * 0.8, height: bar });
      lanes.push({ left: pad + w.index * cell, top: pad, width: cell, height: H * cell });
    }
  }
  const hatch = cell >= 8;

  return (
    <View style={{ width: W * cell + pad * 2, height: H * cell + pad * 2 }}>
      <View
        style={{
          position: 'absolute',
          left: pad,
          top: pad,
          width: W * cell,
          height: H * cell,
          borderRadius: cell * board.cellRadius,
          backgroundColor: box.surface,
          borderWidth: outline,
          borderColor: board.border,
        }}
      />
      <View style={{ position: 'absolute', left: pad, top: pad, width: W * cell, height: H * cell }}>
        {kind.map((k, i) => (
          <View key={i} style={{ position: 'absolute', left: (i % W) * cell, top: Math.floor(i / W) * cell, width: cell, height: cell, padding: gap }}>
            {k === WALL && !dot[i] && hatch ? (
              <HatchedTile size={cell - gap * 2} radius={cell * board.cellRadius} color={board.cellWall} stripe={board.wallStripe} />
            ) : (
              <View
                style={{
                  flex: 1,
                  borderRadius: cell * board.cellRadius,
                  backgroundColor: dot[i] ?? (k === WALL ? board.cellWall : k === BRIDGE ? board.bridgeBox : board.cellEmpty),
                  borderWidth: k === BRIDGE ? Math.max(1, cell * 0.12) : k === EMPTY && !dot[i] ? outline : 0,
                  borderColor: k === BRIDGE ? board.bridgeBorder : board.border,
                }}
              >
                {ring[i] && (
                  <View style={{ flex: 1, margin: cell * 0.12, borderRadius: cell, borderWidth: Math.max(1, cell * 0.14), borderColor: ring[i]! }} />
                )}
                {lock[i] && (
                  <View
                    style={
                      lock[i]!.door
                        ? { flex: 1, borderRadius: cell * board.cellRadius, backgroundColor: lock[i]!.color }
                        : { flex: 1, margin: cell * 0.28, borderRadius: cell, backgroundColor: lock[i]!.color }
                    }
                  />
                )}
              </View>
            )}
          </View>
        ))}
      </View>
      {lanes.map((l, i) => (
        <View key={`l${i}`} style={{ position: 'absolute', ...l, backgroundColor: board.warpTint }} />
      ))}
      {warpBars.map((b, i) => (
        <View key={`w${i}`} style={{ position: 'absolute', ...b, borderRadius: bar, backgroundColor: board.warp }} />
      ))}
    </View>
  );
});
