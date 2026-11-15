import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Legend, MonthHeatmap, SERIES, SplitBar, WeekBars } from '@/components/charts';
import { Divider, H1, Mono, Muted, Row, Screen, Segmented, T } from '@/components/ui';
import { addDays, startOfDay, startOfWeek, WEEKDAY_LABELS } from '@/core/dates';
import { formatDuration } from '@/core/format';
import { EXERCISE_LABEL, EXERCISES } from '@/core/rates';
import { dailyTotals, dayLogs, exerciseTotals, streakDays, type DayLog } from '@/core/timebank';
import { openCharge } from '@/navigation';
import { useAppStore, useNow } from '@/store/app-store';
import { colors } from '@/theme';

type Period = 'week' | 'month' | 'all';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'week', label: '이번 주' },
  { id: 'month', label: '이번 달' },
  { id: 'all', label: '전체' },
];

function dayTitle(day: number, today: number): string {
  if (day === today) return '오늘';
  if (day === addDays(today, -1)) return '어제';
  const d = new Date(day);
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY_LABELS[(d.getDay() + 6) % 7]})`;
}

function timeOf(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** One day's workouts; each row reopens its 충전 완료 card. */
function DayLogBlock({ log, today }: { log: DayLog; today: number }) {
  return (
    <View style={{ marginBottom: 16 }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 2 }}>
        <T style={{ fontWeight: '800', fontSize: 16 }}>{dayTitle(log.day, today)}</T>
        <Muted style={{ fontSize: 14 }}>
          {EXERCISES.filter((e) => log.totals[e.id] > 0)
            .map((e) => `${e.label} ${log.totals[e.id]}회`)
            .join(' · ')}
        </Muted>
      </Row>
      {log.workouts.map((w, i) => (
        <View key={w.id}>
          {i > 0 && <Divider />}
          <Pressable accessibilityRole="button" onPress={() => openCharge(w.id)} style={styles.logRow}>
            <Muted style={{ width: 46, fontSize: 14 }}>{timeOf(w.at)}</Muted>
            <View style={[styles.logDot, { backgroundColor: SERIES[w.exercise] }]} />
            <T style={{ flex: 1, fontWeight: '600', fontSize: 16 }}>
              {EXERCISE_LABEL[w.exercise]} {w.reps}회
            </T>
            <Mono style={{ color: colors.red, fontSize: 14 }}>+{formatDuration(w.earnedSec)}</Mono>
            <Ionicons name="chevron-forward" size={16} color={colors.mute} />
          </Pressable>
        </View>
      ))}
    </View>
  );
}

export default function Stats() {
  const now = useNow(60_000);
  const bank = useAppStore((s) => s.bank);
  const [period, setPeriod] = useState<Period>('week');
  const today = startOfDay(now);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);

  const weekStart = startOfWeek(now);
  const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
  const monthDays = new Date(new Date(now).getFullYear(), new Date(now).getMonth() + 1, 0).getDate();

  const from = period === 'week' ? weekStart : period === 'month' ? monthStart : 0;
  const to = addDays(today, 1);
  const totals = exerciseTotals(bank, from, to);
  const streak = streakDays(bank, now);

  let body: ReactNode = null;

  if (period === 'week') {
    const week = dailyTotals(bank, weekStart, 7);
    body = (
      <>
        <Legend />
        <WeekBars days={week} today={today} />
        <T style={styles.section}>날짜별 기록</T>
        {dayLogs(bank, weekStart, to).map((log) => (
          <DayLogBlock key={log.day} log={log} today={today} />
        ))}
      </>
    );
  } else if (period === 'month') {
    const month = dailyTotals(bank, monthStart, monthDays);
    const active = month.filter((d) => d.day <= today && d.pushup + d.squat > 0);
    const reps = active.reduce((n, d) => n + d.pushup + d.squat, 0);
    const sel = month.find((d) => d.day === (selectedDay ?? today));
    const selLog = sel ? dayLogs(bank, sel.day, addDays(sel.day, 1))[0] : undefined;
    const m = new Date(now);
    body = (
      <>
        <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
          <T style={{ fontSize: 19, fontWeight: '800' }}>
            {m.getFullYear()}년 {m.getMonth() + 1}월
          </T>
          <Muted style={{ fontSize: 15, fontWeight: '700' }}>
            {active.length}일 운동 · {reps}회
          </Muted>
        </Row>
        <MonthHeatmap days={month} today={today} selected={selectedDay ?? today} onSelect={(d) => setSelectedDay(d.day)} />
        {sel && (
          <View style={styles.dayCard}>
            <Row style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
              <T style={{ fontSize: 17, fontWeight: '800' }}>{dayTitle(sel.day, today)}</T>
              <T style={{ fontSize: 15, fontWeight: '700' }}>{sel.earnedSec ? `+${formatDuration(sel.earnedSec)}` : ''}</T>
            </Row>
            {sel.pushup + sel.squat > 0 ? (
              <>
                <SplitBar pushup={sel.pushup} squat={sel.squat} height={14} />
                <Row style={{ gap: 16 }}>
                  <T style={styles.dayCardText}>푸시업 {sel.pushup}회</T>
                  <T style={styles.dayCardText}>스쿼트 {sel.squat}회</T>
                </Row>
              </>
            ) : (
              <Muted>이 날은 운동 기록이 없어요.</Muted>
            )}
          </View>
        )}
        {selLog && <DayLogBlock log={selLog} today={today} />}
      </>
    );
  } else {
    body = (
      <>
        <T style={styles.section}>날짜별 기록</T>
        {dayLogs(bank, 0, to).map((log) => (
          <DayLogBlock key={log.day} log={log} today={today} />
        ))}
      </>
    );
  }

  const empty = bank.workouts.length === 0;

  return (
    <Screen edges={['top']}>
      <H1 style={{ marginTop: 8 }}>운동 기록</H1>
      <View style={{ marginTop: 12, alignSelf: 'flex-start' }}>
        <Segmented options={PERIODS} value={period} onChange={setPeriod} />
      </View>

      <Row style={{ gap: 8, marginTop: 16, marginBottom: 14 }}>
        {EXERCISES.map((e) => (
          <View key={e.id} style={styles.card}>
            <Row style={{ gap: 6 }}>
              <View style={[styles.logDot, { backgroundColor: SERIES[e.id] }]} />
              <T style={{ fontWeight: '700', color: '#3F4248' }}>{e.label}</T>
            </Row>
            <Mono style={styles.big}>
              {totals[e.id].reps}
              <T style={{ fontSize: 16, fontWeight: '700' }}>회</T>
            </Mono>
          </View>
        ))}
      </Row>

      {empty ? <Muted style={{ paddingVertical: 12 }}>아직 운동 기록이 없어요. 운동하면 여기에 쌓여요.</Muted> : <View style={{ gap: 14 }}>{body}</View>}

      {!empty && (
        <Muted style={{ fontSize: 13, marginTop: 8 }}>
          {streak}일 연속 · 기록을 누르면 충전 완료 카드를 다시 볼 수 있어요.
        </Muted>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, padding: 14, gap: 2 },
  big: { fontSize: 32, letterSpacing: -1 },
  section: { fontSize: 17, fontWeight: '800', marginTop: 8 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 11 },
  logDot: { width: 10, height: 10, borderRadius: 3 },
  dayCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 18, padding: 16, gap: 10 },
  dayCardText: { fontSize: 15, fontWeight: '700', color: '#3F4248' },
});
