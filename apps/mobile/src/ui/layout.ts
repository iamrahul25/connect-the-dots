import { useWindowDimensions } from 'react-native';
import { LANDSCAPE_H } from './Background';

/** Content column widths: `narrow` for menus and forms, `wide` for grids, `full` for edge-to-edge. */
export type ContentWidth = 'narrow' | 'wide' | 'full';

const MAX_WIDTH = {
  phone: { narrow: 480, wide: 560 },
  tablet: { narrow: 560, wide: 760 },
};

/** Breakpoint-aware sizes shared by every screen. Tablet = shortest side ≥ 600dp, in either orientation. */
export function useLayout() {
  const { width, height } = useWindowDimensions();
  const tablet = Math.min(width, height) >= 600;
  const gutter = tablet ? 32 : 16;
  const available = width - gutter * 2;
  const max = MAX_WIDTH[tablet ? 'tablet' : 'phone'];
  const contentWidth = (kind: ContentWidth) => (kind === 'full' ? available : Math.min(available, max[kind]));
  return {
    width,
    height,
    tablet,
    gutter,
    contentWidth,
    /** Bottom space that keeps scrollable content clear of the landscape artwork. */
    landscapeClearance: Math.round(LANDSCAPE_H * 0.6),
  };
}
