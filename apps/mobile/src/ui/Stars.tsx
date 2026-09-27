import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors } from '../theme/tokens';

export function Stars({ count, size = 14, max = 3 }: { count: number; size?: number; max?: number }) {
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: max }, (_, i) => (
        <Ionicons key={i} name={i < count ? 'star' : 'star-outline'} size={size} color={i < count ? colors.star : 'rgba(255,255,255,0.3)'} />
      ))}
    </View>
  );
}
