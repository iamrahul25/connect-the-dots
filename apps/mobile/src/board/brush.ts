import { PaintStyle, Skia, StrokeCap, StrokeJoin, type SkCanvas, type SkColor, type SkPaint, type SkPathEffect } from '@shopify/react-native-skia';

export interface StrokeStyle {
  width: number;
  cap?: StrokeCap;
  join?: StrokeJoin;
  /** Dash on / off lengths. */
  dash?: number[];
}

/**
 * Imperative drawing for content baked into pictures. One fill and one stroke paint are reused
 * (a picture copies the paint at each draw call) and parsed colors are cached.
 */
export class Brush {
  private readonly fillPaint = Skia.Paint();
  private readonly strokePaint = Skia.Paint();
  private readonly colors = new Map<string, SkColor>();
  private readonly effects: SkPathEffect[] = [];

  constructor(readonly canvas: SkCanvas) {
    this.fillPaint.setAntiAlias(true);
    this.strokePaint.setAntiAlias(true);
    this.strokePaint.setStyle(PaintStyle.Stroke);
  }

  private color(paint: SkPaint, color: string, opacity: number): void {
    let c = this.colors.get(color);
    if (!c) {
      c = Skia.Color(color);
      this.colors.set(color, c);
    }
    paint.setColor(c);
    paint.setAlphaf(c[3] * opacity);
  }

  fill(color: string, opacity = 1): SkPaint {
    this.color(this.fillPaint, color, opacity);
    return this.fillPaint;
  }

  stroke(color: string, { width, cap = StrokeCap.Butt, join = StrokeJoin.Miter, dash }: StrokeStyle, opacity = 1): SkPaint {
    const p = this.strokePaint;
    this.color(p, color, opacity);
    p.setStrokeWidth(width);
    p.setStrokeCap(cap);
    p.setStrokeJoin(join);
    if (dash) {
      const effect = Skia.PathEffect.MakeDash(dash, 0);
      this.effects.push(effect);
      p.setPathEffect(effect);
    } else {
      p.setPathEffect(null);
    }
    return p;
  }

  rrect(x: number, y: number, w: number, h: number, r: number, paint: SkPaint): void {
    this.canvas.drawRRect(Skia.RRectXY(Skia.XYWHRect(x, y, w, h), r, r), paint);
  }

  dispose(): void {
    this.fillPaint.dispose();
    this.strokePaint.dispose();
    // Native path effects have no dispose(); only CanvasKit on web needs it.
    for (const e of this.effects) e.dispose?.();
  }
}

export function withBrush(canvas: SkCanvas, draw: (b: Brush) => void): void {
  const b = new Brush(canvas);
  draw(b);
  b.dispose();
}
