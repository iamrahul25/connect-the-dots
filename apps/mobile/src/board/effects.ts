import { BlurStyle, PaintStyle, Skia, type SkCanvas } from '@shopify/react-native-skia';

/** One-shot visual effects drawn by a single Skia Picture on the UI thread. */
export type Effect =
  | { kind: 'burst'; t0: number; dur: number; x: number; y: number; color: string; count: number; radius: number; seed: number }
  | { kind: 'ring'; t0: number; dur: number; x: number; y: number; color: string; r0: number; r1: number; width: number }
  | { kind: 'wave'; t0: number; dur: number; color: string; pts: number[]; size: number }
  | { kind: 'sweep'; t0: number; dur: number; cells: number[]; maxOrder: number; radius: number }
  | { kind: 'confetti'; t0: number; dur: number; colors: string[]; count: number; w: number; h: number; seed: number }
  | { kind: 'flash'; t0: number; dur: number; x: number; y: number; w: number; h: number; radius: number; color: string };

export type EffectInput = Effect extends infer E ? (E extends Effect ? Omit<E, 't0'> : never) : never;

function rand(seed: number, i: number): number {
  'worklet';
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function easeOut(t: number): number {
  'worklet';
  return 1 - (1 - t) * (1 - t) * (1 - t);
}

export function drawEffects(canvas: SkCanvas, list: Effect[], now: number): void {
  'worklet';
  const paint = Skia.Paint();
  paint.setAntiAlias(true);
  for (let e = 0; e < list.length; e++) {
    const f = list[e];
    const t = (now - f.t0) / f.dur;
    if (t < 0 || t > 1) continue;

    if (f.kind === 'burst') {
      paint.setColor(Skia.Color(f.color));
      for (let i = 0; i < f.count; i++) {
        const a = (i / f.count) * Math.PI * 2 + rand(f.seed, i) * 0.6;
        const d = easeOut(t) * f.radius * (0.55 + rand(f.seed, i + 50) * 0.6);
        const x = f.x + Math.cos(a) * d;
        const y = f.y + Math.sin(a) * d;
        const r = (1 - t) * (2 + rand(f.seed, i + 99) * 3.5);
        paint.setAlphaf((1 - t) * 0.35);
        canvas.drawCircle(x, y, r * 2.2, paint);
        paint.setAlphaf(1 - t);
        canvas.drawCircle(x, y, r, paint);
      }
    } else if (f.kind === 'ring') {
      paint.setStyle(PaintStyle.Stroke);
      paint.setStrokeWidth(f.width * (1 - t * 0.7));
      paint.setColor(Skia.Color(f.color));
      paint.setAlphaf((1 - t) * 0.9);
      canvas.drawCircle(f.x, f.y, f.r0 + (f.r1 - f.r0) * easeOut(t), paint);
      paint.setStyle(PaintStyle.Fill);
    } else if (f.kind === 'wave') {
      const n = f.pts.length / 2;
      if (n < 2) continue;
      const pos = easeOut(t) * (n - 1);
      const i = Math.min(n - 2, Math.floor(pos));
      const k = pos - i;
      const x = f.pts[i * 2] + (f.pts[i * 2 + 2] - f.pts[i * 2]) * k;
      const y = f.pts[i * 2 + 1] + (f.pts[i * 2 + 3] - f.pts[i * 2 + 1]) * k;
      const fade = t < 0.85 ? 1 : (1 - t) / 0.15;
      const glow = Skia.Paint();
      glow.setAntiAlias(true);
      glow.setColor(Skia.Color(f.color));
      glow.setMaskFilter(Skia.MaskFilter.MakeBlur(BlurStyle.Normal, f.size * 0.6, true));
      glow.setAlphaf(0.9 * fade);
      canvas.drawCircle(x, y, f.size, glow);
      paint.setColor(Skia.Color('#FFFFFF'));
      paint.setAlphaf(fade);
      canvas.drawCircle(x, y, f.size * 0.45, paint);
    } else if (f.kind === 'sweep') {
      paint.setColor(Skia.Color('#FFFFFF'));
      const front = t * (f.maxOrder + 6);
      for (let i = 0; i < f.cells.length; i += 4) {
        const d = front - f.cells[i + 3];
        if (d < 0 || d > 6) continue;
        const a = Math.sin((d / 6) * Math.PI) * 0.4;
        paint.setAlphaf(a);
        const s = f.cells[i + 2];
        canvas.drawRRect(
          Skia.RRectXY(Skia.XYWHRect(f.cells[i], f.cells[i + 1], s, s), f.radius, f.radius),
          paint,
        );
      }
    } else if (f.kind === 'confetti') {
      for (let i = 0; i < f.count; i++) {
        const x0 = rand(f.seed, i) * f.w;
        const vy = 0.35 + rand(f.seed, i + 7) * 0.65;
        const delay = rand(f.seed, i + 13) * 0.25;
        const tt = Math.max(0, t - delay) / (1 - delay);
        if (tt <= 0) continue;
        const y = -20 + tt * (f.h + 40) * vy + tt * tt * f.h * 0.4;
        const x = x0 + Math.sin(tt * 8 + i) * 18;
        const rot = tt * 10 + i;
        const w = 5 + rand(f.seed, i + 3) * 5;
        const h = w * (0.4 + 0.6 * Math.abs(Math.cos(rot)));
        paint.setColor(Skia.Color(f.colors[i % f.colors.length]));
        paint.setAlphaf(tt > 0.8 ? (1 - tt) / 0.2 : 1);
        canvas.save();
        canvas.translate(x, y);
        canvas.rotate((rot * 180) / Math.PI, 0, 0);
        canvas.drawRect(Skia.XYWHRect(-w / 2, -h / 2, w, h), paint);
        canvas.restore();
      }
    } else if (f.kind === 'flash') {
      paint.setColor(Skia.Color(f.color));
      paint.setAlphaf(Math.sin(t * Math.PI) * 0.22);
      canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(f.x, f.y, f.w, f.h), f.radius, f.radius), paint);
    }
  }
}
