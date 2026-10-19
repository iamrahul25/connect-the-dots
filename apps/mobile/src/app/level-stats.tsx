import React from 'react';
import { Text } from 'react-native';
import { Redirect } from 'expo-router';
import { Screen } from '../ui/Screen';
import { LevelDetails, LevelDetailsLegend } from '../ui/LevelDetails';
import { fonts } from '../theme/tokens';
import { makeStyles } from '../theme/useTheme';

/** Developer screen: per-pack tables of every level's size, colors and obstacles. */
export default function LevelStats() {
  const styles = useStyles();
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <Screen title="Level Stats" back scroll width="wide">
      <Text style={[styles.section, { marginTop: 0 }]}>How to read</Text>
      <LevelDetailsLegend />
      <Text style={styles.section}>Packs</Text>
      <LevelDetails />
    </Screen>
  );
}

const useStyles = makeStyles((t, s) => ({
  section: { fontFamily: fonts.bodyBold, fontSize: s(12), letterSpacing: 2, color: t.text.muted, marginTop: s(22), marginBottom: s(8), textTransform: 'uppercase' },
}));
