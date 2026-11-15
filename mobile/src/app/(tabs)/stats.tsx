import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { openCharge } from '@/navigation';
import { Divider, H1, Mono, Muted, Row, Screen, Segmented, T } from '@/components/ui';
import { addDays, startOfDay, startOfWeek, WEEKDAY_LABELS } from '@/core/dates';
import { formatDuration } from '@/core/format';
import { EXERCISE_LABEL, EXERCISES, type ExerciseId } from '@/core/rates';
import { dayLogs, exerciseTotals, streakDays } from '@/core/timebank';
import { useAppStore, useNow } from '@/store/app-store';
import { colors } from '@/theme';

type Period = 'today' | 'week' | 'month' | 'all';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: '오늘' },
  { id: 'week', label: '이번 주' },
  { id: 'month', label: '이번 달' },
  { id: 'all', label: '전체' },
];

function rangeOf(period: Period, now: number): [number, number] {
  const end = addDays(startOfDay(now), 1);
  if (period === 'today') return [startOfDay(now), end];
  if (period === 'week') return [startOfWeek(now), end];
  if (period === 'month') {
    const d = new Date(now);
    return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), end];
  }
  return [0, end];
}

function dayTitle(day: number, now: number): string {
  const today = startOfDay(now);
  if (day === today) return '오늘';
  if (day === addDays(today, -1)) return '어제';
  const d = new Date(day);
  const dow = WEEKDAY_LABELS[(d.getDay() + 6) % 7];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${dow})`;
}

function timeOf(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

const ICON: Record<ExerciseId, keyof typeof Ionicons.glyphMap> = {
  pushup: 'body-outline',
  squat: 'walk-outline',
};

export default function Stats() {
  const now = useNow(60_000);
  const bank = useAppStore((s) => s.bank);
  const [period, setPeriod] = useState<Period>('week');
  const [from, to] = rangeOf(period, now);
  const totals = exerciseTotals(bank, from, to);
  const logs = dayLogs(bank, from, to);
  const totalReps = EXERCISES.reduce((n, e) => n + totals[e.id].reps, 0);
  const totalEarned = EXERCISES.reduce((n, e) => n + totals[e.id].earnedSec, 0);
  const streak = streakDays(bank, now);

  return (
    <Screen edges={['top']}>
      <H1 style={{ marginTop: 8 }}>운동 기록</H1>
      <View style={{ marginTop: 12, alignSelf: 'flex-start' }}>
        <Segmented options={PERIODS} value={period} onChange={setPeriod} />
      </View>

      <Row style={{ gap: 8, marginTop: 16 }}>
        {EXERCISES.map((e) => {
          const t = totals[e.id];
          return (
            <View key={e.id} style={styles.card}>
              <Row style={{ gap: 6 }}>
                <Ionicons name={ICON[e.id]} size={16} color={colors.red} />
                <T style={{ fontWeight: '700' }}>{e.label}</T>
              </Row>
              <Mono style={styles.big}>
                {t.reps}
                <T style={{ fontSize: 16, fontWeight: '700' }}>회</T>
              </Mono>
              <Muted style={{ fontSize: 12 }}>
                {t.sessions}번 운동 · +{formatDuration(t.earnedSec)}
              </Muted>
            </View>
          );
        })}
      </Row>

      <Row style={styles.summary}>
        <Muted>합계</Muted>
        <T style={{ fontWeight: '700' }}>
          {totalReps}회 · +{formatDuration(totalEarned)}
        </T>
      </Row>
      <Row style={styles.summary}>
        <Muted>연속 기록</Muted>
        <T style={{ fontWeight: '700' }}>{streak}일</T>
      </Row>

      <T style={styles.section}>날짜별</T>
      {logs.length === 0 ? (
        <Muted style={{ paddingVertical: 12 }}>이 기간에는 운동 기록이 없어요.</Muted>
      ) : (
        logs.map((log) => (
          <View key={log.day} style={{ marginBottom: 18 }}>
            <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
              <T style={{ fontWeight: '800' }}>{dayTitle(log.day, now)}</T>
              <Muted style={{ fontSize: 13 }}>
                {EXERCISES.filter((e) => log.totals[e.id] > 0)
                  .map((e) => `${e.label} ${log.totals[e.id]}회`)
                  .join(' · ')}
              </Muted>
            </Row>
            {log.workouts.map((w, i) => (
              <View key={w.id}>
                {i > 0 && <Divider />}
                <Pressable accessibilityRole="button" onPress={() => openCharge(w.id)} style={styles.row}>
                  <Muted style={{ width: 44, fontSize: 13 }}>{timeOf(w.at)}</Muted>
                  <T style={{ flex: 1, fontWeight: '600' }}>
                    {EXERCISE_LABEL[w.exercise]} {w.reps}회
                  </T>
                  <Mono style={{ color: colors.red, fontSize: 14 }}>+{formatDuration(w.earnedSec)}</Mono>
                  <Ionicons name="chevron-forward" size={16} color={colors.mute} />
                </Pressable>
              </View>
            ))}
          </View>
        ))
      )}
      {logs.length > 0 && <Muted style={{ fontSize: 12 }}>기록을 누르면 충전 완료 카드를 다시 볼 수 있어요.</Muted>}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: colors.ground, borderRadius: 16, padding: 14, gap: 4 },
  big: { fontSize: 34, letterSpacing: -1, marginTop: 4 },
  summary: { justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.line },
  section: { fontSize: 17, fontWeight: '800', marginTop: 24, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11 },
});
