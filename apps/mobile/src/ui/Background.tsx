import React, { useEffect, useRef } from 'react';
import { useWindowDimensions } from 'react-native';
import { BlurStyle, Canvas, createPicture, Picture, Skia, TileMode, useClock, vec } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue, withTiming } from 'react-native-reanimated';
import { themeFor } from '../theme/themes';
import { useUi } from '../store/ui';
import { useSettings } from '../store/settings';

const BOKEH = Array.from({ length: 18 }, (_, i) => {
  const r = (n: number) => {
    const x = Math.sin((i + 1) * 91.7 + n * 13.3) * 43758.5453;
    return x - Math.floor(x);
  };
  return [r(1), r(2), 18 + r(3) * 60, 0.03 + r(4) * 0.07, r(5) * Math.PI * 2, 0.4 + r(6)];
});

/**
 * Full-screen animated gradient with drifting bokeh. Rendered once in the root
 * layout so every screen shares a single WebGL context on web.
 */
export function Background() {
  const { width, height } = useWindowDimensions();
  const themeId = useUi((s) => s.theme);
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const theme = themeFor(themeId);

  const prevColors = useRef(theme.gradient);
  const from = useSharedValue<string[]>([...theme.gradient]);
  const to = useSharedValue<string[]>([...theme.gradient]);
  const bokehFrom = useSharedValue(theme.bokeh);
  const bokehTo = useSharedValue(theme.bokeh);
  const blend = useSharedValue(1);

  useEffect(() => {
    from.value = [...prevColors.current];
    to.value = [...theme.gradient];
    bokehFrom.value = bokehTo.value;
    bokehTo.value = theme.bokeh;
    blend.value = 0;
    blend.value = withTiming(1, { duration: 900 });
    prevColors.current = theme.gradient;
  }, [theme, from, to, blend, bokehFrom, bokehTo]);

  const clock = useClock();
  const picture = useDerivedValue(() => {
    const t = reduceMotion ? 0 : clock.value / 1000;
    const w = width;
    const h = height;
    const k = blend.value;
    return createPicture((canvas) => {
      const paint = Skia.Paint();
      const a = t * 0.05;
      const start = vec(w * (0.5 + 0.45 * Math.cos(a)), 0);
      const end = vec(w * (0.5 - 0.45 * Math.cos(a)), h);
      const layers: [string[], number][] = k < 1 ? [[from.value, 1], [to.value, k]] : [[to.value, 1]];
      for (const [cols, alpha] of layers) {
        paint.setShader(
          Skia.Shader.MakeLinearGradient(start, end, cols.map((c) => Skia.Color(c)), [0, 0.55, 1], TileMode.Clamp),
        );
        paint.setAlphaf(alpha);
        canvas.drawRect(Skia.XYWHRect(0, 0, w, h), paint);
      }
      const bp = Skia.Paint();
      bp.setAntiAlias(true);
      bp.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, 14, true));
      for (let i = 0; i < BOKEH.length; i++) {
        const [bx, by, r, alpha, phase, speed] = BOKEH[i];
        const x = ((bx * w + Math.sin(t * 0.13 * speed + phase) * 40) % (w + 80)) - 40;
        const y = ((by * h - t * 9 * speed + h * 4) % (h + 160)) - 80;
        bp.setColor(Skia.Color(i % 3 === 0 ? '#FFFFFF' : k < 0.5 ? bokehFrom.value : bokehTo.value));
        bp.setAlphaf(alpha * (0.7 + 0.3 * Math.sin(t * 0.6 * speed + phase)));
        canvas.drawCircle(x, y, r, bp);
      }
    });
  }, [width, height, reduceMotion]);

  return (
    <Canvas style={{ position: 'absolute', left: 0, top: 0, width, height, pointerEvents: 'none' }}>
      <Picture picture={picture} />
    </Canvas>
  );
}
