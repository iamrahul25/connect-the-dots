import '@expo/metro-runtime';
import { App } from 'expo-router/build/qualified-entry';
import { renderRootComponent } from 'expo-router/build/renderRootComponent';
import { LoadSkiaWeb } from '@shopify/react-native-skia/lib/module/web';

// CanvasKit (Skia WASM) must be loaded before any Skia component renders.
LoadSkiaWeb({ locateFile: (file: string) => `/${file}` }).then(() => {
  renderRootComponent(App);
});
