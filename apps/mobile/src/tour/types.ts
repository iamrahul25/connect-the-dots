/** What every tour scene receives. */
export interface SceneProps {
  /** Stage size the scene may draw in (below the progress bar, above the safe-area bottom). */
  width: number;
  height: number;
  /** Reduce Motion: show calm, finished frames instead of busy motion. */
  still: boolean;
  /** Play the engine's sounds (respects the player's sound settings in the audio service). */
  sound: boolean;
}

export type TourMode = 'onboarding' | 'help' | 'record';
