import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { Canvas, Picture } from '@shopify/react-native-skia';
import { Logo } from '../../ui/Logo';
import { GlassButton } from '../../ui/GlassButton';
import { fonts } from '../../theme/tokens';
import { usePalette, useTheme } from '../../theme/useTheme';
import { audio } from '../../services/audio';
import { haptics } from '../../services/haptics';
import { AutoBoard, autoBoardSize } from '../AutoBoard';
import { tourLevels } from '../data';
import { Breathe, useInk, Pop, useBeats, useFx, useFxPicture } from '../kit';
import type { SceneProps } from '../types';

/** Real ms (not scaled by tour speed): a short beat on the solved board, then it flies out and the logo comes in right after. */
const HOLD_SOLVED = 350;
const OUT_MS = 380;
const BRAND_AFTER_OUT = 200;
/** Scene ms: only if the board never reports solved, the logo still arrives. */
const FALLBACK_AT = 6000;

interface Props extends SceneProps {
  /** Label of the closing button; omitted in record mode, where the button is shown but not pressable. */
  playLabel: string;
  onPlay?: () => void;
}

/** Scene 6: everything connects at once, then the logo, title and a breathing Play button. */
export function FinaleScene({ width, height, still, sound, playLabel, onPlay }: Props) {
  const ink = useInk();
  const theme = useTheme();
  const palette = usePalette();
  const level = useMemo(() => tourLevels().finale, []);
  const { fx, emit } = useFx(still);
  const fxPicture = useFxPicture(fx);
  const [brand, setBrand] = useState(still);
  const out = useSharedValue(still ? 1 : 0);
  const boardMax = Math.min(width * 0.9, height * 0.62, 480);
  const size = level ? autoBoardSize(level, boardMax, boardMax, theme.board) : { width: 0, height: 0 };
  const boardStyle = useAnimatedStyle(() => ({
    opacity: 1 - out.value,
    transform: [{ scale: 1 - 0.35 * out.value }, { translateY: -40 * out.value }],
  }));

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const showBrand = () => {
    setBrand(true);
    const cx = width / 2;
    const cy = height * 0.3;
    palette.slice(0, 6).forEach((p, i) =>
      emit({ kind: 'burst', dur: 1300, x: cx, y: cy, color: p.dot, count: 14, radius: Math.min(width, height) * (0.32 + i * 0.05), seed: 20 + i }),
    );
    emit({ kind: 'ring', dur: 900, x: cx, y: cy, color: theme.accent.color, r0: 30, r1: Math.min(width, height) * 0.55, width: 5 });
    if (sound) audio.play('pack_unlock', { volume: 0.7 });
    haptics.success();
  };
  // As soon as the last line connects: a brief hold, the board flies out, and the logo follows straight away.
  const boardDone = () => {
    if (brand || timers.current.length) return;
    timers.current.push(
      setTimeout(() => out.set(withTiming(1, { duration: OUT_MS, easing: Easing.in(Easing.cubic) })), HOLD_SOLVED),
      setTimeout(showBrand, HOLD_SOLVED + BRAND_AFTER_OUT),
    );
  };
  useBeats(still ? [] : [[FALLBACK_AT, boardDone]]);

  return (
    <View style={{ width, height }}>
      {level && !still && (
        <Animated.View
          pointerEvents="none"
          style={[{ position: 'absolute', top: (height - size.height) / 2 - height * 0.04, left: (width - size.width) / 2 }, boardStyle]}
        >
          <Pop from={0.6} rise={30} still={still}>
            <View>
              <AutoBoard level={level} maxW={boardMax} maxH={boardMax} mode="together" startAt={550} cellMs={115} still={still} sound={sound} onSolved={boardDone} />
            </View>
          </Pop>
        </Animated.View>
      )}

      {brand && (
        <View style={{ position: 'absolute', top: height * 0.12, left: 0, right: 0, alignItems: 'center' }}>
          <Pop from={0.2} rise={0} still={still}>
            <Logo reduceMotion={still} scale={Math.min(1.25, width / 320)} />
          </Pop>
          {/* Title, tagline and Play button styled like the Home screen, in the player's theme. */}
          <Pop delay={250} from={0.6} rise={20} still={still} style={{ alignSelf: 'stretch', paddingHorizontal: 16 }}>
            <Text
              accessibilityRole="header"
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{ fontFamily: fonts.titleBold, fontSize: 40, color: ink.text, marginTop: 16, letterSpacing: 0.5, textAlign: 'center' }}
            >
              Connect the Dots
            </Text>
          </Pop>
          <Pop delay={700} from={0.8} still={still}>
            <Text style={{ fontFamily: fonts.body, fontSize: 15, color: ink.soft, marginTop: 4 }}>Link the colors · fill every cell</Text>
          </Pop>
          <Pop delay={1200} from={0.5} still={still} style={{ marginTop: height * 0.07 }}>
            <Breathe still={still}>
              <View pointerEvents={onPlay ? 'auto' : 'none'}>
                <GlassButton label={playLabel} icon="play" variant="primary" size="lg" onPress={onPlay ?? (() => {})} style={{ width: Math.min(420, width - 48) }} />
              </View>
            </Breathe>
          </Pop>
        </View>
      )}

      {/* The wrapper keeps the effects layer from swallowing taps on Play (Skia's Canvas ignores pointerEvents on web). */}
      <View style={{ position: 'absolute', left: 0, top: 0, width, height, pointerEvents: 'none' }}>
        <Canvas style={{ width, height }}>
          <Picture picture={fxPicture} />
        </Canvas>
      </View>
    </View>
  );
}
