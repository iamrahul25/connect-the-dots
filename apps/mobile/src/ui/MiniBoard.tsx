import React, { memo } from 'react';
import { View } from 'react-native';
import type { Level } from '@ctd/core';
import type { Palette } from '../theme/config';
import { useTheme } from '../theme/useTheme';

const EMPTY = 0;
const WALL = 1;
const BRIDGE = 2;

/**
 * Level thumbnail showing only the puzzle layout (dots, walls, bridges, warps), never the solution,
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
  const { board } = useTheme();
  const { width: W, height: H } = level.size;
  const pad = Math.max(3, Math.round(size * 0.05));
  const cell = (size - pad * 2) / Math.max(W, H);
  const gap = cell > 6 ? 0.5 : 0;

  const kind = new Array<number>(W * H).fill(EMPTY);
  for (const [r, c] of level.walls) kind[r * W + c] = WALL;
  for (const [r, c] of level.bridges) kind[r * W + c] = BRIDGE;
  const dot = new Array<string | null>(W * H).fill(null);
  for (const d of level.dots) {
    const color = palette[d.color % palette.length].dot;
    for (const [r, c] of [d.start, d.end]) dot[r * W + c] = color;
  }

  const bar = Math.max(1.5, pad * 0.45);
  const warpBars: { left: number; top: number; width: number; height: number }[] = [];
  for (const w of level.warps) {
    if (w.axis === 'row') {
      const top = pad + w.index * cell + cell * 0.18;
      warpBars.push({ left: pad - bar - 1, top, width: bar, height: cell * 0.64 });
      warpBars.push({ left: pad + W * cell + 1, top, width: bar, height: cell * 0.64 });
    } else {
      const left = pad + w.index * cell + cell * 0.18;
      warpBars.push({ left, top: pad - bar - 1, width: cell * 0.64, height: bar });
      warpBars.push({ left, top: pad + H * cell + 1, width: cell * 0.64, height: bar });
    }
  }

  return (
    <View style={{ width: W * cell + pad * 2, height: H * cell + pad * 2 }}>
      <View style={{ position: 'absolute', left: pad, top: pad, width: W * cell, height: H * cell, flexDirection: 'row', flexWrap: 'wrap' }}>
        {kind.map((k, i) => (
          <View key={i} style={{ width: cell, height: cell, padding: gap }}>
            <View
              style={{
                flex: 1,
                borderRadius: cell * board.cellRadius,
                backgroundColor: dot[i] ?? (k === WALL ? board.cellWall : board.cellEmpty),
                borderWidth: k === BRIDGE ? Math.max(0.75, cell * 0.1) : 0,
                borderColor: board.bridgeBorder,
              }}
            />
          </View>
        ))}
      </View>
      {warpBars.map((b, i) => (
        <View key={`w${i}`} style={{ position: 'absolute', ...b, borderRadius: bar, backgroundColor: board.warp }} />
      ))}
    </View>
  );
});
