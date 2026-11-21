import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Muted, T } from '@/components/ui';
import { EMERGENCY_GRANT_SEC, emergencyLeft } from '@/core/timebank';
import { useAppStore, useNow } from '@/store/app-store';
import { colors } from '@/theme';

/**
 * For when you really can't work out: opens the locked apps for 5 minutes, once a day.
 * Same rules as the lock screen's button (shared daily flag); hidden once used today.
 */
export function EmergencyUnlock() {
  const now = useNow(60_000);
  const bank = useAppStore((s) => s.bank);
  const emergencyUnlock = useAppStore((s) => s.emergencyUnlock);
  const [done, setDone] = useState(false);
  const minutes = Math.round(EMERGENCY_GRANT_SEC / 60);

  if (done) return <Muted style={styles.text}>{minutes}분 동안 열려요.</Muted>;
  if (emergencyLeft(bank, now) <= 0) return null;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => {
        if (emergencyUnlock()) setDone(true);
      }}
      style={styles.btn}
    >
      <T style={styles.link}>비상 {minutes}분 열기</T>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: { paddingVertical: 12, alignItems: 'center' },
  link: { color: colors.mute, fontWeight: '600', fontSize: 14, textDecorationLine: 'underline' },
  text: { textAlign: 'center', paddingVertical: 12, fontSize: 13 },
});
