import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { BarbellIcon } from '@/components/tab-icons';
import { AppTile, Button, Card, Divider, H1, H2, Muted, Row, Screen, T } from '@/components/ui';
import { LOCKABLE_APPS, type AppId } from '@/core/apps';
import { formatDuration } from '@/core/format';
import { EmergencyUnlock } from '@/features/lock/EmergencyUnlock';
import { LockedAppList } from '@/features/lock/LockedAppList';
import { useLockPicker } from '@/features/lock/LockPicker';
import { blocker } from '@/platform/blocker';
import { useAppStore } from '@/store/app-store';
import { colors } from '@/theme';

/** Everything about locking in one place: state, the apps, editing, emergency unlock. */
export default function Lock() {
  const balance = useAppStore((s) => s.bank.balanceSec);
  const native = blocker.kind === 'ios-screentime';
  const picker = useLockPicker();
  const lockedApps = useAppStore((s) => s.lockedApps);
  const update = useAppStore((s) => s.updateSettings);
  const count = native ? picker.count : lockedApps.length;
  const open = balance >= 60;

  const toggle = (id: AppId) =>
    update({ lockedApps: lockedApps.includes(id) ? lockedApps.filter((x) => x !== id) : [...lockedApps, id] });

  return (
    <Screen edges={['top']}>
      <H1 style={{ marginTop: 8 }}>잠금</H1>

      <Card style={[styles.status, !open && count > 0 && { backgroundColor: colors.ink }]}>
        <Row style={{ gap: 12 }}>
          <View style={[styles.badge, { backgroundColor: open || count === 0 ? colors.white : colors.red }]}>
            <Ionicons
              name={open || count === 0 ? 'lock-open-outline' : 'lock-closed'}
              size={22}
              color={open || count === 0 ? colors.ink : colors.white}
            />
          </View>
          <View style={{ flex: 1 }}>
            <T style={[styles.statusTitle, !open && count > 0 && { color: colors.white }]}>
              {count === 0 ? '잠근 앱이 없어요' : open ? '지금 열려 있어요' : '지금 잠겨 있어요'}
            </T>
            <Muted style={!open && count > 0 ? { color: 'rgba(247,247,243,0.7)' } : undefined}>
              {count === 0
                ? '아래에서 잠글 앱을 골라 주세요'
                : open
                  ? `남은 시간 ${formatDuration(balance)} · 다 쓰면 다시 잠겨요`
                  : '운동하고 충전하면 바로 열려요'}
            </Muted>
          </View>
        </Row>
      </Card>

      {!open && count > 0 && (
        <>
          <Button
            style={{ marginTop: 12 }}
            label="운동하고 충전하기"
            icon={<BarbellIcon color={colors.white} size={20} />}
            onPress={() => router.push('/workout')}
          />
          <EmergencyUnlock />
        </>
      )}

      <Row style={styles.sectionHead}>
        <H2>잠근 앱 {count > 0 ? count : ''}</H2>
        {native && (
          <Pressable accessibilityRole="button" onPress={() => void picker.open()} hitSlop={10} disabled={picker.saving}>
            <T style={{ fontWeight: '700', color: picker.saving ? colors.mute : colors.red }}>
              {picker.saving ? '저장 중…' : count > 0 ? '편집' : '고르기'}
            </T>
          </Pressable>
        )}
      </Row>

      {native ? (
        count === 0 ? (
          <Pressable accessibilityRole="button" onPress={() => void picker.open()} style={styles.empty}>
            <Ionicons name="add-circle-outline" size={22} color={colors.red} />
            <T style={{ fontWeight: '700' }}>잠글 앱 고르기</T>
          </Pressable>
        ) : (
          <LockedAppList />
        )
      ) : (
        LOCKABLE_APPS.map((a, i) => {
          const on = lockedApps.includes(a.id);
          return (
            <View key={a.id}>
              {i > 0 && <Divider />}
              <Pressable accessibilityRole="switch" accessibilityState={{ checked: on }} onPress={() => toggle(a.id)} style={styles.appRow}>
                <AppTile appId={a.id} size={34} />
                <T style={{ flex: 1, fontWeight: '600' }}>{a.name}</T>
                <T style={{ fontWeight: '700', color: on ? colors.red : colors.mute }}>{on ? '잠금' : '-'}</T>
              </Pressable>
            </View>
          );
        })
      )}
      {picker.element}

    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { marginTop: 16, padding: 18 },
  badge: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  statusTitle: { fontSize: 18, fontWeight: '800' },
  sectionHead: { justifyContent: 'space-between', alignItems: 'center', marginTop: 28, marginBottom: 4 },
  empty: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 16 },
  appRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
});
