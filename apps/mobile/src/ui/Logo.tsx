import React, { useEffect, useMemo } from 'react';
import { BlurMask, Canvas, Circle, Group, Path, RadialGradient, RoundedRect, Skia, vec } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { flowStyle, PALETTE, type FlowStyle } from '../theme/themes';
import { colors } from '../theme/tokens';

const CELL = 34;
const PATHS: { color: string; flow: FlowStyle; cells: [number, number][] }[] = [
  { color: PALETTE[0], flow: flowStyle(PALETTE[0]), cells: [[0, 0], [1, 0], [1, 1], [0, 1], [0, 2]] },
  { color: PALETTE[1], flow: flowStyle(PALETTE[1]), cells: [[2, 0], [3, 0], [3, 1], [3, 2]] },
  { color: PALETTE[3], flow: flowStyle(PALETTE[3]), cells: [[2, 1], [2, 2], [1, 2]] },
];
const at = (c: number, r: number) => [CELL / 2 + c * CELL + 6, CELL / 2 + r * CELL + 6] as const;

/** Animated logo: three pairs of dots connect to fill a tiny board, on loop. */
export function Logo({ reduceMotion }: { reduceMotion: boolean }) {
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
    <Canvas style={{ width: w, height: h }}>
      {Array.from({ length: 12 }, (_, i) => {
        const c = i % 4;
        const r = Math.floor(i / 4);
        return (
          <RoundedRect key={i} x={6 + c * CELL + 2} y={6 + r * CELL + 2} width={CELL - 4} height={CELL - 4} r={7} color={colors.cell.base} />
        );
      })}
      <Group opacity={pathOpacity}>
        {paths.map((p, i) => (
          <Group key={i}>
            <Path path={p} color={PATHS[i].flow.glow} style="stroke" strokeWidth={CELL * 0.6} strokeCap="round" strokeJoin="round" end={ends[i]} opacity={0.35}>
              <BlurMask blur={7} style="normal" />
            </Path>
            <Path path={p} color={PATHS[i].flow.pipeShadow} style="stroke" strokeWidth={CELL * 0.38} strokeCap="round" strokeJoin="round" end={ends[i]} />
            <Path path={p} color={PATHS[i].flow.pipe} style="stroke" strokeWidth={CELL * 0.29} strokeCap="round" strokeJoin="round" end={ends[i]} />
            <Path path={p} color={PATHS[i].flow.pipeHighlight} style="stroke" strokeWidth={CELL * 0.1} strokeCap="round" strokeJoin="round" end={ends[i]} opacity={0.9} />
          </Group>
        ))}
      </Group>
      {PATHS.flatMap((p, i) =>
        [p.cells[0], p.cells[p.cells.length - 1]].map(([c, r], k) => {
          const [x, y] = at(c, r);
          return (
            <Group key={`${i}-${k}`}>
              <Circle cx={x} cy={y} r={CELL * 0.42} color={p.flow.glow} opacity={0.5}>
                <BlurMask blur={8} style="normal" />
              </Circle>
              <Circle cx={x} cy={y} r={CELL * 0.34}>
                <RadialGradient c={vec(x - 4, y - 5)} r={CELL * 0.45} colors={[p.flow.bright, p.color, p.flow.shadow]} />
              </Circle>
              <Circle cx={x - 4} cy={y - 5} r={3} color="rgba(255,255,255,0.6)" />
            </Group>
          );
        }),
      )}
    </Canvas>
  );
}
