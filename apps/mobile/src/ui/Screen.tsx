import React from 'react';
import { Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { GlassButton } from './GlassButton';
import { fonts } from '../theme/tokens';
import { makeStyles } from '../theme/useTheme';

interface Props {
  title?: string;
  subtitle?: string;
  back?: boolean | (() => void);
  right?: React.ReactNode;
  children: React.ReactNode;
  style?: ViewStyle;
}

/** Safe-area screen with an optional header. */
export function Screen({ title, subtitle, back, right, children, style }: Props) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const onBack = typeof back === 'function' ? back : () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <View style={[styles.root, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }, style]}>
      {(title || back || right) && (
        <View style={styles.header}>
          <View style={styles.side}>{back && <GlassButton icon="chevron-back" size="sm" onPress={onBack} accessibilityLabel="Back" />}</View>
          <View style={styles.titleWrap}>
            {title && <Text style={styles.title} numberOfLines={1}>{title}</Text>}
            {subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
          </View>
          <View style={[styles.side, { alignItems: 'flex-end' }]}>{right}</View>
        </View>
      )}
      {children}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1, paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', height: 52, marginBottom: 8 },
  side: { width: 96, flexDirection: 'row', gap: 8 },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: { fontFamily: fonts.title, fontSize: 22, color: t.text.primary, letterSpacing: 0.5 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: t.text.secondary },
}));
