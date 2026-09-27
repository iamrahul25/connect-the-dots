import { Skia, type SkPath } from '@shopify/react-native-skia';

/** Colorblind-mode glyphs drawn as vector paths (no font needed on any platform). */
export function symbolPath(index: number, cx: number, cy: number, s: number): SkPath {
  const b = Skia.PathBuilder.Make();
  const poly = (n: number, rot: number, r = s) => {
    for (let i = 0; i < n; i++) {
      const a = rot + (i / n) * Math.PI * 2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      if (i === 0) b.moveTo(x, y);
      else b.lineTo(x, y);
    }
    b.close();
  };
  switch (index % 12) {
    case 0:
      b.addCircle(cx, cy, s * 0.8);
      break;
    case 1:
      poly(3, -Math.PI / 2);
      break;
    case 2:
      poly(4, Math.PI / 4, s * 0.95);
      break;
    case 3:
      poly(4, 0);
      break;
    case 4:
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const r = i % 2 === 0 ? s * 1.05 : s * 0.45;
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i === 0) b.moveTo(x, y);
        else b.lineTo(x, y);
      }
      b.close();
      break;
    case 5: {
      const w = s * 0.34;
      b.addRect(Skia.XYWHRect(cx - w, cy - s, w * 2, s * 2));
      b.addRect(Skia.XYWHRect(cx - s, cy - w, s * 2, w * 2));
      break;
    }
    case 6:
      poly(5, -Math.PI / 2);
      break;
    case 7:
      poly(6, 0);
      break;
    case 8:
      poly(3, Math.PI / 2);
      break;
    case 9: {
      const w = s * 0.3;
      b.addRect(Skia.XYWHRect(cx - s, cy - w, s * 2, w * 2));
      break;
    }
    case 10: {
      const w = s * 0.3;
      b.addRect(Skia.XYWHRect(cx - w, cy - s, w * 2, s * 2));
      break;
    }
    default:
      poly(8, Math.PI / 8, s * 0.85);
  }
  return b.build();
}
