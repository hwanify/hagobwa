import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Screen, T } from '@/components/ui';
import { appById } from '@/core/apps';
import { repsNeeded } from '@/core/rates';
import { emergencyLeft, EMERGENCY_WAIT_SEC, todayReps } from '@/core/timebank';
import { closeScreen } from '@/navigation';
import { useAppStore } from '@/store/app-store';
import { colors } from '@/theme';

const UNLOCK_SEC = 10 * 60;

export default function Blocked() {
  const { app } = useLocalSearchParams<{ app?: string }>();
  const target = appById(app ?? '') ?? appById('youtube')!;
  const bank = useAppStore((s) => s.bank);
  const difficulty = useAppStore((s) => s.difficulty);
  const emergencyUnlock = useAppStore((s) => s.emergencyUnlock);
  const openApp = useAppStore((s) => s.openApp);
  const [wait, setWait] = useState<number | null>(null);

  const now = Date.now();
  const left = emergencyLeft(bank, now);
  const reps = repsNeeded(UNLOCK_SEC, 'pushup', difficulty);

  useEffect(() => {
    if (wait === null) return;
    if (wait <= 0) {
      setWait(null);
      if (emergencyUnlock() && openApp(target.id)) {
        router.replace({ pathname: '/session', params: { app: target.id } });
      }
      return;
    }
    const id = setTimeout(() => setWait((w) => (w === null ? null : w - 1)), 1000);
    return () => clearTimeout(id);
  }, [wait, emergencyUnlock, openApp, target.id]);


  return (
    <Screen
      bg={colors.red}
      scroll={false}
      footer={
        <View style={{ gap: 6 }}>
          <Button
            variant="ink"
            label="운동하고 보기"
            icon={<Ionicons name="arrow-forward" size={18} color={colors.white} />}
            onPress={() => router.replace({ pathname: '/workout', params: { target: String(reps), back: target.id } })}
          />
          <Pressable
            accessibilityRole="button"
            disabled={left <= 0 || wait !== null}
            onPress={() => setWait(EMERGENCY_WAIT_SEC)}
            style={{ paddingVertical: 12, opacity: left <= 0 ? 0.55 : 1 }}
          >
            <T style={styles.emergency}>
              {wait !== null
                ? `비상 해제까지 ${wait}초 기다리는 중`
                : left > 0
                  ? `비상 해제 (오늘 ${left}회 남음, 5분)`
                  : '오늘 비상 해제를 다 썼어요'}
            </T>
          </Pressable>
        </View>
      }
    >
      <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={closeScreen} style={styles.close}>
        <Ionicons name="close" size={22} color={colors.white} />
      </Pressable>
      <View style={styles.center}>
        <View style={styles.lock}>
          <Ionicons name="lock-closed" size={40} color={colors.white} />
        </View>
        <T style={styles.sub}>{target.name}은(는) 지금 잠겨 있어요</T>
        <T style={styles.title}>
          푸시업 {reps}개면{'\n'}10분 볼 수 있어요
        </T>
        <T style={styles.meta}>잔고 0분 · 오늘 {todayReps(bank, now)}회 했어요</T>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  close: { alignSelf: 'flex-start', width: 38, height: 38, borderRadius: 19, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 40 },
  lock: { width: 80, height: 80, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  sub: { color: 'rgba(255,255,255,0.85)', marginTop: 24, fontWeight: '600', fontSize: 14 },
  title: { color: colors.white, fontSize: 30, fontWeight: '900', textAlign: 'center', lineHeight: 36, marginTop: 8, letterSpacing: -0.8 },
  meta: { color: 'rgba(255,255,255,0.75)', marginTop: 12, fontSize: 13 },
  emergency: { color: 'rgba(255,255,255,0.9)', textAlign: 'center', fontWeight: '600', fontSize: 14, textDecorationLine: 'underline' },
});
