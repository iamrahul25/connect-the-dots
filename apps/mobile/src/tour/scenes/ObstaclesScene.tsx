import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ObstacleGlyph, type GlyphKind } from '../../custom/ObstacleGlyph';
import { OBSTACLE_KINDS, obstacleName, type ObstacleKind } from '../../game/ObstacleInfo';
import { fonts } from '../../theme/tokens';
import { useTheme } from '../../theme/useTheme';
import { withAlpha } from '../../board/color';
import { haptics } from '../../services/haptics';
import { AutoBoard, autoBoardSize } from '../AutoBoard';
import { obstacleLevel } from '../data';
import { useInk, Pop, useTime } from '../kit';
import type { SceneProps } from '../types';

/** Time each obstacle's board stays on screen: it is drawn, solved slowly and celebrated in this window. */
export const OBSTACLE_SLOT = 3400;
const START = 380;
/** Left for the solved board's sweep and burst before the next obstacle swaps in. */
const CELEBRATE = 620;
const GAP = 70;
/** Obstacle boards play slower than the rest of the tour, so each trick can be followed. */
const MAX_CELL_MS = 130;
/** Height reserved for the "Obstacle: name" heading and its two-line tip. */
const HEAD_H = 34 + 4 + 40;
/** The row of obstacle buttons along the bottom. */
const ROW_H = 50;

const GLYPH: Record<ObstacleKind, GlyphKind> = {
  walls: 'wall',
  bridges: 'bridge',
  warps: 'warp',
  teleporters: 'teleporter',
  tunnels: 'tunnel',
  rotators: 'rotator',
  locks: 'lock',
};

/** How to get past each obstacle, in one breath. */
const TIP: Record<ObstacleKind, string> = {
  walls: 'Blocked squares: route your flows around them',
  bridges: 'Two flows cross here, straight over each other',
  warps: 'Leave one edge, come back in on the opposite edge',
  teleporters: 'Enter one portal, carry on out of its twin',
  tunnels: 'Only a straight flow fits: tap to turn the groove',
  rotators: 'The flow turns the corner: tap to spin the dial',
  locks: 'Run a flow through the key to open its door',
};

/**
 * Scene 3: each obstacle on a small real board, solved flow by flow under an "Obstacle: name" heading.
 * Controlled (`obstacle` + `onPick`): the tour's Back / Next step through the obstacles one at a time.
 * Uncontrolled (record mode): the obstacles play in turn by themselves.
 * Either way, tapping one in the bottom row replays it.
 */
export function ObstaclesScene({
  width,
  height,
  still,
  sound,
  obstacle,
  onPick,
}: SceneProps & { obstacle?: number; onPick?: (i: number) => void }) {
  const ink = useInk();
  const theme = useTheme();
  const t = useTime();
  const levels = useMemo(() => OBSTACLE_KINDS.map((k) => obstacleLevel(k)), []);
  const [own, setOwn] = useState(0);
  const controlled = obstacle !== undefined;
  const index = controlled ? obstacle : own;
  // Bumped on every tap so the same obstacle can be replayed.
  const [run, setRun] = useState(0);
  const kind = OBSTACLE_KINDS[index];
  const level = levels[index];
  const last = OBSTACLE_KINDS.length - 1;

  // Uncontrolled only: move on to the next obstacle once this one has played; a tap restarts the countdown.
  useEffect(() => {
    if (controlled || still || index >= last) return;
    const timer = setTimeout(() => {
      setOwn((i) => Math.min(last, i + 1));
      haptics.selection();
    }, t(OBSTACLE_SLOT));
    return () => clearTimeout(timer);
  }, [controlled, index, run, still, last, t]);

  const replay = (i: number) => {
    haptics.selection();
    if (controlled) onPick?.(i);
    else setOwn(i);
    setRun((r) => r + 1);
  };

  const top = height * 0.03;
  const boardTop = top + HEAD_H + 12;
  const boardMax = Math.max(0, Math.min(width * 0.84, height - boardTop - ROW_H - 16, 400));
  const size = level ? autoBoardSize(level, boardMax, boardMax, theme.board) : { width: 0, height: 0 };
  // Centered in the space between the heading and the button row.
  const boardY = boardTop + Math.max(0, (height - boardTop - ROW_H - 8 - size.height) / 2);
  // Fit the whole solve into the slot, but never faster than a slow, readable pace.
  const cellMs = useMemo(() => {
    if (!level) return 60;
    const pairs = level.dots.length;
    const steps = Object.values(level.solution).reduce((n, c) => n + Math.max(0, c.length - 1), 0);
    return Math.max(40, Math.min(MAX_CELL_MS, (OBSTACLE_SLOT - START - CELEBRATE - GAP * pairs) / Math.max(1, steps)));
  }, [level]);

  return (
    <View style={{ width, height }}>
      <View style={{ position: 'absolute', top, left: 16, right: 16, height: HEAD_H, alignItems: 'center' }} accessible accessibilityRole="header">
        <Pop key={`t-${kind}-${run}`} from={0.85} rise={12} still={still} style={{ alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, height: 34 }}>
            <ObstacleGlyph kind={GLYPH[kind]} size={28} />
            <Text style={{ fontFamily: fonts.title, fontSize: 24, color: ink.soft }}>Obstacle:</Text>
            <Text style={{ fontFamily: fonts.titleBold, fontSize: 24, color: ink.text }}>{obstacleName(kind)}</Text>
          </View>
          <Text style={{ fontFamily: fonts.bodyBold, fontSize: 15, lineHeight: 20, color: ink.soft, marginTop: 4, textAlign: 'center' }} numberOfLines={2}>
            {TIP[kind]}
          </Text>
        </Pop>
      </View>

      {level && (
        // Keyed by obstacle and replay count: each swap or tap remounts and springs the board in.
        <Pop key={`${kind}-${run}`} from={0.78} rise={24} still={still} style={{ position: 'absolute', top: boardY, left: (width - size.width) / 2 }}>
          <View>
            <AutoBoard level={level} maxW={boardMax} maxH={boardMax} mode="sequence" startAt={START} cellMs={cellMs} gapMs={GAP} still={still} sound={sound} />
          </View>
        </Pop>
      )}

      {/* The seven obstacles: shows progress, and a tap replays that obstacle. */}
      <View style={{ position: 'absolute', bottom: 4, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 8 }}>
        {OBSTACLE_KINDS.map((k, i) => (
          <Pop key={k} delay={i * 60} from={0.4} rise={0} still={still}>
            <Pressable
              onPress={() => replay(i)}
              hitSlop={4}
              accessibilityRole="button"
              accessibilityLabel={`Play ${obstacleName(k)}`}
              style={({ pressed }) => ({
                width: 38,
                height: 38,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: i === index ? withAlpha(ink.accent, 0.25) : ink.surface,
                borderWidth: i === index ? 2 : 1,
                borderColor: i === index ? ink.accent : ink.border,
                opacity: pressed ? 0.6 : i <= index ? 1 : 0.5,
                transform: [{ scale: i === index ? 1.12 : 1 }],
              })}
            >
              <ObstacleGlyph kind={GLYPH[k]} size={24} baked />
            </Pressable>
          </Pop>
        ))}
      </View>
    </View>
  );
}
