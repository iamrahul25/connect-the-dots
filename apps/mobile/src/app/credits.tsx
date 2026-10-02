import React from 'react';
import { Linking, Pressable, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../ui/Screen';
import { useLayout } from '../ui/layout';
import { Logo } from '../ui/Logo';
import { fonts } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/useTheme';
import { useSettings } from '../store/settings';
import licenses from '../../assets/LICENSES.json';

export default function Credits() {
  const theme = useTheme();
  const styles = useStyles();
  const reduceMotion = useSettings((s) => s.reduceMotion);
  const { scale, s } = useLayout();
  return (
    <Screen title="Credits" back scroll contentStyle={styles.list}>
      <View style={styles.hero}>
        <Logo reduceMotion={reduceMotion} scale={scale} />
        <Text style={styles.title}>Connect the Dots</Text>
        <Text style={[styles.sub, styles.centerText]}>Every puzzle has exactly one solution, and every one was verified by our solver.</Text>
      </View>
      {licenses.assets.map((a) => (
        <Pressable key={a.name} onPress={() => Linking.openURL(a.url)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{a.name}</Text>
            <Text style={styles.sub}>{a.author}</Text>
            <Text style={styles.license}>{a.license}</Text>
          </View>
          <Ionicons name="open-outline" size={s(18)} color={theme.text.muted} />
        </Pressable>
      ))}
    </Screen>
  );
}

const useStyles = makeStyles((t, s) => ({
  list: { gap: s(10) },
  hero: { alignItems: 'center', marginBottom: s(20) },
  centerText: { textAlign: 'center' },
  title: { fontFamily: fonts.titleBold, fontSize: s(28), color: t.text.primary, marginTop: s(12) },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: s(16),
    borderRadius: s(18),
    backgroundColor: t.box.background,
    borderWidth: 1,
    borderColor: t.box.border,
  },
  name: { fontFamily: fonts.title, fontSize: s(16), color: t.text.primary },
  sub: { fontFamily: fonts.body, fontSize: s(13), color: t.text.secondary, textAlign: 'left' },
  license: { fontFamily: fonts.bodyBold, fontSize: s(12), color: t.icon.hint, marginTop: s(4) },
}));
