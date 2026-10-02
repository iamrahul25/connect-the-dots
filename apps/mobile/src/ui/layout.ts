import { useWindowDimensions } from 'react-native';
import { LANDSCAPE_H } from './Background';
import { makeScaler, scaleFor } from '../theme/scale';

/** Content column widths: `narrow` for menus and forms, `wide` for grids, `full` for edge-to-edge. */
export type ContentWidth = 'narrow' | 'wide' | 'full';

/** Base (phone) column widths; multiplied by the UI scale so columns grow with the content inside them. */
const MAX_WIDTH = { narrow: 480, wide: 600 };

/** Breakpoint-aware sizes shared by every screen. Tablet = shortest side ≥ 600dp, in either orientation. */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const tablet = Math.min(width, height) >= 600;
  const scale = scaleFor(width, height);
  const s = makeScaler(scale);
  const gutter = tablet ? 32 : 16;
  const available = width - gutter * 2;
  const contentWidth = (kind: ContentWidth) => (kind === 'full' ? available : Math.min(available, s(MAX_WIDTH[kind])));
  return {
    width,
    height,
    tablet,
    gutter,
    /** UI scale relative to the reference phone (1 = phone, up to 1.5 on large tablets). */
    scale,
    /** Scales a base phone size for this screen. */
    s,
    contentWidth,
    /** Bottom space that keeps scrollable content clear of the landscape artwork. */
    landscapeClearance: Math.round(LANDSCAPE_H * 0.6),
  };
}
