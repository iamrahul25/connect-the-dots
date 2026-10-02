import React, { useMemo } from 'react';
import { Circle, Group, Path, RadialGradient, Skia, vec } from '@shopify/react-native-skia';
import { useDerivedValue, type SharedValue } from 'react-native-reanimated';
import { darken, withAlpha } from './color';

interface Props {
  x: number;
  y: number;
  cell: number;
  color: string;
  clock: SharedValue<number>;
  pulse: SharedValue<number>;
  reduceMotion: boolean;
}

const ARMS = 3;

/** A portal: glowing halo, bold ring and a slowly spinning swirl, in the pair's color. */
export function TeleportGate({ x, y, cell, color, clock, pulse, reduceMotion }: Props) {
  const swirl = useMemo(() => {
    const b = Skia.PathBuilder.Make();
    const sr = cell * 0.2;
    for (let i = 0; i < ARMS; i++) b.addArc(Skia.XYWHRect(x - sr, y - sr, sr * 2, sr * 2), (360 / ARMS) * i, 70);
    return b.build();
  }, [x, y, cell]);
  const spin = useDerivedValue(() => (reduceMotion ? [] : [{ rotate: clock.value / 900 }]), [reduceMotion]);

  return (
    <Group>
      <Circle cx={x} cy={y} r={cell * 0.46} color={withAlpha(color, 0.22)} opacity={pulse} />
      <Circle cx={x} cy={y} r={cell * 0.36}>
        <RadialGradient c={vec(x, y)} r={cell * 0.36} colors={[withAlpha(darken(color, 0.2), 0.6), withAlpha(color, 0.15)]} />
      </Circle>
      <Circle cx={x} cy={y} r={cell * 0.35} color={color} style="stroke" strokeWidth={Math.max(2.5, cell * 0.08)} />
      <Group origin={vec(x, y)} transform={spin}>
        <Path path={swirl} color={darken(color, 0.15)} style="stroke" strokeWidth={Math.max(1.5, cell * 0.055)} strokeCap="round" />
      </Group>
      <Circle cx={x} cy={y} r={Math.max(1.5, cell * 0.07)} color={color} />
    </Group>
  );
}
