import React, { useEffect, useMemo, useRef } from 'react';
import { Circle, Group, Path, RoundedRect, Skia, vec, type SkPathBuilder } from '@shopify/react-native-skia';
import { Easing, useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';

interface Props {
  kind: 'tunnel' | 'rotator';
  cx: number;
  cy: number;
  cell: number;
  deck: number;
  pathW: number;
  /** Clockwise quarter turns from the base orientation (tunnel: left + right, rotator: up + right). */
  turn: number;
  reduceMotion: boolean;
  colors: { box: string; border: string; shadow: string };
}

/** Clockwise arc around the piece center ending in an arrowhead; angles in degrees, 0 = right, 90 = down. */
function addTurnArrow(b: SkPathBuilder, cx: number, cy: number, radius: number, start: number, sweep: number, head: number) {
  b.addArc(Skia.XYWHRect(cx - radius, cy - radius, radius * 2, radius * 2), start, sweep);
  const a = ((start + sweep) * Math.PI) / 180;
  const px = cx + radius * Math.cos(a);
  const py = cy + radius * Math.sin(a);
  const [tx, ty] = [-Math.sin(a), Math.cos(a)];
  const [nx, ny] = [Math.cos(a), Math.sin(a)];
  b.moveTo(px - tx * head * 0.55 + nx * head * 0.7, py - ty * head * 0.55 + ny * head * 0.7);
  b.lineTo(px + tx * head * 0.35, py + ty * head * 0.35);
  b.lineTo(px - tx * head * 0.55 - nx * head * 0.7, py - ty * head * 0.55 - ny * head * 0.7);
}

/** A tunnel or rotator: a raised piece with a groove along its open sides and turn arrows; spins when tapped. */
export function TurnPiece({ kind, cx, cy, cell, deck, pathW, turn, reduceMotion, colors }: Props) {
  const r = deck / 2;
  const rim = Math.max(2, cell * 0.07);
  const steps = kind === 'tunnel' ? 2 : 4;

  const shapes = useMemo(() => {
    const reach = r - rim / 2;
    const groove = Skia.PathBuilder.Make();
    const arrows = Skia.PathBuilder.Make();
    const ar = deck * 0.3;
    const head = deck * 0.11;
    // Arrows sit where the groove leaves the piece free, clear of the flow drawn along the groove.
    if (kind === 'tunnel') {
      groove.moveTo(cx - reach, cy);
      groove.lineTo(cx + reach, cy);
      addTurnArrow(arrows, cx, cy, ar, 60, 60, head);
    } else {
      groove.moveTo(cx, cy - reach);
      groove.lineTo(cx, cy);
      groove.lineTo(cx + reach, cy);
      addTurnArrow(arrows, cx, cy, ar, 100, 55, head);
    }
    return { groove: groove.build(), arrows: arrows.build() };
  }, [kind, cx, cy, r, rim, deck]);

  const angle = useSharedValue(turn * 90);
  const goal = useRef(turn * 90);
  const last = useRef(turn);
  useEffect(() => {
    const step = (turn - last.current + steps) % steps;
    last.current = turn;
    if (step === 0) return;
    goal.current += step * 90;
    angle.value =
      step === 1 && !reduceMotion
        ? withTiming(goal.current, { duration: 220, easing: Easing.out(Easing.back(1.6)) })
        : goal.current;
  }, [turn, steps, reduceMotion, angle]);
  const transform = useDerivedValue(() => [{ rotate: (angle.value * Math.PI) / 180 }]);

  const corner = cell * 0.18;
  return (
    <Group>
      {kind === 'tunnel' ? (
        <>
          <RoundedRect x={cx - r} y={cy - r + cell * 0.07} width={deck} height={deck} r={corner} color={colors.shadow} />
          <RoundedRect x={cx - r} y={cy - r} width={deck} height={deck} r={corner} color={colors.box} />
        </>
      ) : (
        <>
          <Circle cx={cx} cy={cy + cell * 0.07} r={r} color={colors.shadow} />
          <Circle cx={cx} cy={cy} r={r} color={colors.box} />
        </>
      )}
      <Group origin={vec(cx, cy)} transform={transform}>
        <Path
          path={shapes.arrows}
          color={colors.border}
          opacity={0.65}
          style="stroke"
          strokeWidth={Math.max(1.2, cell * 0.045)}
          strokeCap="round"
          strokeJoin="round"
        />
        <Path path={shapes.groove} color={colors.border} style="stroke" strokeWidth={pathW * 0.75} strokeCap="butt" strokeJoin="round" />
      </Group>
      {kind === 'tunnel' ? (
        <RoundedRect x={cx - r} y={cy - r} width={deck} height={deck} r={corner} style="stroke" strokeWidth={rim} color={colors.border} />
      ) : (
        <Circle cx={cx} cy={cy} r={r} style="stroke" strokeWidth={rim} color={colors.border} />
      )}
    </Group>
  );
}
