import React from 'react';
import { View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/useTheme';

export function Stars({ count, size = 14, max = 3 }: { count: number; size?: number; max?: number }) {
  const { star } = useTheme();
  return (
    <View style={{ flexDirection: 'row', gap: 2 }}>
      {Array.from({ length: max }, (_, i) => (
        <Ionicons key={i} name={i < count ? 'star' : 'star-outline'} size={size} color={i < count ? star.filled : star.empty} />
      ))}
    </View>
  );
}
