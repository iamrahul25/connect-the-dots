import { Platform } from 'react-native';
import { Skia, type SkCanvas, type SkPicture } from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';

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

/**
 * Drop-in for Skia's `createPicture` inside a derived value that re-records every frame.
 * Frees the recorder, and on web the picture this derived value returned last time.
 */
export function recordPicture(prev: SharedValue<SkPicture | null>, draw: (canvas: SkCanvas) => void): SkPicture {
  'worklet';
  const recorder = Skia.PictureRecorder();
  draw(recorder.beginRecording());
  const picture = recorder.finishRecordingAsPicture();
  recorder.dispose();
  if (IS_WEB) {
    prev.value?.dispose();
    prev.value = picture;
  }
  return picture;
}
