import React, { memo } from 'react';
import { View } from 'react-native';
import type { Level } from '@ctd/core';
import { withAlpha } from '../board/color';

/** Solved-board thumbnail rendered as a color mosaic (plain views, no WebGL context). */
export const MiniBoard = memo(function MiniBoard({
  level,
  size,
  palette,
}: {
  level: Level;
  size: number;
  palette: readonly string[];
}) {
  const { width: W, height: H } = level.size;
  const cell = size / Math.max(W, H);
  const grid: (string | null)[] = new Array(W * H).fill(null);
  Object.entries(level.solution).forEach(([k, cells]) => {
    const color = palette[level.dots[Number(k)].color % palette.length];
    for (const [r, c] of cells) grid[r * W + c] = color;
  });
  const endpoints = new Set(level.dots.flatMap((d) => [d.start.join(','), d.end.join(',')]));
  return (
    <View style={{ width: W * cell, height: H * cell, flexDirection: 'row', flexWrap: 'wrap' }}>
      {grid.map((color, i) => {
        const key = `${Math.floor(i / W)},${i % W}`;
        return (
          <View
            key={i}
            style={{
              width: cell,
              height: cell,
              padding: cell > 6 ? 0.5 : 0,
            }}
          >
            <View
              style={{
                flex: 1,
                borderRadius: cell * 0.25,
                backgroundColor: color ? (endpoints.has(key) ? color : withAlpha(color, 0.55)) : 'rgba(0,0,0,0.3)',
              }}
            />
          </View>
        );
      })}
    </View>
  );
});
