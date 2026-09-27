import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';
import { useSettings } from '../store/settings';

const SFX = {
  tap: require('../../assets/audio/tap.wav'),
  tick: require('../../assets/audio/tick.wav'),
  retract: require('../../assets/audio/retract.wav'),
  invalid: require('../../assets/audio/invalid.wav'),
  button: require('../../assets/audio/button.wav'),
  cut: require('../../assets/audio/cut.wav'),
  warp: require('../../assets/audio/warp.wav'),
  hint: require('../../assets/audio/hint.wav'),
  level_complete: require('../../assets/audio/level_complete.wav'),
  pack_unlock: require('../../assets/audio/pack_unlock.wav'),
  star_1: require('../../assets/audio/star_1.wav'),
  star_2: require('../../assets/audio/star_2.wav'),
  star_3: require('../../assets/audio/star_3.wav'),
} as const;

const NOTES = [
  require('../../assets/audio/note_00.wav'),
  require('../../assets/audio/note_01.wav'),
  require('../../assets/audio/note_02.wav'),
  require('../../assets/audio/note_03.wav'),
  require('../../assets/audio/note_04.wav'),
  require('../../assets/audio/note_05.wav'),
  require('../../assets/audio/note_06.wav'),
  require('../../assets/audio/note_07.wav'),
  require('../../assets/audio/note_08.wav'),
  require('../../assets/audio/note_09.wav'),
  require('../../assets/audio/note_10.wav'),
  require('../../assets/audio/note_11.wav'),
];

const MUSIC: Record<string, number> = {
  dawn: require('../../assets/audio/ambient_dawn.wav'),
  lagoon: require('../../assets/audio/ambient_lagoon.wav'),
  ember: require('../../assets/audio/ambient_ember.wav'),
  aurora: require('../../assets/audio/ambient_aurora.wav'),
  cosmos: require('../../assets/audio/ambient_cosmos.wav'),
};

export type SfxName = keyof typeof SFX;

const MUSIC_VOLUME = 0.4;
/** Small pools so rapid repeats (ticks, notes) can overlap. */
const POOL_SIZE: Partial<Record<SfxName, number>> = { tick: 3, tap: 2, retract: 2 };

class AudioService {
  private pools = new Map<string, { players: AudioPlayer[]; next: number }>();
  private music: AudioPlayer | null = null;
  private musicTrack: string | null = null;
  private wantedTrack: string | null = null;
  private unlocked = false;
  private ducking: ReturnType<typeof setTimeout> | null = null;

  private pool(key: string, source: number, size: number) {
    let p = this.pools.get(key);
    if (!p) {
      p = { players: Array.from({ length: size }, () => createAudioPlayer(source)), next: 0 };
      this.pools.set(key, p);
    }
    return p;
  }

  private playSource(key: string, source: number, size: number, volume = 1, rate = 1) {
    if (!useSettings.getState().sfx) return;
    try {
      const p = this.pool(key, source, size);
      const player = p.players[p.next];
      p.next = (p.next + 1) % p.players.length;
      player.volume = volume;
      if (rate !== 1) player.setPlaybackRate(rate);
      player.seekTo(0).catch(() => {});
      player.play();
    } catch {
      // Audio is non-essential; never let it break gameplay.
    }
  }

  /** Call from the first user gesture (browsers block audio before that). */
  unlock() {
    if (this.unlocked) return;
    this.unlocked = true;
    setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'mixWithOthers' }).catch(() => {});
    this.preload();
    if (this.wantedTrack) this.playMusic(this.wantedTrack);
  }

  preload() {
    for (const [k, src] of Object.entries(SFX)) this.pool(k, src, POOL_SIZE[k as SfxName] ?? 1);
  }

  play(name: SfxName, opts: { volume?: number; rate?: number } = {}) {
    this.playSource(name, SFX[name], POOL_SIZE[name] ?? 1, opts.volume ?? 1, opts.rate ?? 1);
  }

  /** Pentatonic note for a palette color index. */
  note(colorIndex: number, volume = 0.8) {
    const i = ((colorIndex % NOTES.length) + NOTES.length) % NOTES.length;
    this.playSource(`note_${i}`, NOTES[i], 2, volume);
  }

  playMusic(track: string) {
    this.wantedTrack = track;
    if (!this.unlocked || !useSettings.getState().music) return;
    const src = MUSIC[track] ?? MUSIC.dawn;
    try {
      if (!this.music) {
        this.music = createAudioPlayer(src);
        this.music.loop = true;
      } else if (this.musicTrack !== track) {
        this.music.replace(src);
        this.music.loop = true;
      }
      this.musicTrack = track;
      this.music.volume = MUSIC_VOLUME;
      this.music.play();
    } catch {
      // ignore
    }
  }

  stopMusic() {
    try {
      this.music?.pause();
    } catch {
      // ignore
    }
  }

  /** Lowers music during the level-complete sting. */
  duck(ms = 2600) {
    if (!this.music) return;
    this.music.volume = MUSIC_VOLUME * 0.35;
    if (this.ducking) clearTimeout(this.ducking);
    this.ducking = setTimeout(() => {
      if (this.music) this.music.volume = MUSIC_VOLUME;
    }, ms);
  }

  applySettings() {
    const { music } = useSettings.getState();
    if (!music) this.stopMusic();
    else if (this.wantedTrack) this.playMusic(this.wantedTrack);
  }
}

export const audio = new AudioService();

useSettings.subscribe((s, prev) => {
  if (s.music !== prev.music) audio.applySettings();
});
