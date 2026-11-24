import React, { useMemo } from 'react';
import { Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SuiteId } from '@ctd/core';
import { AutoBoard } from '../AutoBoard';
import { fonts } from '../../theme/tokens';
import { audio } from '../../services/audio';
import { haptics } from '../../services/haptics';
import { libraryStats, tourLevels } from '../data';
import { withAlpha } from '../../board/color';
import { Caption, useInk, Pop, useBeats, useCountUp } from '../kit';
import type { SceneProps } from '../types';

const SUITE: Record<SuiteId, { name: string; icon: keyof typeof Ionicons.glyphMap; tone: 'info' | 'heart' | 'hint' }> = {
  single: { name: 'Single\nObstacle', icon: 'cube', tone: 'info' },
  multi: { name: 'Multiple\nObstacles', icon: 'layers', tone: 'heart' },
  handcrafted: { name: 'Hand-\ncrafted', icon: 'brush', tone: 'hint' },
};

const TIERS = ['Beginner', 'Tricky', 'Expert'];
const TIER_TONES = ['success', 'hint', 'danger'] as const;
/** When the first board pops in, and the stagger between boards. */
const BOARDS_AT = 1900;
const BOARD_STEP = 420;

/** Scene 4: the library — suites, the real level count, and solved boards that grow harder. */
export function JourneyScene({ width, height, still, sound }: SceneProps) {
  const ink = useInk();
  const stats = useMemo(() => libraryStats(), []);
  const boards = useMemo(() => tourLevels().growth, []);
  const count = useCountUp(stats.levels, 1500, 900, still);

  useBeats(
    still
      ? []
      : [
          ...[0, 1, 2].map((i): [number, () => void] => [150 + i * 140, () => sound && audio.play('tap', { volume: 0.35 })]),
          ...[0, 1, 2].map((i): [number, () => void] => [
            BOARDS_AT + i * BOARD_STEP,
            () => {
              if (sound) audio.note(4 + i * 3, 0.55);
              haptics.light();
            },
          ]),
          [2400, () => sound && audio.play('pack_unlock', { volume: 0.5 })],
        ],
  );

  const cardW = Math.min(118, (width - 16 * 2 - 10 * 2) / 3);
  // Boards grow: each is ~40% larger than the last, together filling the row.
  const unit = Math.min((width - 32 - 24) / (1 + 1.35 + 1.8), height * 0.17);
  const sizes = [unit, unit * 1.35, unit * 1.8];

  return (
    <View style={{ width, height }}>
      <View style={{ position: 'absolute', top: height * 0.04, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
        {stats.suites.map((s, i) => {
          const meta = SUITE[s.id];
          const color = ink[meta.tone];
          return (
            <Pop key={s.id} delay={150 + i * 140} from={0.5} still={still}>
              <View
                style={{
                  width: cardW,
                  paddingVertical: 12,
                  paddingHorizontal: 6,
                  borderRadius: 18,
                  alignItems: 'center',
                  backgroundColor: ink.surface,
                  borderWidth: 1,
                  borderColor: ink.border,
                  shadowColor: ink.shadow,
                  shadowOpacity: 1,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 3 },
                }}
              >
                <View style={{ width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: withAlpha(color, 0.18) }}>
                  <Ionicons name={meta.icon} size={22} color={color} />
                </View>
                <Text style={{ fontFamily: fonts.title, fontSize: 14, lineHeight: 17, color: ink.text, textAlign: 'center', marginTop: 6 }}>{meta.name}</Text>
                <Text style={{ fontFamily: fonts.bodyBold, fontSize: 12, color, marginTop: 2 }}>
                  {s.packs} {s.packs === 1 ? 'pack' : 'packs'}
                </Text>
              </View>
            </Pop>
          );
        })}
      </View>

      <Pop delay={800} from={0.6} still={still} style={{ position: 'absolute', top: height * 0.27, left: 0, right: 0, alignItems: 'center' }}>
        <Text
          style={{
            fontFamily: fonts.titleBold,
            fontSize: Math.min(64, width * 0.17),
            color: ink.text,
            fontVariant: ['tabular-nums'],
          }}
        >
          {count.toLocaleString()}
        </Text>
        <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, letterSpacing: 3, color: ink.soft, marginTop: -4 }}>LEVELS TO CONQUER</Text>
      </Pop>

      <View style={{ position: 'absolute', top: height * 0.47, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 12 }}>
        {boards.map((level, i) => (
          <Pop key={level.id} delay={BOARDS_AT + i * BOARD_STEP} from={0.3} rise={30} still={still} style={{ alignItems: 'center' }}>
            {/* The real board, filling in its solution right after it pops in; no confetti for these. */}
            <AutoBoard
              level={level}
              maxW={sizes[i]}
              maxH={sizes[i]}
              mode="together"
              startAt={BOARDS_AT + i * BOARD_STEP + 250}
              cellMs={55}
              sound={false}
              celebrate={false}
              still={still}
            />
            <Text style={{ fontFamily: fonts.title, fontSize: 14, color: ink.text, marginTop: 8 }}>
              {level.size.width}×{level.size.height}
            </Text>
            <Text style={{ fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1.5, color: ink[TIER_TONES[i]] }}>{TIERS[i].toUpperCase()}</Text>
          </Pop>
        ))}
      </View>

      <Caption text={'Easy to learn.\nChallenging to master.'} delay={3000} still={still} size={26} style={{ position: 'absolute', bottom: height * 0.05, left: 16, right: 16 }} />
    </View>
  );
}
