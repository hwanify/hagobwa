import Ionicons from '@expo/vector-icons/Ionicons';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Legend, MonthHeatmap, SERIES, SplitBar, WeekBars } from '@/components/charts';
import { H1, Mono, Muted, Row, Screen, Segmented, T } from '@/components/ui';
import { addDays, startOfDay, startOfWeek, WEEKDAY_LABELS } from '@/core/dates';
import { formatDuration } from '@/core/format';
import { EXERCISE_LABEL, EXERCISES, type ExerciseId } from '@/core/rates';
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

const BADGE: Record<ExerciseId, { icon: keyof typeof Ionicons.glyphMap; bg: string; fg: string }> = {
  pushup: { icon: 'barbell', bg: '#FBE3E4', fg: colors.red },
  squat: { icon: 'walk', bg: '#FCEEEE', fg: '#E9797C' },
};

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

/** One workout as a log entry: exercise badge, what was done, when, and the time it earned. */
function RecordRow({ w, showDate, today }: { w: WorkoutRecord; showDate?: boolean; today: number }) {
  const when = showDate ? `${dayTitle(startOfDay(w.at), today)} ${timeOf(w.at)}` : timeOf(w.at);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${EXERCISE_LABEL[w.exercise]} ${w.reps}회, ${when}, ${formatDuration(w.earnedSec)} 충전`}
      onPress={() => openCharge(w.id)}
      style={({ pressed }) => [styles.record, pressed && { opacity: 0.6 }]}
    >
      <View style={[styles.badge, { backgroundColor: BADGE[w.exercise].bg }]}>
        <Ionicons name={BADGE[w.exercise].icon} size={18} color={BADGE[w.exercise].fg} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T style={{ fontSize: 16, fontWeight: '700' }}>
          {EXERCISE_LABEL[w.exercise]} {w.reps}회
        </T>
        <Muted style={{ fontSize: 13 }}>{when}</Muted>
      </View>
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
          {log.workouts.map((w) => (
            <RecordRow key={w.id} w={w} today={today} />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Day breakdown: big per-exercise numbers, a split bar, and the time earned. */
function DayBreakdown({ pushup, squat, earnedSec }: { pushup: number; squat: number; earnedSec: number }) {
  if (pushup + squat === 0) return <Muted>운동 기록이 없는 날이에요.</Muted>;
  return (
    <View style={{ gap: 14 }}>
      <Row style={{ gap: 28, alignItems: 'flex-end' }}>
        <View>
          <Row style={{ gap: 6 }}>
            <View style={[styles.dot, { backgroundColor: SERIES.pushup }]} />
            <Muted style={{ fontSize: 13 }}>푸시업</Muted>
          </Row>
          <Mono style={styles.big}>
            {pushup}
            <T style={styles.unit}>회</T>
          </Mono>
        </View>
        <View>
          <Row style={{ gap: 6 }}>
            <View style={[styles.dot, { backgroundColor: SERIES.squat }]} />
            <Muted style={{ fontSize: 13 }}>스쿼트</Muted>
          </Row>
          <Mono style={styles.big}>
            {squat}
            <T style={styles.unit}>회</T>
          </Mono>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Muted style={{ fontSize: 13 }}>충전</Muted>
          <Mono style={[styles.big, { color: colors.red, fontSize: 22 }]}>+{formatDuration(earnedSec)}</Mono>
        </View>
      </Row>
      <SplitBar pushup={pushup} squat={squat} height={12} />
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
          {logs[0] ? logs[0].workouts.map((w) => <RecordRow key={w.id} w={w} today={today} />) : <Muted>아직 오늘 운동 기록이 없어요.</Muted>}
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
            {selLog && <View style={{ marginTop: 12 }}>{selLog.workouts.map((w) => <RecordRow key={w.id} w={w} today={today} />)}</View>}
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
        <Row style={styles.summary}>
          {EXERCISES.map((e) => (
            <View key={e.id} style={styles.summaryItem}>
              <Muted style={{ fontSize: 12 }}>{e.label}</Muted>
              <T style={styles.stat}>{totals[e.id].reps}회</T>
            </View>
          ))}
          <View style={styles.summaryItem}>
            <Muted style={{ fontSize: 12 }}>충전</Muted>
            <T style={styles.stat}>{formatDuration(totals.pushup.earnedSec + totals.squat.earnedSec)}</T>
          </View>
        </Row>
      )}

      {empty ? <Muted style={{ paddingVertical: 24 }}>아직 운동 기록이 없어요. 운동하면 여기에 쌓여요.</Muted> : body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  summary: {
    marginTop: 20,
    paddingVertical: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  summaryItem: { flex: 1, gap: 2 },
  stat: { fontSize: 18, fontWeight: '800' },
  record: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  badge: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  big: { fontSize: 30, letterSpacing: -1, marginTop: 2 },
  unit: { fontSize: 15, fontWeight: '700' },
});
