import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useSettings } from '../store/settings';

const enabled = () => Platform.OS !== 'web' && useSettings.getState().haptics;
let lastSelection = 0;

/** Haptics are a no-op on web and when disabled in settings. */
export const haptics = {
  selection() {
    if (!enabled()) return;
    const now = Date.now();
    if (now - lastSelection < 40) return;
    lastSelection = now;
    Haptics.selectionAsync().catch(() => {});
  },
  light() {
    if (enabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  },
  soft() {
    if (enabled()) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft).catch(() => {});
  },
  warning() {
    if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  },
  success() {
    if (enabled()) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  },
};
