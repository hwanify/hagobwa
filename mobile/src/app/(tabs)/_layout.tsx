import { Redirect, router } from 'expo-router';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BarbellIcon, TabIcon, type TabIconName } from '@/components/tab-icons';
import { T } from '@/components/ui';
import { useAppStore } from '@/store/app-store';
import { colors, MAX_WIDTH } from '@/theme';

const ITEMS: { name: string; label: string; icon: TabIconName }[] = [
  { name: 'index', label: '홈', icon: 'home' },
  { name: 'crew', label: '크루', icon: 'crew' },
  { name: 'stats', label: '기록', icon: 'records' },
  { name: 'settings', label: '설정', icon: 'settings' },
];

function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  const tab = (item: (typeof ITEMS)[number]) => {
    const active = current === item.name;
    const route = state.routes.find((r) => r.name === item.name);
    return (
      <Pressable
        key={item.name}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={item.label}
        onPress={() => route && navigateToTab(route.key)}
        style={styles.item}
      >
        <TabIcon name={item.icon} active={active} color={active ? colors.red : colors.mute} />
        <T style={[styles.label, { color: active ? colors.red : colors.mute }]}>{item.label}</T>
      </Pressable>
    );
  };
  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.row}>
        {tab(ITEMS[0])}
        {tab(ITEMS[1])}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="운동하고 충전하기"
          onPress={() => router.push('/workout')}
          style={({ pressed }) => [styles.center, pressed && { transform: [{ scale: 0.95 }] }]}
        >
          <BarbellIcon color={colors.white} />
        </Pressable>
        {tab(ITEMS[2])}
        {tab(ITEMS[3])}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  const onboarded = useAppStore((s) => s.onboarded);
  if (!onboarded) return <Redirect href="/onboarding" />;
  return (
    <Tabs screenOptions={{ headerShown: false }} tabBar={(props) => <TabBar {...props} />}>
      <Tabs.Screen name="index" options={{ title: '홈' }} />
      <Tabs.Screen name="crew" options={{ title: '크루' }} />
      <Tabs.Screen name="stats" options={{ title: '기록' }} />
      <Tabs.Screen name="settings" options={{ title: '설정' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.paper, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line, paddingTop: 8 },
  row: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center', paddingHorizontal: 8 },
  item: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 },
  label: { fontSize: 11, fontWeight: '700' },
  center: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.red,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 6,
    marginTop: -18,
    shadowColor: colors.red,
    shadowOpacity: 0.4,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
