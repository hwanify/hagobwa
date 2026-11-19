import { useEffect, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Muted, T } from '@/components/ui';
import { EMERGENCY_GRANT_SEC, EMERGENCY_PER_DAY, EMERGENCY_WAIT_SEC, emergencyLeft } from '@/core/timebank';
import { useAppStore, useNow } from '@/store/app-store';
import { colors } from '@/theme';

/**
 * For when you really can't work out: opens the locked apps for 5 minutes, once a day,
 * after a 30-second wait (long enough to reconsider, short enough for a real emergency).
 */
export function EmergencyUnlock() {
  const now = useNow(60_000);
  const bank = useAppStore((s) => s.bank);
  const emergencyUnlock = useAppStore((s) => s.emergencyUnlock);
  const [wait, setWait] = useState<number | null>(null);
  const [done, setDone] = useState(false);
  const left = emergencyLeft(bank, now);

  useEffect(() => {
    if (wait === null) return;
    if (wait <= 0) {
      setWait(null);
      if (emergencyUnlock()) setDone(true);
      return;
    }
    const id = setTimeout(() => setWait((w) => (w === null ? null : w - 1)), 1000);
    return () => clearTimeout(id);
  }, [wait, emergencyUnlock]);

  const minutes = Math.round(EMERGENCY_GRANT_SEC / 60);

  if (done) {
    return <Muted style={styles.text}>비상 해제했어요. {minutes}분 동안 열려요.</Muted>;
  }
  if (left <= 0) {
    return <Muted style={styles.text}>오늘 비상 해제를 다 썼어요. 내일 다시 쓸 수 있어요.</Muted>;
  }
  if (wait !== null) {
    return (
      <Pressable accessibilityRole="button" onPress={() => setWait(null)} style={styles.btn}>
        <T style={styles.link}>{wait}초 뒤 열려요 · 취소</T>
      </Pressable>
    );
  }
  return (
    <Pressable accessibilityRole="button" onPress={() => setWait(EMERGENCY_WAIT_SEC)} style={styles.btn}>
      <T style={styles.link}>
        운동이 어려우면 비상 해제 ({minutes}분, 하루 {EMERGENCY_PER_DAY}번)
      </T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { paddingVertical: 12, alignItems: 'center' },
  link: { color: colors.mute, fontWeight: '600', fontSize: 14, textDecorationLine: 'underline' },
  text: { textAlign: 'center', paddingVertical: 12, fontSize: 13 },
});
