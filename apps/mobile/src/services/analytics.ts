import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useSegments } from 'expo-router';
import PostHog from 'posthog-react-native';
import { useSettings, useSettingsHydrated } from '../store/settings';

/**
 * Anonymous product analytics (PostHog), Android/iOS only.
 *
 * - No sign-in and no `identify()`: every install gets a random anonymous ID, nothing else about the player.
 * - GeoIP is turned off, so PostHog stores no location derived from the IP address.
 * - No autocapture of taps and no session replay: only the named events below and screen views.
 * - Players can switch it off in Settings → Privacy ("Share usage data").
 * - Disabled on web and whenever no API key is configured (EXPO_PUBLIC_POSTHOG_API_KEY in apps/mobile/.env).
 *
 * If you add events or properties, keep the privacy policy and the Play Console Data safety form in step.
 */

const API_KEY = process.env.EXPO_PUBLIC_POSTHOG_API_KEY ?? '';
const HOST = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
export const analyticsAvailable = Platform.OS !== 'web' && API_KEY.length > 0;

type Props = Record<string, string | number | boolean | null>;

let client: PostHog | null = null;

function start(): void {
  if (client || !analyticsAvailable) return;
  const optedIn = useSettings.getState().analytics;
  client = new PostHog(API_KEY, {
    host: HOST,
    defaultOptIn: optedIn,
    captureAppLifecycleEvents: true,
    disableGeoip: true,
    enableSessionReplay: false,
    preloadFeatureFlags: false,
  });
  // The SDK persists its own opt-in flag; keep it matched to the player's setting.
  if (optedIn) void client.optIn();
  else void client.optOut();
  void client.register({ build: __DEV__ ? 'development' : 'production' });

  useSettings.subscribe((s, prev) => {
    if (!client || s.analytics === prev.analytics) return;
    if (s.analytics) void client.optIn();
    else void client.optOut();
  });
}

/** Records one named event. No-op when analytics is off or unavailable. */
export function track(event: string, props?: Props): void {
  if (!client || !useSettings.getState().analytics) return;
  client.capture(event, props);
}

/** Mount once in the root layout: starts PostHog after settings load and records screen views. */
export function useAnalytics(): void {
  const hydrated = useSettingsHydrated();
  const segments = useSegments();
  // Route pattern such as `/play/[id]`, so screen names don't include level IDs.
  const screen = '/' + segments.join('/');

  useEffect(() => {
    if (hydrated) start();
  }, [hydrated]);

  useEffect(() => {
    if (!hydrated || !client || !useSettings.getState().analytics) return;
    void client.screen(screen === '/' ? 'home' : screen);
  }, [hydrated, screen]);
}
