import React, { useEffect } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Tour } from '../tour/Tour';
import type { TourMode } from '../tour/types';
import { useSettings } from '../store/settings';
import { nextToPlay, useProgress } from '../store/progress';
import { track } from '../services/analytics';

/**
 * `/tour?mode=onboarding|help|record`. Onboarding opens on first launch and ends in the first level;
 * help is replayed from How to Play or Settings; record is a clean full-screen cut for promo videos.
 */
export default function TourRoute() {
  const { mode: raw, theme } = useLocalSearchParams<{ mode?: string; theme?: string }>();
  const mode: TourMode = raw === 'record' || raw === 'help' ? raw : 'onboarding';

  // Marked as soon as it opens, so a crash or a killed app can never trap a player in a replay loop.
  useEffect(() => {
    if (mode === 'onboarding' && !useSettings.getState().tourSeen) useSettings.getState().set({ tourSeen: true });
  }, [mode]);

  const close = () => {
    if (mode !== 'record') track('tour_closed', { mode });
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  // Play always starts the player's next level, whether the tour opened on first launch or from help.
  const play = () => {
    if (mode !== 'record') track('tour_finished', { mode });
    router.replace(`/play/${nextToPlay(useProgress.getState().levels)}`);
  };

  return <Tour mode={mode} theme={theme} onPlay={play} onClose={close} />;
}
