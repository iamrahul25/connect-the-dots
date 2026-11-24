import React, { useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { Canvas, Picture } from '@shopify/react-native-skia';
import { Ionicons } from '@expo/vector-icons';
import { DAILY_TIERS, dateKey, type DailyTier } from '@ctd/core';
import { dailyPreview } from '../../data/levels';
import { fonts } from '../../theme/tokens';
import { audio } from '../../services/audio';
import { haptics } from '../../services/haptics';
import { withAlpha } from '../../board/color';
import { Caption, useInk, Pop, useBeats, useFx, useFxPicture } from '../kit';
import type { SceneProps } from '../types';

const TIER: Record<DailyTier, { name: string; icon: keyof typeof Ionicons.glyphMap; tone: 'success' | 'hint' | 'danger' }> = {
  easy: { name: 'Easy', icon: 'leaf', tone: 'success' },
  medium: { name: 'Medium', icon: 'flash', tone: 'hint' },
  hard: { name: 'Hard', icon: 'diamond', tone: 'danger' },
};

const DAYS_AT = 700;
const DAY_STEP = 170;
const SOLVE_AT = 2050;
const SOLVE_STEP = 330;
const CROWN_AT = SOLVE_AT + SOLVE_STEP * 3 + 150;

/** Scene 5: today's three puzzles, a week of solved days, a growing streak and the crown. */
export function DailyScene({ width, height, still, sound }: SceneProps) {
  const ink = useInk();
  const { fx, emit } = useFx(still);
  const fxPicture = useFxPicture(fx);
  const today = useMemo(() => new Date(), []);
  const key = dateKey(today);
  const previews = useMemo(() => DAILY_TIERS.map((t) => dailyPreview(key, t)), [key]);
  const week = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const d = new Date(today);
        d.setDate(d.getDate() - 6 + i);
        return { letter: d.toLocaleDateString(undefined, { weekday: 'narrow' }), day: d.getDate() };
      }),
    [today],
  );
  const [days, setDays] = useState(still ? 7 : 0);
  const [solved, setSolved] = useState(still ? 3 : 0);
  const [crown, setCrown] = useState(still);
  const flame = useSharedValue(1);
  const flameStyle = useAnimatedStyle(() => ({ transform: [{ scale: flame.value }] }));

  const colW = Math.min(width - 32, 420);
  const left = (width - colW) / 2;
  const cardH = 62;
  // Header, three cards and the week strip, centered in the space above the caption.
  const blockH = 76 + cardH * 3 + 16 * 2 + 22 + 56;
  const headTop = Math.max(height * 0.03, (height * 0.84 - blockH) / 2);
  const cardsTop = headTop + 76;
  const weekTop = cardsTop + cardH * 3 + 16 * 2 + 22;

  useBeats(
    still
      ? []
      : [
          ...[0, 1, 2].map((i): [number, () => void] => [120 + i * 140, () => sound && audio.play('tap', { volume: 0.35 })]),
          ...Array.from({ length: 7 }, (_, i): [number, () => void] => [
            DAYS_AT + i * DAY_STEP,
            () => {
              setDays(i + 1);
              flame.set(withSequence(withTiming(1.35, { duration: 90 }), withSpring(1, { damping: 6, stiffness: 260 })));
              if (sound) audio.note(i + 2, 0.45);
              haptics.selection();
            },
          ]),
          ...[0, 1, 2].map((i): [number, () => void] => [
            SOLVE_AT + i * SOLVE_STEP,
            () => {
              setSolved(i + 1);
              if (sound) audio.play(`star_${i + 1}` as 'star_1');
              haptics.light();
              emit({ kind: 'burst', dur: 650, x: left + colW - 50, y: cardsTop + i * (cardH + 16) + cardH / 2, color: ink[TIER[DAILY_TIERS[i]].tone], count: 14, radius: 46, seed: i + 3 });
            },
          ]),
          [
            CROWN_AT,
            () => {
              setCrown(true);
              if (sound) audio.play('pack_unlock', { volume: 0.6 });
              haptics.success();
              emit({ kind: 'burst', dur: 1000, x: width / 2 - 92, y: headTop + 20, color: ink.gold, count: 30, radius: 110, seed: 9 });
              emit({ kind: 'ring', dur: 800, x: width / 2 - 92, y: headTop + 20, color: ink.gold, r0: 16, r1: 110, width: 4 });
            },
          ],
        ],
  );

  return (
    <View style={{ width, height }}>
      <Pop delay={0} still={still} style={{ position: 'absolute', top: headTop, left: 0, right: 0, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 44, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            {crown && (
              <Pop from={0.1} rise={-30} still={still}>
                <Text style={{ fontSize: 30 }}>👑</Text>
              </Pop>
            )}
          </View>
          <Text style={{ fontFamily: fonts.titleBold, fontSize: 26, color: ink.text }}>Daily Puzzle</Text>
          <View style={{ width: 44 }} />
        </View>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 2, color: ink.soft }}>
          {today.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()}
        </Text>
      </Pop>

      {DAILY_TIERS.map((tier, i) => {
        const meta = TIER[tier];
        const color = ink[meta.tone];
        const done = solved > i;
        return (
          <Pop key={tier} delay={120 + i * 140} from={0.7} rise={24} still={still} style={{ position: 'absolute', top: cardsTop + i * (cardH + 16), left, width: colW }}>
            <View
              style={{
                height: cardH,
                borderRadius: 20,
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 14,
                gap: 12,
                backgroundColor: done ? withAlpha(color, 0.14) : ink.surface,
                borderWidth: 1.5,
                borderColor: done ? color : withAlpha(color, 0.5),
              }}
            >
              <View style={{ width: 38, height: 38, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(color, 0.18) }}>
                <Ionicons name={meta.icon} size={20} color={color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontFamily: fonts.title, fontSize: 18, color: ink.text }}>{meta.name}</Text>
                <Text style={{ fontFamily: fonts.body, fontSize: 12, color: ink.soft }}>
                  {previews[i].size}×{previews[i].size} · {previews[i].obstacles} {previews[i].obstacles === 1 ? 'obstacle' : 'obstacles'}
                </Text>
              </View>
              {done ? (
                <Pop from={0.2} rise={0} still={still} style={{ flexDirection: 'row', gap: 2 }}>
                  {[0, 1, 2].map((s) => (
                    <Ionicons key={s} name="star" size={18} color={ink.gold} />
                  ))}
                </Pop>
              ) : (
                <Ionicons name="play-circle" size={30} color={color} />
              )}
            </View>
          </Pop>
        );
      })}

      <Pop delay={550} from={0.8} still={still} style={{ position: 'absolute', top: weekTop, left, width: colW }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {week.map((d, i) => (
              <DayTile key={i} letter={d.letter} day={d.day} on={days > i} still={still} size={Math.min(36, (colW - 110) / 7 - 6)} />
            ))}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Animated.View style={flameStyle}>
              <Ionicons name="flame" size={30} color={ink.flame} style={{ textShadowColor: ink.flame, textShadowRadius: 14 }} />
            </Animated.View>
            <View>
              <Text style={{ fontFamily: fonts.titleBold, fontSize: 24, lineHeight: 26, color: ink.text, fontVariant: ['tabular-nums'] }}>{days}</Text>
              <Text style={{ fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1, color: ink.soft }}>STREAK</Text>
            </View>
          </View>
        </View>
      </Pop>

      <Canvas style={{ position: 'absolute', width, height }} pointerEvents="none">
        <Picture picture={fxPicture} />
      </Canvas>

      <Caption text={'New challenges.\nEvery single day.'} delay={2300} still={still} size={26} style={{ position: 'absolute', bottom: height * 0.05, left: 16, right: 16 }} />
    </View>
  );
}

/** A calendar day that flips over to its solved side. */
function DayTile({ letter, day, on, still, size }: { letter: string; day: number; on: boolean; still: boolean; size: number }) {
  const ink = useInk();
  const flip = useSharedValue(on ? 1 : 0);
  const on_ = ink.flame;
  const off = ink.pill;
  const border = ink.border;
  React.useEffect(() => {
    flip.set(still ? (on ? 1 : 0) : withTiming(on ? 1 : 0, { duration: 260 }));
  }, [on, still, flip]);
  const style = useAnimatedStyle(() => ({
    transform: [{ scaleX: Math.max(0.04, Math.abs(Math.cos(flip.value * Math.PI))) }],
    backgroundColor: flip.value > 0.5 ? on_ : off,
    borderColor: flip.value > 0.5 ? on_ : border,
  }));
  return (
    <View style={{ alignItems: 'center', gap: 3 }}>
      <Text style={{ fontFamily: fonts.bodyBold, fontSize: 10, color: ink.faint }}>{letter}</Text>
      <Animated.View style={[{ width: size, height: size, borderRadius: size * 0.32, borderWidth: 1, alignItems: 'center', justifyContent: 'center' }, style]}>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: size * 0.38, color: on ? ink.surface : ink.text }}>{on ? '✓' : day}</Text>
      </Animated.View>
    </View>
  );
}
