import React, { useEffect, useMemo } from 'react';
import { Canvas, Circle, Group, Path, RoundedRect, Skia } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { usePalette, useTheme } from '../theme/useTheme';
import { useSettings } from '../store/settings';
import { symbolPath } from '../board/symbols';

const CELL = 34;
/** Palette index and cells (column, row) of each logo flow. */
const PATHS: { color: number; cells: [number, number][] }[] = [
  { color: 0, cells: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 2]] },
  { color: 1, cells: [[2, 0], [3, 0], [3, 1], [3, 2]] },
  { color: 3, cells: [[2, 1], [2, 2], [1, 2]] },
];
const at = (c: number, r: number) => [CELL / 2 + c * CELL + 6, CELL / 2 + r * CELL + 6] as const;

/** Animated logo: three pairs of dots connect to fill a tiny board, on loop. */
export function Logo({ reduceMotion, scale = 1 }: { reduceMotion: boolean; scale?: number }) {
  const { board } = useTheme();
  const palette = usePalette();
  const colorblind = useSettings((s) => s.colorblind);
  const w = CELL * 4 + 12;
  const h = CELL * 3 + 12;
  const t = useSharedValue(reduceMotion ? 0.6 : 0);
  useEffect(() => {
    if (reduceMotion) return;
    t.value = withRepeat(withTiming(1, { duration: 5200, easing: Easing.linear }), -1, false);
  }, [reduceMotion, t]);

  const paths = useMemo(
    () =>
      PATHS.map((p) => {
        const b = Skia.PathBuilder.Make();
        p.cells.forEach(([c, r], i) => {
          const [x, y] = at(c, r);
          if (i === 0) b.moveTo(x, y);
          else b.lineTo(x, y);
        });
        return b.build();
      }),
    [],
  );
  const e0 = useDerivedValue(() => Math.min(1, Math.max(0, t.value * 4)));
  const e1 = useDerivedValue(() => Math.min(1, Math.max(0, t.value * 4 - 0.7)));
  const e2 = useDerivedValue(() => Math.min(1, Math.max(0, t.value * 4 - 1.4)));
  const ends = [e0, e1, e2];
  const pathOpacity = useDerivedValue(() => (t.value > 0.88 ? Math.max(0, (1 - t.value) / 0.12) : 1));

  return (
    <Canvas style={{ width: w * scale, height: h * scale }}>
      <Group transform={[{ scale }]}>
        {Array.from({ length: 12 }, (_, i) => {
          const c = i % 4;
          const r = Math.floor(i / 4);
          return <RoundedRect key={i} x={6 + c * CELL + 2} y={6 + r * CELL + 2} width={CELL - 4} height={CELL - 4} r={CELL * board.cellRadius} color={board.cellEmpty} />;
        })}
        <Group opacity={pathOpacity}>
          {paths.map((p, i) => (
            <Path
              key={i}
              path={p}
              color={palette[PATHS[i].color].line}
              opacity={board.lineOpacity}
              style="stroke"
              strokeWidth={CELL * 0.32}
              strokeCap="round"
              strokeJoin="round"
              end={ends[i]}
            />
          ))}
        </Group>
        {PATHS.flatMap((p, i) =>
          [p.cells[0], p.cells[p.cells.length - 1]].map(([c, r], k) => {
            const [x, y] = at(c, r);
            const dotR = CELL * 0.34;
            return (
              <Group key={`${i}-${k}`}>
                <Circle cx={x} cy={y} r={dotR} color={palette[p.color].dot} />
                {colorblind && <Path path={symbolPath(p.color, x, y, dotR * 0.45)} color={board.colorblindSymbol} />}
              </Group>
            );
          }),
        )}
      </Group>
    </Canvas>
  );
}
