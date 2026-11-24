import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/useTheme';
import { audio } from '../../services/audio';
import { AutoBoard, autoBoardSize } from '../AutoBoard';
import { tourLevels } from '../data';
import { withAlpha } from '../../board/color';
import { Caption, useInk, Pop, useTime } from '../kit';
import type { SceneProps } from '../types';

/** Scene 2: a real level zooms in and solves itself, flow by flow, then celebrates. */
export function GameplayScene({ width, height, still, sound }: SceneProps) {
  const theme = useTheme();
  const level = useMemo(() => tourLevels().gameplay, []);
  const [solved, setSolved] = useState(false);
  const boardMax = Math.min(width * 0.86, height * 0.58, 440);
  const size = level ? autoBoardSize(level, boardMax, boardMax, theme.board) : { width: 0, height: 0 };
  const capSize = Math.min(30, width / 13);
  const top = height * 0.03 + capSize * 1.25 * 2.6 + 16;

  return (
    <View style={{ width, height }}>
      <View style={{ position: 'absolute', top: height * 0.03, left: 16, right: 16, gap: 2 }}>
        <Caption text="Connect matching colors." delay={250} still={still} size={capSize} />
        <Caption text="Fill every cell." delay={2300} still={still} size={capSize * 0.86} />
      </View>
      {level && (
        <Pop delay={80} from={0.55} rise={40} still={still} style={{ position: 'absolute', top, left: (width - size.width) / 2 }}>
          <View>
            <AutoBoard
              level={level}
              maxW={boardMax}
              maxH={boardMax}
              mode="drag"
              startAt={700}
              cellMs={78}
              still={still}
              sound={sound}
              onSolved={() => setSolved(true)}
            />
          </View>
        </Pop>
      )}
      {solved && (
        <View style={{ position: 'absolute', top: top + size.height + 18, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 10 }}>
          {[0, 1, 2].map((i) => (
            <Star key={i} index={i} still={still} sound={sound} />
          ))}
        </View>
      )}
    </View>
  );
}

function Star({ index, still, sound }: { index: number; still: boolean; sound: boolean }) {
  const ink = useInk();
  const delay = 350 + index * 180;
  const wait = useTime()(delay);
  React.useEffect(() => {
    if (!sound || still) return;
    const t = setTimeout(() => audio.play(`star_${index + 1}` as 'star_1'), wait);
    return () => clearTimeout(t);
  }, [wait, index, sound, still]);
  return (
    <Pop delay={delay} from={0.2} rise={0} still={still} style={index === 1 ? { marginTop: -10 } : undefined}>
      <Ionicons name="star" size={index === 1 ? 44 : 36} color={ink.gold} style={{ textShadowColor: withAlpha(ink.gold, 0.6), textShadowRadius: 12 }} />
    </Pop>
  );
}
