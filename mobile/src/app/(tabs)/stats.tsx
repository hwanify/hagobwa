import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Legend, MonthHeatmap, SERIES, SplitBar, WeekBars } from '@/components/charts';
import { Card, Divider, H1, Mono, Muted, Row, Screen, Segmented, T } from '@/components/ui';
import { addDays, startOfDay, startOfWeek, WEEKDAY_LABELS } from '@/core/dates';
import { formatDuration } from '@/core/format';
import { EXERCISE_LABEL, EXERCISES } from '@/core/rates';
import { dailyTotals, dayLogs, exerciseTotals, streakDays, type DayLog, type WorkoutRecord } from '@/core/timebank';
import { openCharge } from '@/navigation';
import { useAppStore, useNow } from '@/store/app-store';
import { colors } from '@/theme';

type Period = 'today' | 'week' | 'month' | 'all';

const PERIODS: { id: Period; label: string }[] = [
  { id: 'today', label: '오늘' },
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

/** Bold section title with an optional small label on the right. */
function Section({ title, right, children, first }: { title: string; right?: ReactNode; children: ReactNode; first?: boolean }) {
  return (
    <View style={{ marginTop: first ? 20 : 32 }}>
      <Row style={{ justifyContent: 'space-between', marginBottom: 12 }}>
        <T style={styles.sectionTitle}>{title}</T>
        {typeof right === 'string' ? <Muted style={{ fontSize: 12 }}>{right}</Muted> : right}
      </Row>
      {children}
    </View>
  );
}

/** One workout as a log entry: time, what was done (series dot), and the time it earned. */
function RecordRow({ w, today }: { w: WorkoutRecord; today: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${dayTitle(startOfDay(w.at), today)} ${timeOf(w.at)} ${EXERCISE_LABEL[w.exercise]} ${w.reps}회, ${formatDuration(w.earnedSec)} 충전`}
      onPress={() => openCharge(w.id)}
      style={({ pressed }) => [styles.record, pressed && { opacity: 0.6 }]}
    >
      <Mono style={styles.recordTime}>{timeOf(w.at)}</Mono>
      <View style={[styles.dot, { backgroundColor: SERIES[w.exercise] }]} />
      <T style={{ flex: 1, fontSize: 16, fontWeight: '600' }}>
        {EXERCISE_LABEL[w.exercise]} {w.reps}회
      </T>
      <Mono style={{ fontSize: 15, color: colors.red }}>+{formatDuration(w.earnedSec)}</Mono>
      <Ionicons name="chevron-forward" size={16} color={colors.mute} />
    </Pressable>
  );
}

function RecordList({ logs, today }: { logs: DayLog[]; today: number }) {
  if (logs.length === 0) return <Muted style={{ paddingVertical: 8 }}>이 기간에는 운동 기록이 없어요.</Muted>;
  return (
    <View style={{ gap: 20 }}>
      {logs.map((log) => (
        <View key={log.day}>
          <Row style={{ justifyContent: 'space-between', marginBottom: 4 }}>
            <Muted style={{ fontSize: 13, fontWeight: '700' }}>{dayTitle(log.day, today)}</Muted>
            <Muted style={{ fontSize: 12 }}>
              {EXERCISES.filter((e) => log.totals[e.id] > 0)
                .map((e) => `${e.label} ${log.totals[e.id]}회`)
                .join(' · ')}
            </Muted>
          </Row>
          {log.workouts.map((w, i) => (
            <View key={w.id}>
              {i > 0 && <Divider />}
              <RecordRow w={w} today={today} />
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** 푸시업 · 스쿼트 · 충전 as grey stat cards (same style as 홈). */
function StatCards({ pushup, squat, earnedSec }: { pushup: number; squat: number; earnedSec: number }) {
  return (
    <Row style={{ gap: 8 }}>
      <Card style={{ flex: 1 }}>
        <Row style={{ gap: 6 }}>
          <View style={[styles.dot, { backgroundColor: SERIES.pushup }]} />
          <Muted style={{ fontSize: 12 }}>푸시업</Muted>
        </Row>
        <T style={styles.stat}>{pushup}회</T>
      </Card>
      <Card style={{ flex: 1 }}>
        <Row style={{ gap: 6 }}>
          <View style={[styles.dot, { backgroundColor: SERIES.squat }]} />
          <Muted style={{ fontSize: 12 }}>스쿼트</Muted>
        </Row>
        <T style={styles.stat}>{squat}회</T>
      </Card>
      <Card style={{ flex: 1 }}>
        <Muted style={{ fontSize: 12 }}>충전</Muted>
        <T style={[styles.stat, { color: colors.red }]} numberOfLines={1}>
          {Math.floor(earnedSec / 60).toLocaleString('ko-KR')}분
        </T>
      </Card>
    </Row>
  );
}

/** A day's split: grey stat cards and the push-up/squat bar. */
function DayBreakdown({ pushup, squat, earnedSec }: { pushup: number; squat: number; earnedSec: number }) {
  if (pushup + squat === 0) return <Muted>운동 기록이 없는 날이에요.</Muted>;
  return (
    <View style={{ gap: 14 }}>
      <StatCards pushup={pushup} squat={squat} earnedSec={earnedSec} />
      <SplitBar pushup={pushup} squat={squat} height={10} />
    </View>
  );
}

export default function Stats() {
  const now = useNow(60_000);
  const bank = useAppStore((s) => s.bank);
  const [period, setPeriod] = useState<Period>('today');
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const today = startOfDay(now);
  const tomorrow = addDays(today, 1);

  const nowDate = new Date(now);
  const weekStart = startOfWeek(now);
  const monthStart = new Date(nowDate.getFullYear(), nowDate.getMonth(), 1).getTime();
  const monthDays = new Date(nowDate.getFullYear(), nowDate.getMonth() + 1, 0).getDate();
  const from = period === 'today' ? today : period === 'week' ? weekStart : period === 'month' ? monthStart : 0;
  const totals = exerciseTotals(bank, from, tomorrow);
  const streak = streakDays(bank, now);
  const empty = bank.workouts.length === 0;

  let body: ReactNode = null;

  if (period === 'today') {
    const [t] = dailyTotals(bank, today, 1);
    const logs = dayLogs(bank, today, tomorrow);
    body = (
      <>
        <Section title="오늘 한 운동" right={`${streak}일 연속`} first>
          <DayBreakdown pushup={t.pushup} squat={t.squat} earnedSec={t.earnedSec} />
        </Section>
        <Section title="운동 기록" right={logs[0] ? `${logs[0].workouts.length}건` : undefined}>
          {logs[0] ? (
            logs[0].workouts.map((w, i) => (
              <View key={w.id}>
                {i > 0 && <Divider />}
                <RecordRow w={w} today={today} />
              </View>
            ))
          ) : (
            <Muted>아직 오늘 운동 기록이 없어요.</Muted>
          )}
        </Section>
      </>
    );
  } else if (period === 'week') {
    body = (
      <>
        <Section title="요일별" right={<Legend />} first>
          <WeekBars days={dailyTotals(bank, weekStart, 7)} today={today} />
        </Section>
        <Section title="운동 기록" right="눌러서 충전 카드 보기">
          <RecordList logs={dayLogs(bank, weekStart, tomorrow)} today={today} />
        </Section>
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
        <Section title={`${nowDate.getFullYear()}년 ${nowDate.getMonth() + 1}월`} right={`${activeDays}일 운동`} first>
          <MonthHeatmap days={month} today={today} selected={selDay} onSelect={(d) => setSelectedDay(d.day)} />
        </Section>
        {sel && (
          <Section title={dayTitle(sel.day, today)}>
            <DayBreakdown pushup={sel.pushup} squat={sel.squat} earnedSec={sel.earnedSec} />
            {selLog && (
              <View style={{ marginTop: 8 }}>
                {selLog.workouts.map((w, i) => (
                  <View key={w.id}>
                    {i > 0 && <Divider />}
                    <RecordRow w={w} today={today} />
                  </View>
                ))}
              </View>
            )}
          </Section>
        )}
      </>
    );
  } else {
    body = (
      <Section title="운동 기록" right="눌러서 충전 카드 보기" first>
        <RecordList logs={dayLogs(bank, 0, tomorrow)} today={today} />
      </Section>
    );
  }

  return (
    <Screen edges={['top']}>
      <H1 style={{ marginTop: 8 }}>기록</H1>
      <View style={{ marginTop: 16 }}>
        <Segmented options={PERIODS} value={period} onChange={setPeriod} stretch plain />
      </View>

      {period !== 'today' && !empty && (
        <View style={{ marginTop: 20 }}>
          <StatCards pushup={totals.pushup.reps} squat={totals.squat.reps} earnedSec={totals.pushup.earnedSec + totals.squat.earnedSec} />
        </View>
      )}

      {empty ? <Muted style={{ paddingVertical: 24 }}>아직 운동 기록이 없어요. 운동하면 여기에 쌓여요.</Muted> : body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  stat: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  record: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  recordTime: { width: 48, fontSize: 14, color: colors.mute },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
