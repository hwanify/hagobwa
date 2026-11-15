import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { Divider, Mono, Muted, T } from '@/components/ui';
import { formatDuration } from '@/core/format';
import { EXERCISE_LABEL } from '@/core/rates';
import type { WorkoutRecord } from '@/core/timebank';
import { colors } from '@/theme';

function when(ms: number, now: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const today = new Date(now);
  const sameDay = d.toDateString() === today.toDateString();
  const yesterday = new Date(now - 86_400_000).toDateString() === d.toDateString();
  if (sameDay) return `오늘 ${time}`;
  if (yesterday) return `어제 ${time}`;
  return `${d.getMonth() + 1}/${d.getDate()} ${time}`;
}

export function openCharge(id: string): void {
  router.push({ pathname: '/done', params: { id } });
}

/** Most recent charges first; tap one to reopen its 충전 완료 card. */
export function ChargeHistory({ workouts, now, limit = 20 }: { workouts: WorkoutRecord[]; now: number; limit?: number }) {
  const items = [...workouts].sort((a, b) => b.at - a.at).slice(0, limit);
  if (items.length === 0) {
    return <Muted style={{ paddingVertical: 12 }}>아직 충전 기록이 없어요. 운동하면 여기에 쌓여요.</Muted>;
  }
  return (
    <View>
      {items.map((w, i) => (
        <View key={w.id}>
          {i > 0 && <Divider />}
          <Pressable accessibilityRole="button" onPress={() => openCharge(w.id)} style={styles.row}>
            <View style={{ flex: 1 }}>
              <T style={{ fontWeight: '700' }}>
                {EXERCISE_LABEL[w.exercise]} {w.reps}회
              </T>
              <Muted style={{ fontSize: 12 }}>{when(w.at, now)}</Muted>
            </View>
            <Mono style={{ color: colors.red, fontSize: 15 }}>+{formatDuration(w.earnedSec)}</Mono>
            <Ionicons name="chevron-forward" size={16} color={colors.mute} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
});
