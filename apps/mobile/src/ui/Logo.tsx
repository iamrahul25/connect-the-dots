import React, { useEffect, useMemo } from 'react';
import { Canvas, Circle, Group, Path, RoundedRect, Skia } from '@shopify/react-native-skia';
import { cancelAnimation, Easing, useDerivedValue, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { usePalette, useTheme } from '../theme/useTheme';
import { useSettings } from '../store/settings';
import { symbolPath } from '../board/symbols';

const CELL = 32;
const GRID = 4;
/** Palette index and cells (column, row) of each logo flow; together they cover every cell. */
const PATHS: { color: number; cells: [number, number][] }[] = [
  { color: 0, cells: [[1, 0], [0, 0], [0, 1], [0, 2]] },
  { color: 1, cells: [[2, 0], [3, 0], [3, 1], [3, 2], [3, 3]] },
  { color: 2, cells: [[1, 1], [2, 1], [2, 2], [2, 3]] },
  { color: 3, cells: [[1, 2], [1, 3], [0, 3]] },
];
/** Loop progress where every flow is drawn and the fade-out hasn't started; shown when motion is reduced. */
const SOLVED = 0.75;
const at = (c: number, r: number) => [CELL / 2 + c * CELL + 6, CELL / 2 + r * CELL + 6] as const;
const progress = (t: number, i: number) => {
  'worklet';
  return Math.min(1, Math.max(0, t * 5 - i * 0.8));
};

/** Animated logo: four pairs of dots connect to fill a tiny board, on loop. */
export const Logo = React.memo(function Logo({ reduceMotion, scale = 1 }: { reduceMotion: boolean; scale?: number }) {
  const { board } = useTheme();
  const palette = usePalette();
  const colorblind = useSettings((s) => s.colorblind);
  // Reanimated snaps timings to their end value when the OS asks for reduced motion (accessibility
  // setting, Android battery saver), which would leave the loop parked on its faded-out frame.
  const systemReduceMotion = useReducedMotion();
  const still = reduceMotion || systemReduceMotion;
  const size = CELL * GRID + 12;
  const t = useSharedValue(still ? SOLVED : 0);
  useEffect(() => {
    if (still) {
      cancelAnimation(t);
      t.value = SOLVED;
      return;
    }
    t.value = 0;
    t.value = withRepeat(withTiming(1, { duration: 6400, easing: Easing.linear }), -1, false);
    return () => cancelAnimation(t);
  }, [still, t]);

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
  const e0 = useDerivedValue(() => progress(t.value, 0));
  const e1 = useDerivedValue(() => progress(t.value, 1));
  const e2 = useDerivedValue(() => progress(t.value, 2));
  const e3 = useDerivedValue(() => progress(t.value, 3));
  const ends = [e0, e1, e2, e3];
  const pathOpacity = useDerivedValue(() => (t.value > 0.88 ? Math.max(0, (1 - t.value) / 0.12) : 1));
  return (
    <Canvas style={{ width: size * scale, height: size * scale }}>
      <Group transform={[{ scale }]}>
        {Array.from({ length: GRID * GRID }, (_, i) => {
          const c = i % GRID;
          const r = Math.floor(i / GRID);
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
});
