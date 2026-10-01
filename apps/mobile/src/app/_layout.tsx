import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts, Fredoka_600SemiBold, Fredoka_700Bold } from '@expo-google-fonts/fredoka';
import { Nunito_600SemiBold, Nunito_800ExtraBold } from '@expo-google-fonts/nunito';
import { Background } from '../ui/Background';
import { audio } from '../services/audio';
import { useTheme } from '../theme/useTheme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const navTheme = {
  ...DefaultTheme,
  colors: { ...DefaultTheme.colors, background: 'transparent', card: 'transparent' },
};

export default function RootLayout() {
  const [loaded, error] = useFonts({ Fredoka_600SemiBold, Fredoka_700Bold, Nunito_600SemiBold, Nunito_800ExtraBold });
  const theme = useTheme();
  const rootBg = { backgroundColor: theme.background.color };

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync().catch(() => {});
  }, [loaded, error]);

  if (!loaded && !error) return <View style={[styles.root, rootBg]} />;

  return (
    <GestureHandlerRootView style={[styles.root, rootBg]}>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme}>
          {/* Any first touch unlocks audio (browsers block playback before a gesture). */}
          <View
            style={styles.root}
            onStartShouldSetResponderCapture={() => {
              audio.unlock();
              return false;
            }}
          >
            <Background />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: 'transparent' },
                animation: 'fade',
              }}
            />
          </View>
          <StatusBar style={theme.statusBar === 'light' ? 'light' : 'dark'} />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
