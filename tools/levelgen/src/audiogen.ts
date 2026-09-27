/**
 * Procedurally synthesizes every sound in the game (CC0 by construction):
 * pentatonic "glass kalimba" notes, UI effects, and one ambient loop per pack.
 * Output: apps/mobile/assets/audio/*.wav (16-bit mono PCM).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRng } from '@ctd/core';
import { ROOT } from './io';

const OUT = path.join(ROOT, 'apps/mobile/assets/audio');
const SFX_RATE = 22050;
const MUSIC_RATE = 16000;

function writeWav(name: string, samples: Float32Array, rate: number): void {
  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  const gain = peak > 0.98 ? 0.98 / peak : 1;
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + samples.length * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(rate, 24);
  buf.writeUInt32LE(rate * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(samples.length * 2, 40);
  for (let i = 0; i < samples.length; i++) {
    buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, samples[i] * gain)) * 32767), 44 + i * 2);
  }
  fs.writeFileSync(path.join(OUT, `${name}.wav`), buf);
}

const TAU = Math.PI * 2;
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** Bell/kalimba tone: slightly inharmonic partials with fast-decaying highs. */
function addBell(out: Float32Array, rate: number, start: number, freq: number, amp: number, decay = 2.2): void {
  const partials: [number, number, number][] = [
    [1, 1, 1],
    [2.0, 0.28, 1.8],
    [3.01, 0.12, 2.8],
    [5.4, 0.06, 5],
  ];
  const s0 = Math.floor(start * rate);
  const len = Math.min(out.length - s0, Math.floor(rate * (5 / decay)));
  for (let i = 0; i < len; i++) {
    const t = i / rate;
    const attack = Math.min(1, t / 0.004);
    let v = 0;
    for (const [mul, a, dm] of partials) v += a * Math.sin(TAU * freq * mul * t) * Math.exp(-t * decay * dm);
    out[s0 + i] += v * amp * attack;
  }
}

function blip(rate: number, dur: number, f0: number, f1: number, amp: number, decay: number): Float32Array {
  const out = new Float32Array(Math.floor(rate * dur));
  let phase = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / rate;
    const f = f0 + (f1 - f0) * (t / dur);
    phase += (TAU * f) / rate;
    out[i] = Math.sin(phase) * Math.exp(-t * decay) * Math.min(1, t / 0.002) * amp;
  }
  return out;
}

function noiseSweep(rate: number, dur: number, amp: number, seed: number, rising: boolean): Float32Array {
  const rng = createRng(seed);
  const out = new Float32Array(Math.floor(rate * dur));
  let lp = 0;
  for (let i = 0; i < out.length; i++) {
    const t = i / out.length;
    const cutoff = rising ? 0.02 + t * 0.35 : 0.37 - t * 0.35;
    lp += cutoff * ((rng.next() * 2 - 1) - lp);
    out[i] = lp * Math.sin(Math.PI * t) * amp;
  }
  return out;
}

// C major pentatonic, two octaves from C5: one note per palette color.
const PENTATONIC = [72, 74, 76, 79, 81, 84, 86, 88, 91, 93, 96, 98];

function buildSfx(): void {
  PENTATONIC.forEach((n, i) => {
    const out = new Float32Array(Math.floor(SFX_RATE * 1.4));
    addBell(out, SFX_RATE, 0, midi(n), 0.55, 2.6);
    addBell(out, SFX_RATE, 0, midi(n) * 1.003, 0.2, 3.2);
    writeWav(`note_${String(i).padStart(2, '0')}`, out, SFX_RATE);
  });

  writeWav('tap', blip(SFX_RATE, 0.09, 900, 1300, 0.5, 45), SFX_RATE);
  writeWav('tick', blip(SFX_RATE, 0.045, 1900, 2100, 0.22, 90), SFX_RATE);
  writeWav('retract', blip(SFX_RATE, 0.08, 700, 420, 0.3, 40), SFX_RATE);
  writeWav('invalid', blip(SFX_RATE, 0.16, 190, 120, 0.6, 22), SFX_RATE);
  writeWav('button', blip(SFX_RATE, 0.07, 620, 880, 0.4, 50), SFX_RATE);
  writeWav('cut', noiseSweep(SFX_RATE, 0.16, 1.6, 11, false), SFX_RATE);
  writeWav('warp', noiseSweep(SFX_RATE, 0.32, 1.8, 12, true), SFX_RATE);

  const stars = [88, 91, 96];
  stars.forEach((n, i) => {
    const out = new Float32Array(Math.floor(SFX_RATE * 0.9));
    addBell(out, SFX_RATE, 0, midi(n), 0.5, 4);
    addBell(out, SFX_RATE, 0.05, midi(n + 12), 0.18, 6);
    writeWav(`star_${i + 1}`, out, SFX_RATE);
  });

  {
    const out = new Float32Array(Math.floor(SFX_RATE * 0.8));
    [84, 88, 91, 96, 100].forEach((n, i) => addBell(out, SFX_RATE, i * 0.06, midi(n), 0.3, 5));
    writeWav('hint', out, SFX_RATE);
  }
  {
    const out = new Float32Array(Math.floor(SFX_RATE * 2.6));
    [72, 76, 79, 84, 88, 91, 96].forEach((n, i) => addBell(out, SFX_RATE, i * 0.09, midi(n), 0.4, 1.8));
    // Warm pad swell underneath.
    for (let i = 0; i < out.length; i++) {
      const t = i / SFX_RATE;
      const env = Math.sin(Math.PI * Math.min(1, t / 2.6)) * 0.12;
      out[i] += env * (Math.sin(TAU * midi(60) * t) + 0.6 * Math.sin(TAU * midi(64) * t) + 0.5 * Math.sin(TAU * midi(67) * t));
    }
    writeWav('level_complete', out, SFX_RATE);
  }
  {
    const out = new Float32Array(Math.floor(SFX_RATE * 1.8));
    [67, 72, 76, 79, 84, 88].forEach((n, i) => addBell(out, SFX_RATE, i * 0.12, midi(n), 0.4, 2));
    writeWav('pack_unlock', out, SFX_RATE);
  }
}

/** Slow evolving pad with sparse pentatonic plucks; loops seamlessly via crossfade. */
function buildAmbient(name: string, root: number, chords: number[][], seed: number): void {
  const LOOP = 24;
  const FADE = 2;
  const total = Math.floor(MUSIC_RATE * (LOOP + FADE));
  const out = new Float32Array(total);
  const chordLen = LOOP / chords.length;
  for (let i = 0; i < total; i++) {
    const t = i / MUSIC_RATE;
    const ci = Math.floor((t % LOOP) / chordLen);
    const local = (t % LOOP) - ci * chordLen;
    const next = chords[(ci + 1) % chords.length];
    const blend = Math.max(0, (local - (chordLen - 1.5)) / 1.5);
    let v = 0;
    const voice = (notes: number[], w: number) => {
      for (const n of notes) {
        const f = midi(root + n);
        v += w * (Math.sin(TAU * f * t) + 0.5 * Math.sin(TAU * f * 1.004 * t + 1) + 0.25 * Math.sin(TAU * f * 2 * t));
      }
    };
    voice(chords[ci], 1 - blend);
    if (blend > 0) voice(next, blend);
    const lfo = 0.75 + 0.25 * Math.sin(TAU * t * 0.08);
    out[i] = v * 0.05 * lfo;
  }
  const rng = createRng(seed);
  const scale = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21];
  for (let t = 0.5; t < LOOP; t += 0.9 + rng.next() * 1.6) {
    const n = root + 24 + scale[rng.int(scale.length)];
    addBell(out, MUSIC_RATE, t, midi(n), 0.07 + rng.next() * 0.05, 1.4);
  }
  const loop = new Float32Array(Math.floor(MUSIC_RATE * LOOP));
  const fadeN = Math.floor(MUSIC_RATE * FADE);
  for (let i = 0; i < loop.length; i++) loop[i] = out[i];
  for (let i = 0; i < fadeN; i++) {
    const a = i / fadeN;
    loop[i] = out[i] * a + out[loop.length + i] * (1 - a);
  }
  writeWav(`ambient_${name}`, loop, MUSIC_RATE);
}

fs.mkdirSync(OUT, { recursive: true });
buildSfx();
buildAmbient('dawn', 48, [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]], 1);
buildAmbient('lagoon', 50, [[0, 3, 7], [5, 8, 12], [3, 7, 10], [-2, 2, 5]], 2);
buildAmbient('ember', 45, [[0, 3, 7], [-4, 0, 3], [-2, 2, 5], [0, 3, 7, 10]], 3);
buildAmbient('aurora', 52, [[0, 4, 7, 11], [2, 5, 9], [4, 7, 11], [5, 9, 12]], 4);
buildAmbient('cosmos', 43, [[0, 7, 14], [3, 10, 15], [5, 12, 17], [-2, 5, 12]], 5);
console.log(`audio written to ${path.relative(ROOT, OUT)}`);
