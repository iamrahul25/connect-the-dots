import { useLayoutEffect, useState } from 'react';
import { Platform } from 'react-native';
import { Skia, type SkCanvas, type SkPicture } from '@shopify/react-native-skia';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

/**
 * On web, Skia objects live in the CanvasKit WASM heap and are never garbage-collected:
 * anything not explicitly disposed leaks. Per-frame pictures exhaust the heap within a
 * couple of minutes and CanvasKit aborts.
 */
const IS_WEB = Platform.OS === 'web';

type ViewApi = {
  setJsiProperty: (id: number | string, name: string, value: unknown) => void;
  deferedPictures?: Record<string, unknown>;
  __releasesPictures?: boolean;
};

// The web Canvas never frees the picture it replaces, so free it here.
if (IS_WEB) {
  const api = (globalThis as unknown as { SkiaViewApi?: ViewApi }).SkiaViewApi;
  if (api && !api.__releasesPictures) {
    api.__releasesPictures = true;
    const current = new Map<string, SkPicture>();
    const set = api.setJsiProperty.bind(api);
    api.setJsiProperty = (id, name, value) => {
      set(id, name, value);
      if (name !== 'picture') return;
      const key = `${id}`;
      const prev = current.get(key);
      current.set(key, value as SkPicture);
      if (!prev || prev === value) return;
      if (api.deferedPictures?.[key] === prev) delete api.deferedPictures[key];
      prev.dispose();
    };
  }
}

function record(draw: (canvas: SkCanvas) => void): SkPicture {
  'worklet';
  const recorder = Skia.PictureRecorder();
  draw(recorder.beginRecording());
  const picture = recorder.finishRecordingAsPicture();
  recorder.dispose();
  return picture;
}

/**
 * The picture a derived value returned last time, so web can free it. Deliberately not a shared
 * value: a derived value subscribes to every shared value it captures, so writing one from its own
 * updater re-runs that updater on every frame.
 */
export interface PictureSlot {
  current: SkPicture | null;
}

export function usePictureSlot(): PictureSlot {
  return useState<PictureSlot>(() => ({ current: null }))[0];
}

/**
 * Drop-in for Skia's `createPicture` inside a derived value that re-records every frame.
 * Frees the recorder, and on web the picture this derived value returned last time.
 */
export function recordPicture(prev: PictureSlot, draw: (canvas: SkCanvas) => void): SkPicture {
  'worklet';
  const picture = record(draw);
  if (IS_WEB) {
    prev.current?.dispose();
    prev.current = picture;
  }
  return picture;
}

/** For a `recordPicture` derived value that returns an existing picture this frame: frees the last recording. */
export function skipPicture(prev: PictureSlot, instead: SkPicture): SkPicture {
  'worklet';
  if (IS_WEB && prev.current) {
    prev.current.dispose();
    prev.current = null;
  }
  return instead;
}

let empty: SkPicture | null = null;

/** A shared blank picture that is never freed. */
export function emptyPicture(): SkPicture {
  empty ??= record(() => {});
  return empty;
}

/**
 * Records a picture on the JS thread, for use in `useMemo`. Content drawn this way costs one draw
 * call per frame instead of one scene-graph node per shape. Draw it through `usePictureValue`.
 */
export function makePicture(draw: (canvas: SkCanvas) => void): SkPicture {
  return record(draw);
}

/**
 * Hands a `makePicture` picture to `<Picture>` and, on web, frees it once it's replaced or unmounts.
 *
 * A picture passed as a plain prop is captured into the Canvas's recording, which keeps being
 * replayed every frame until the Canvas commits its own (later) update; freeing it in the meantime
 * crashes. A shared value is read at replay time, so it's swapped first and the old picture is
 * unreachable before it's freed.
 */
export function usePictureValue(picture: SkPicture): SharedValue<SkPicture> {
  const value = useSharedValue(picture);
  useLayoutEffect(() => {
    value.set(picture);
    return () => {
      if (!IS_WEB) return;
      value.set(emptyPicture());
      // Strict Mode re-runs the effect with the same picture right away; only free it if it stays replaced.
      requestAnimationFrame(() => {
        if (value.get() !== picture) picture.dispose();
      });
    };
  }, [picture, value]);
  return value;
}
