import React from 'react';
import { ScrollView, Text, View, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { GlassButton } from './GlassButton';
import { useLayout, type ContentWidth } from './layout';
import { fonts } from '../theme/tokens';
import { makeStyles } from '../theme/useTheme';

interface Props {
  title?: string;
  subtitle?: string;
  back?: boolean | (() => void);
  right?: React.ReactNode;
  children: React.ReactNode;
  /** Wrap the body in a vertical ScrollView. */
  scroll?: boolean;
  /** Vertically center the body when it is shorter than the screen. */
  center?: boolean;
  /** Max width of the centered content column. */
  width?: ContentWidth;
  contentStyle?: ViewStyle;
}

/** Safe-area screen: header buttons pinned to the corners, body in a centered, responsive column. */
export function Screen({ title, subtitle, back, right, children, scroll, center, width = 'narrow', contentStyle }: Props) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const layout = useLayout();
  const onBack = typeof back === 'function' ? back : () => (router.canGoBack() ? router.back() : router.replace('/'));

  const columnWidth = Math.min(layout.contentWidth(width), layout.width - insets.left - insets.right - layout.gutter * 2);
  const column = <View style={[styles.column, { width: columnWidth }, contentStyle]}>{children}</View>;

  return (
    <View
      style={[
        styles.root,
        { paddingTop: insets.top + 8, paddingLeft: insets.left + layout.gutter, paddingRight: insets.right + layout.gutter },
      ]}
    >
      {(title || back || right) && (
        <View style={styles.header}>
          <View style={styles.side}>{back && <GlassButton icon="chevron-back" size="sm" onPress={onBack} accessibilityLabel="Back" />}</View>
          <View style={styles.titleWrap}>
            {title && (
              <Text style={[styles.title, layout.tablet && styles.titleTablet]} numberOfLines={1}>
                {title}
              </Text>
            )}
            {subtitle && <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>}
          </View>
          <View style={[styles.side, styles.sideRight]}>{right}</View>
        </View>
      )}
      {scroll ? (
        <ScrollView
          style={styles.body}
          contentContainerStyle={[
            styles.scrollContent,
            center && styles.centered,
            { paddingBottom: insets.bottom + layout.landscapeClearance },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {column}
        </ScrollView>
      ) : (
        <View style={[styles.body, center && styles.centered, { paddingBottom: insets.bottom + layout.landscapeClearance }]}>{column}</View>
      )}
    </View>
  );
}

const useStyles = makeStyles((t) => ({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', height: 52, marginBottom: 8 },
  side: { width: 96, flexDirection: 'row', alignItems: 'center', gap: 8 },
  sideRight: { justifyContent: 'flex-end' },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: { fontFamily: fonts.title, fontSize: 22, color: t.text.primary, letterSpacing: 0.5 },
  titleTablet: { fontSize: 26 },
  subtitle: { fontFamily: fonts.body, fontSize: 13, color: t.text.secondary },
  body: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center' },
  centered: { justifyContent: 'center' },
  column: { alignSelf: 'center' },
}));
