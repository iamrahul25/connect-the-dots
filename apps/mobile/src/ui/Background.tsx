import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, useWindowDimensions, View, type LayoutChangeEvent } from 'react-native';
import { BlurStyle, Canvas, Picture, Skia, TileMode, useClock, vec, type SkPicture } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { themeFor, type ThemeGlow } from '../theme/themes';
import { useUi } from '../store/ui';
import { useSettings } from '../store/settings';
import { recordPicture } from './skiaMemory';

const BOKEH = Array.from({ length: 18 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin((i + 1) * 91.7 + n * 13.3) * 43758.5453;
    return x - Math.floor(x);
  };
  return [r(1), r(2), 18 + r(3) * 60, 0.03 + r(4) * 0.07, r(5) * Math.PI * 2, 0.4 + r(6)];
});

const packGlows = (glows: readonly ThemeGlow[]) => glows.flatMap((g) => [g.x, g.y, g.r]);

/**
 * Full-screen animated gradient with drifting bokeh. Rendered once in the root
 * layout so every screen shares a single WebGL context on web.
 */
export function Background() {
  // Android's window height excludes the navigation bar, but the app draws edge-to-edge
  // beneath it, so size from our own layout rather than the window.
  const win = useWindowDimensions();
  const [size, setSize] = useState({ width: win.width, height: win.height });
  const { width, height } = size;
  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    if (w !== width || h !== height) setSize({ width: w, height: h });
  };
  const themeId = useUi((s) => s.theme);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const theme = themeFor(themeId);

  const prevTheme = useRef(theme);
  const from = useSharedValue<string[]>([...theme.gradient]);
  const to = useSharedValue<string[]>([...theme.gradient]);
  const glowsFrom = useSharedValue<number[]>(packGlows(theme.glows));
  const glowsTo = useSharedValue<number[]>(packGlows(theme.glows));
  const glowColorsFrom = useSharedValue<string[]>(theme.glows.map((g) => g.color));
  const glowColorsTo = useSharedValue<string[]>(theme.glows.map((g) => g.color));
  const bokehFrom = useSharedValue(theme.bokeh);
  const bokehTo = useSharedValue(theme.bokeh);
  const blend = useSharedValue(1);

  useEffect(() => {
    const prev = prevTheme.current;
    from.value = [...prev.gradient];
    to.value = [...theme.gradient];
    glowsFrom.value = packGlows(prev.glows);
    glowsTo.value = packGlows(theme.glows);
    glowColorsFrom.value = prev.glows.map((g) => g.color);
    glowColorsTo.value = theme.glows.map((g) => g.color);
    bokehFrom.value = bokehTo.value;
    bokehTo.value = theme.bokeh;
    blend.value = 0;
    blend.value = withTiming(1, { duration: 900 });
    prevTheme.current = theme;
  }, [theme, from, to, glowsFrom, glowsTo, glowColorsFrom, glowColorsTo, blend, bokehFrom, bokehTo]);

  const clock = useClock();
  const prevPicture = useSharedValue<SkPicture | null>(null);
  const picture = useDerivedValue(() => {
    const t = reduceMotion ? 0 : clock.value / 1000;
    const w = width;
    const h = height;
    const k = blend.value;
    return recordPicture(prevPicture, (canvas) => {
      const paint = Skia.Paint();
      const a = t * 0.05;
      const start = vec(w * (0.5 + 0.45 * Math.cos(a)), 0);
      const end = vec(w * (0.5 - 0.45 * Math.cos(a)), h);
      const layers: [string[], number[], string[], number][] =
        k < 1
          ? [[from.value, glowsFrom.value, glowColorsFrom.value, 1], [to.value, glowsTo.value, glowColorsTo.value, k]]
          : [[to.value, glowsTo.value, glowColorsTo.value, 1]];
      for (const [cols, glows, glowCols, alpha] of layers) {
        const linear = Skia.Shader.MakeLinearGradient(start, end, cols.map((c) => Skia.Color(c)), cols.map((_, i) => i / (cols.length - 1)), TileMode.Clamp);
        paint.setShader(linear);
        paint.setAlphaf(alpha);
        canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paint);
        linear.dispose();
        for (let i = 0; i < glowCols.length; i++) {
          const drift = Math.sin(t * 0.07 + i * 2.1) * 0.04;
          const cx = w * (glows[i * 3] + drift);
          const cy = h * (glows[i * 3 + 1] - drift);
          const r = Math.max(w, h) * glows[i * 3 + 2];
          const c = Skia.Color(glowCols[i]);
          const clear = Skia.Color(glowCols[i]);
          clear[3] = 0;
          const radial = Skia.Shader.MakeRadialGradient(vec(cx, cy), r, [c, clear], [0, 1], TileMode.Clamp);
          paint.setShader(radial);
          paint.setAlphaf(alpha * 0.85);
          canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paint);
          radial.dispose();
        }
      }
      paint.dispose();
      const bp = Skia.Paint();
      bp.setAntiAlias(true);
      const blur = Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 14, true);
      bp.setMaskFilter(blur);
      for (let i = 0; i < BOKEH.length; i++) {
        const [bx, by, r, alpha, phase, speed] = BOKEH[i];
        const x = ((bx * w + Math.sin(t * 0.13 * speed + phase) * 40) % (w + 80)) - 40;
        const y = ((by * h - t * 9 * speed + h * 4) % (h + 160)) - 80;
        bp.setColor(Skia.Color(i % 3 === 0 ? '#FFFFFF' : k < 0.5 ? bokehFrom.value : bokehTo.value));
        bp.setAlphaf(alpha * (0.7 + 0.3 * Math.sin(t * 0.6 * speed + phase)));
        canvas.drawCircle(x, y, r, bp);
      }
      bp.dispose();
      blur.dispose();
    });
  }, [width, height, reduceMotion]);

  return (
    <View style={styles.fill} onLayout={onLayout}>
      <Canvas style={{ width, height }}>
        <Picture picture={picture} />
      </Canvas>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, overflow: 'hidden', pointerEvents: 'none' },
});
