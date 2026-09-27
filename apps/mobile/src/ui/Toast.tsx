import React, { useCallback, useRef, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withSequence, withTiming } from 'react-native-reanimated';
import { colors, fonts } from '../theme/tokens';

/** Small floating message; `show(text)` fades it in and out. */
export function useToast() {
  const [text, setText] = useState('');
  const o = useSharedValue(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const show = useCallback(
    (t: string, ms = 1800) => {
      setText(t);
      o.value = withSequence(withTiming(1, { duration: 200 }), withDelay(ms, withTiming(0, { duration: 300 })));
      if (timer.current) clearTimeout(timer.current);
    },
    [o],
  );
  const style = useAnimatedStyle(() => ({ opacity: o.value, transform: [{ translateY: (1 - o.value) * 10 }] }));
  const node = (
    <Animated.View pointerEvents="none" style={[styles.toast, style]}>
      <Text style={styles.text}>{text}</Text>
    </Animated.View>
  );
  return { show, node };
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    alignSelf: 'center',
    top: '46%',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(20,21,75,0.94)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  text: { fontFamily: fonts.bodyBold, fontSize: 15, color: colors.text },
});
