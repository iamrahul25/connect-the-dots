import { useEffect, useState } from 'react';
import { PixelRatio } from 'react-native';
import { ImageFormat, Skia, type SkCanvas } from '@shopify/react-native-skia';

/**
 * Skia art drawn once on a CPU surface and reused as a PNG data URI. Unlike a live `<Canvas>`,
 * this costs no WebGL context, so a screen can show any number of them (browsers only allow a
 * handful of live contexts).
 */
const done = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

/** Pixel size to bake a `size`-point image at, sharp on any screen. */
export const bakedPixels = (size: number) => Math.ceil(size * Math.max(2, PixelRatio.get()));

async function bake(px: number, render: (canvas: SkCanvas) => void | Promise<void>): Promise<string | null> {
  const surface = Skia.Surface.Make(px, px);
  if (!surface) return null;
  try {
    await render(surface.getCanvas());
    surface.flush();
    const image = surface.makeImageSnapshot();
    const uri = `data:image/png;base64,${image.encodeToBase64(ImageFormat.PNG, 100)}`;
    image.dispose();
    return uri;
  } finally {
    surface.dispose();
  }
}

/**
 * The baked image for `key`, or undefined until it's ready. `key` must identify everything
 * `render` draws (including `px`); `render` draws on a `px` × `px` canvas.
 */
export function useBakedImage(key: string, px: number, render: (canvas: SkCanvas) => void | Promise<void>): string | undefined {
  const uri = done.get(key);
  const [, setReady] = useState<string | null>(null);

  useEffect(() => {
    if (done.has(key)) return;
    let live = true;
    let job = pending.get(key);
    if (!job) {
      job = bake(px, render)
        .then((u) => {
          if (u) done.set(key, u);
          return u;
        })
        .catch(() => null)
        .finally(() => pending.delete(key));
      pending.set(key, job);
    }
    job.then(() => live && setReady(key));
    return () => {
      live = false;
    };
    // `key` covers everything `px` and `render` draw.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return uri;
}
