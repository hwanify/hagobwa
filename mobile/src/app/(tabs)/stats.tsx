import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Legend, MonthHeatmap, SERIES, SplitBar, WeekBars } from '@/components/charts';
import { Card, Divider, H1, Mono, Muted, Row, Screen, Segmented, T } from '@/components/ui';
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
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${WEEKDAY_LABELS[(d.getDay() + 6) % 7]}요일`;
}

function timeOf(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Section header in the same style as 홈's "잠긴 앱" row: bold title left, small label right. */
function SectionHeader({ title, right }: { title: string; right?: ReactNode }) {
  return (
    <Row style={{ justifyContent: 'space-between', marginTop: 24, marginBottom: 8 }}>
      <T style={{ fontSize: 15, fontWeight: '700' }}>{title}</T>
      {typeof right === 'string' ? <Muted style={{ fontSize: 12 }}>{right}</Muted> : right}
    </Row>
  );
}

/** One day's workouts as a hairline list; each row reopens its 충전 완료 card. */
function DayLogBlock({ log, today }: { log: DayLog; today: number }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Muted style={{ fontSize: 12, fontWeight: '600', marginTop: 4 }}>{dayTitle(log.day, today)}</Muted>
      {log.workouts.map((w, i) => (
        <View key={w.id}>
          {i > 0 && <Divider />}
          <Pressable accessibilityRole="button" onPress={() => openCharge(w.id)} style={styles.logRow}>
            <View style={[styles.logDot, { backgroundColor: SERIES[w.exercise] }]} />
            <T style={{ flex: 1, fontSize: 15, fontWeight: '600' }}>
              {EXERCISE_LABEL[w.exercise]} {w.reps}회
            </T>
            <Muted style={{ fontSize: 12 }}>{timeOf(w.at)}</Muted>
            <Mono style={{ width: 64, textAlign: 'right', fontSize: 14, color: colors.red }}>+{formatDuration(w.earnedSec)}</Mono>
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
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const today = startOfDay(now);

  const nowDate = new Date(now);
  const weekStart = startOfWeek(now);
  const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();
  const monthDays = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0).getDate();

  const from = period === 'week' ? weekStart : period === 'month' ? monthStart : 0;
  const to = addDays(today, 1);
  const totals = exerciseTotals(bank, from, to);
  const streak = streakDays(bank, now);
  const empty = bank.workouts.length === 0;

  let body: ReactNode = null;

  if (period === 'week') {
    body = (
      <>
        <SectionHeader title="요일별" right={<Legend />} />
        <WeekBars days={dailyTotals(bank, weekStart, 7)} today={today} />
        <SectionHeader title="운동 내역" right="눌러서 충전 카드 보기" />
        {dayLogs(bank, weekStart, to).map((log) => (
          <DayLogBlock key={log.day} log={log} today={today} />
        ))}
      </>
    );
  } else if (period === 'month') {
    const month = dailyTotals(bank, monthStart, monthDays);
    const activeDays = month.filter((d) => d.day <= today && d.pushup + d.squat > 0).length;
    const selDay = selectedDay ?? today;
    const sel = month.find((d) => d.day === selDay);
    const selLog = sel ? dayLogs(bank, sel.day, addDays(sel.day, 1))[0] : undefined;
    body = (
      <>
        <SectionHeader title={`${nowDate.getMonth() + 1}월`} right={`${activeDays}일 운동`} />
        <MonthHeatmap days={month} today={today} selected={selDay} onSelect={(d) => setSelectedDay(d.day)} />
        {sel && (
          <Card style={{ marginTop: 16, gap: 10 }}>
            <Row style={{ justifyContent: 'space-between' }}>
              <Muted style={{ fontSize: 12, fontWeight: '600' }}>{dayTitle(sel.day, today)}</Muted>
              {sel.earnedSec > 0 && <Mono style={{ fontSize: 14, color: colors.red }}>+{formatDuration(sel.earnedSec)}</Mono>}
            </Row>
            {sel.pushup + sel.squat > 0 ? (
              <>
                <Row style={{ gap: 20 }}>
                  <View>
                    <Muted style={{ fontSize: 12 }}>푸시업</Muted>
                    <T style={styles.stat}>{sel.pushup}회</T>
                  </View>
                  <View>
                    <Muted style={{ fontSize: 12 }}>스쿼트</Muted>
                    <T style={styles.stat}>{sel.squat}회</T>
                  </View>
                </Row>
                <SplitBar pushup={sel.pushup} squat={sel.squat} />
              </>
            ) : (
              <Muted>운동 기록이 없는 날이에요.</Muted>
            )}
          </Card>
        )}
        {selLog && (
          <View style={{ marginTop: 8 }}>
            {selLog.workouts.map((w, i) => (
              <View key={w.id}>
                {i > 0 && <Divider />}
                <Pressable accessibilityRole="button" onPress={() => openCharge(w.id)} style={styles.logRow}>
                  <View style={[styles.logDot, { backgroundColor: SERIES[w.exercise] }]} />
                  <T style={{ flex: 1, fontSize: 15, fontWeight: '600' }}>
                    {EXERCISE_LABEL[w.exercise]} {w.reps}회
                  </T>
                  <Muted style={{ fontSize: 12 }}>{timeOf(w.at)}</Muted>
                  <Mono style={{ width: 64, textAlign: 'right', fontSize: 14, color: colors.red }}>+{formatDuration(w.earnedSec)}</Mono>
                  <Ionicons name="chevron-forward" size={16} color={colors.mute} />
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </>
    );
  } else {
    body = (
      <>
        <SectionHeader title="운동 내역" right="눌러서 충전 카드 보기" />
        {dayLogs(bank, 0, to).map((log) => (
          <DayLogBlock key={log.day} log={log} today={today} />
        ))}
      </>
    );
  }

  return (
    <Screen edges={['top']}>
      <H1 style={{ marginTop: 8 }}>기록</H1>
      <View style={{ marginTop: 12, alignSelf: 'flex-start' }}>
        <Segmented options={PERIODS} value={period} onChange={setPeriod} />
      </View>

      <Row style={{ gap: 8, marginTop: 16 }}>
        {EXERCISES.map((e) => (
          <Card key={e.id} style={{ flex: 1 }}>
            <Muted style={{ fontSize: 12 }}>{e.label}</Muted>
            <T style={styles.stat}>{totals[e.id].reps}회</T>
          </Card>
        ))}
        <Card style={{ flex: 1 }}>
          <Muted style={{ fontSize: 12 }}>연속</Muted>
          <T style={styles.stat}>{streak}일</T>
        </Card>
      </Row>

      {empty ? <Muted style={{ paddingVertical: 24 }}>아직 운동 기록이 없어요. 운동하면 여기에 쌓여요.</Muted> : body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  stat: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  logRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12 },
  logDot: { width: 8, height: 8, borderRadius: 4 },
});
