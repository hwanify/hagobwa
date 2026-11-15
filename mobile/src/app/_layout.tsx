import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useApplyOtaUpdate } from '@/platform/updates';
import { useHydrated } from '@/store/app-store';
import { colors } from '@/theme';

const WEB_FONTS = [
  'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css',
  'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;700&display=swap',
];

export default function RootLayout() {
  const hydrated = useHydrated();
  useApplyOtaUpdate();

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    for (const href of WEB_FONTS) {
      if (document.querySelector(`link[href="${href}"]`)) continue;
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
    }
    document.documentElement.lang = 'ko';
    document.title = '하고봐';
  }, []);

  if (!hydrated) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper }}>
        <ActivityIndicator color={colors.red} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.paper } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
        <Stack.Screen name="workout" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="done" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        <Stack.Screen name="blocked" options={{ presentation: 'fullScreenModal' }} />
        <Stack.Screen name="session" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
      </Stack>
    </SafeAreaProvider>
  );
}
