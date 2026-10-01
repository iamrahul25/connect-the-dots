import React from 'react';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Screen } from '../ui/Screen';
import { Logo } from '../ui/Logo';
import { fonts } from '../theme/tokens';
import { makeStyles, useTheme } from '../theme/useTheme';
import { useSettings } from '../store/settings';
import licenses from '../../assets/LICENSES.json';

export default function Credits() {
  const theme = useTheme();
  const styles = useStyles();
  const reduceMotion = useSettings((s) => s.reduceMotion);
  return (
    <Screen title="Credits" back>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <Logo reduceMotion={reduceMotion} />
          <Text style={styles.title}>Connect the Dots</Text>
          <Text style={styles.sub}>Every puzzle has exactly one solution, and every one was verified by our solver.</Text>
        </View>
        {licenses.assets.map((a) => (
          <Pressable key={a.name} onPress={() => Linking.openURL(a.url)} style={({ pressed }) => [styles.card, pressed && { opacity: 0.7 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{a.name}</Text>
              <Text style={styles.sub}>{a.author}</Text>
              <Text style={styles.license}>{a.license}</Text>
            </View>
            <Ionicons name="open-outline" size={18} color={theme.text.muted} />
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

const useStyles = makeStyles((t) => ({
  scroll: { width: '100%', maxWidth: 520, alignSelf: 'center', paddingBottom: 24, gap: 10 },
  title: { fontFamily: fonts.titleBold, fontSize: 28, color: t.text.primary, marginTop: 12 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 18,
    backgroundColor: t.box.background,
    borderWidth: 1,
    borderColor: t.box.border,
  },
  name: { fontFamily: fonts.title, fontSize: 16, color: t.text.primary },
  sub: { fontFamily: fonts.body, fontSize: 13, color: t.text.secondary, textAlign: 'left' },
  license: { fontFamily: fonts.bodyBold, fontSize: 12, color: t.icon.hint, marginTop: 4 },
}));
