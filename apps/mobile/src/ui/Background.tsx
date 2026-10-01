import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Canvas, Circle, Group, Oval, Path } from '@shopify/react-native-skia';
import Animated, { interpolateColor, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useTheme } from '../theme/useTheme';
import { useSettings } from '../store/settings';

export const LANDSCAPE_H = 96;
/** Stitch landscape artwork, drawn in a 400×100 box stretched to the screen width. */
const VIEW_W = 400;
const VIEW_H = 100;
const HILL_FAR = 'M-20 100 C 60 75, 140 85, 230 70 C 310 58, 370 76, 420 85 L 420 100 Z';
const HILL_MID = 'M-10 100 C 80 65, 180 88, 270 78 C 340 70, 390 85, 420 95 L 420 100 Z';
const HILL_NEAR = 'M-10 100 C 50 82, 120 78, 200 92 C 280 105, 340 85, 410 70 L 410 100 Z';

type LeafTone = 'leaf' | 'leafDark' | 'leafDeep';
const TREES: { trunk: string; trunkW: number; leaf: [cx: number, cy: number, rx: number, ry: number]; tone: LeafTone; dark?: boolean; veins?: string }[] = [
  { trunk: 'M 50 88 L 50 68', trunkW: 2, leaf: [50, 62, 7, 13], tone: 'leafDark', veins: 'M 50 54 L 50 70 M 47 62 L 50 65 M 53 59 L 50 62' },
  { trunk: 'M 76 93 L 76 78', trunkW: 1.8, leaf: [76, 74, 5.5, 9], tone: 'leaf' },
  { trunk: 'M 305 92 L 305 74', trunkW: 2, leaf: [305, 69, 6.5, 11], tone: 'leaf', veins: 'M 305 62 L 305 76' },
  { trunk: 'M 350 94 L 350 56', trunkW: 2.2, leaf: [350, 50, 9, 17], tone: 'leafDeep', dark: true, veins: 'M 350 40 L 350 60 M 346 51 L 350 54 M 354 47 L 350 50' },
];

/**
 * Flat theme background with the seasonal landscape along the bottom. Rendered once in the
 * root layout so every screen shares a single WebGL context on web.
 */
export function Background() {
  const theme = useTheme();
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width);

  const color = theme.background.color;
  const prev = useRef(color);
  const from = useSharedValue(color);
  const to = useSharedValue(color);
  const blend = useSharedValue(1);
  useEffect(() => {
    if (prev.current === color) return;
    from.value = prev.current;
    to.value = color;
    blend.value = 0;
    blend.value = withTiming(1, { duration: reduceMotion ? 0 : 600 });
    prev.current = color;
  }, [color, reduceMotion, from, to, blend]);
  const fill = useAnimatedStyle(() => ({ backgroundColor: interpolateColor(blend.value, [0, 1], [from.value, to.value]) }));

  const l = theme.landscape;
  return (
    <Animated.View style={[styles.fill, fill]} onLayout={onLayout}>
      {width > 0 && (
        <Canvas style={{ position: 'absolute', left: 0, bottom: 0, height: LANDSCAPE_H, width }}>
          <Group transform={[{ scaleX: width / VIEW_W }, { scaleY: LANDSCAPE_H / VIEW_H }]}>
            <Circle cx={230} cy={80} r={32} color={l.sun} opacity={0.65} />
            <Path path={HILL_FAR} color={l.hillFar} opacity={0.65} />
            <Path path={HILL_MID} color={l.hillMid} opacity={0.85} />
            <Path path={HILL_NEAR} color={l.hillNear} />
            {TREES.map((t, i) => {
              const [cx, cy, rx, ry] = t.leaf;
              const trunk = t.dark ? l.trunkDark : l.trunk;
              return (
                <Group key={i}>
                  <Path path={t.trunk} color={trunk} style="stroke" strokeWidth={t.trunkW} strokeCap="round" />
                  <Oval x={cx - rx} y={cy - ry} width={rx * 2} height={ry * 2} color={l[t.tone]} />
                  {t.veins && <Path path={t.veins} color={trunk} style="stroke" strokeWidth={1.2} strokeCap="round" />}
                </Group>
              );
            })}
          </Group>
        </Canvas>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, overflow: 'hidden', pointerEvents: 'none' },
});
