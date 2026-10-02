import React from 'react';
import { ScrollView, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { BUTTON_H, GlassButton } from './GlassButton';
import { useLayout, type ContentWidth } from './layout';
import { fonts } from '../theme/tokens';
import { makeStyles } from '../theme/useTheme';

const HEADER_H = 52;

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
  contentStyle?: StyleProp<ViewStyle>;
}

/** Safe-area screen: header buttons pinned to the corners, body in a centered, responsive column. */
export function Screen({ title, subtitle, back, right, children, scroll, center, width = 'narrow', contentStyle }: Props) {
  const insets = useSafeAreaInsets();
  const styles = useStyles();
  const layout = useLayout();
  const onBack = typeof back === 'function' ? back : () => (router.canGoBack() ? router.back() : router.replace('/'));

  const columnWidth = Math.min(layout.contentWidth(width), layout.width - insets.left - insets.right - layout.gutter * 2);
  const column = <View style={[styles.column, { width: columnWidth }, contentStyle]}>{children}</View>;
  // Side gutters live inside the body (not on the root) so a ScrollView body doesn't clip
  // children that bleed into the gutter, like the edge-to-edge pack carousel.
  const bodyPadding = { paddingHorizontal: layout.gutter, paddingBottom: insets.bottom + layout.landscapeClearance };

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + layout.gutter - layout.s(HEADER_H - BUTTON_H.sm) / 2,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        },
      ]}
    >
      {(title || back || right) && (
        <View style={[styles.header, { marginHorizontal: layout.gutter }]}>
          <View style={styles.side}>{back && <GlassButton icon="chevron-back" size="sm" onPress={onBack} accessibilityLabel="Back" />}</View>
          <View style={styles.titleWrap}>
            {title && (
              <Text style={styles.title} numberOfLines={1}>
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
          contentContainerStyle={[styles.scrollContent, center && styles.centered, bodyPadding]}
          showsVerticalScrollIndicator={false}
        >
          {column}
        </ScrollView>
      ) : (
        <View style={[styles.body, center && styles.centered, bodyPadding]}>{column}</View>
      )}
    </View>
  );
}

const useStyles = makeStyles((t, s) => ({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', height: s(HEADER_H), marginBottom: s(8) },
  side: { width: s(96), flexDirection: 'row', alignItems: 'center', gap: s(8) },
  sideRight: { justifyContent: 'flex-end' },
  titleWrap: { flex: 1, alignItems: 'center' },
  title: { fontFamily: fonts.title, fontSize: s(22), color: t.text.primary, letterSpacing: 0.5 },
  subtitle: { fontFamily: fonts.body, fontSize: s(13), color: t.text.secondary },
  body: { flex: 1 },
  scrollContent: { flexGrow: 1, alignItems: 'center' },
  centered: { justifyContent: 'center' },
  column: { alignSelf: 'center' },
}));
