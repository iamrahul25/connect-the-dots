import React from 'react';
import { View, type ViewStyle } from 'react-native';

const STRIPES = 6;

/** Wall tile with diagonal stripes, matching the Skia board's walls. Plain views, no WebGL context. */
export function HatchedTile({ size, radius, color, stripe, style }: { size: number; radius: number; color: string; stripe: string; style?: ViewStyle }) {
  const span = size * 1.5;
  return (
    <View style={[{ width: size, height: size, borderRadius: radius, backgroundColor: color, overflow: 'hidden' }, style]}>
      <View
        style={{
          position: 'absolute',
          left: (size - span) / 2,
          top: (size - span) / 2,
          width: span,
          height: span,
          flexDirection: 'row',
          justifyContent: 'space-evenly',
          transform: [{ rotate: '45deg' }],
        }}
      >
        {Array.from({ length: STRIPES }, (_, i) => (
          <View key={i} style={{ width: size * 0.133, height: span, backgroundColor: stripe }} />
        ))}
      </View>
    </View>
  );
}
