import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Legend, MonthHeatmap, SplitBar, WeekBars } from '@/components/charts';
import { BarbellIcon } from '@/components/tab-icons';
import { Button, Card, Divider, H1, Mono, Muted, Row, Screen, Segmented, T } from '@/components/ui';
import { addDays, startOfDay, startOfWeek, WEEKDAY_LABELS } from '@/core/dates';
import { formatDuration } from '@/core/format';
import { EXERCISE_LABEL, EXERCISES } from '@/core/rates';
import { dailyTotals, dayLogs, exerciseTotals, streakDays, usageBetween, type DayLog, type WorkoutRecord } from '@/core/timebank';
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

/** One workout as a log entry, text only: time, what was done, and the time it earned. */
/** "어제", "그제" or "11/26": for lists that mix days. */
function shortDay(ms: number, today: number): string {
  const day = startOfDay(ms);
  if (day === addDays(today, -1)) return '어제';
  if (day === addDays(today, -2)) return '그제';
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function RecordRow({ w, today, showDay = false }: { w: WorkoutRecord; today: number; showDay?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${dayTitle(startOfDay(w.at), today)} ${timeOf(w.at)} ${EXERCISE_LABEL[w.exercise]} ${w.reps}회, ${formatDuration(w.earnedSec)} 충전`}
      onPress={() => openCharge(w.id)}
      style={({ pressed }) => [styles.record, pressed && { opacity: 0.6 }]}
    >
      <Mono style={styles.recordTime}>{showDay ? shortDay(w.at, today) : timeOf(w.at)}</Mono>
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
        <Muted style={{ fontSize: 12 }}>푸시업</Muted>
        <T style={styles.stat}>{pushup}회</T>
      </Card>
      <Card style={{ flex: 1 }}>
        <Muted style={{ fontSize: 12 }}>스쿼트</Muted>
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
      <View style={{ gap: 8 }}>
        <SplitBar pushup={pushup} squat={squat} height={10} />
        <Legend />
      </View>
    </View>
  );
}

/** Friendly empty state with a way straight into a workout, instead of a blank section. */
function EmptyCard({ title, sub }: { title: string; sub: string }) {
  return (
    <Card style={styles.empty}>
      <View style={styles.emptyIcon}>
        <BarbellIcon color={colors.red} size={26} />
      </View>
      <T style={{ fontSize: 18, fontWeight: '800', marginTop: 14 }}>{title}</T>
      <Muted style={{ marginTop: 4, textAlign: 'center' }}>{sub}</Muted>
      <Button
        style={{ marginTop: 16, alignSelf: 'stretch' }}
        label="운동하고 충전하기"
        icon={<BarbellIcon color={colors.white} size={20} />}
        onPress={() => router.push('/workout')}
      />
    </Card>
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
  const used = usageBetween(bank, from, tomorrow);
  const earned = totals.pushup.earnedSec + totals.squat.earnedSec;
  const todayLogs = dayLogs(bank, today, tomorrow);
  const quietToday = period === 'today' && todayLogs.length === 0;

  let body: ReactNode = null;

  if (period === 'today' && !empty && todayLogs.length === 0) {
    // Nothing yet today: a big grey 0 against yesterday's count, so there's something to beat.
    const recent = dayLogs(bank, 0, today).flatMap((l) => l.workouts).slice(0, 3);
    const [yday] = dailyTotals(bank, addDays(today, -1), 1);
    const ydayReps = yday.pushup + yday.squat;
    body = (
      <>
        <View style={styles.zero}>
          <Muted style={{ fontSize: 13, fontWeight: '600' }}>오늘</Muted>
          <Mono style={styles.zeroNum}>
            0<T style={styles.zeroUnit}>회</T>
          </Mono>
          <View style={styles.zeroTrack} />
          <Muted style={{ marginTop: 10, fontSize: 13 }}>
            {ydayReps > 0 ? (
              <>
                어제 <T style={{ fontSize: 13, fontWeight: '800' }}>{ydayReps}회</T> · 이길 수 있어요
              </>
            ) : streak > 0 ? (
              `${streak}일 연속 중이에요. 오늘 하면 ${streak + 1}일째!`
            ) : (
              '한 세트만 해도 시간이 충전돼요.'
            )}
          </Muted>
        </View>
        <Button
          style={{ marginTop: 22 }}
          label="운동하고 충전하기"
          icon={<BarbellIcon color={colors.white} size={20} />}
          onPress={() => router.push('/workout')}
        />
        {recent.length > 0 && (
          <Section title="최근 기록">
            {recent.map((w, i) => (
              <View key={w.id}>
                {i > 0 && <Divider />}
                <RecordRow w={w} today={today} showDay />
              </View>
            ))}
          </Section>
        )}
      </>
    );
  } else if (period === 'today') {
    const [t] = dailyTotals(bank, today, 1);
    const logs = todayLogs;
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
      </>
    );
  } else if (period === 'month') {
    const month = dailyTotals(bank, monthStart, monthDays);
    const activeDays = month.filter((d) => d.day <= today && d.pushup + d.squat > 0).length;
    const selDay = selectedDay ?? today;
    const sel = month.find((d) => d.day === selDay);
    body = (
      <>
        <Section title={`${nowDate.getFullYear()}년 ${nowDate.getMonth() + 1}월`} right={`${activeDays}일 운동`} first>
          <MonthHeatmap days={month} today={today} selected={selDay} onSelect={(d) => setSelectedDay(d.day)} />
        </Section>
        {sel && (
          <Section title={dayTitle(sel.day, today)}>
            <DayBreakdown pushup={sel.pushup} squat={sel.squat} earnedSec={sel.earnedSec} />
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

      {!empty && !quietToday && (
        <Row style={styles.usage}>
          <Muted style={{ fontSize: 13 }}>{PERIODS.find((p) => p.id === period)?.label} 잠긴 앱 사용</Muted>
          <T style={{ fontSize: 15, fontWeight: '800' }}>
            {formatDuration(used)}
            <Muted style={{ fontSize: 13, fontWeight: '600' }}> / 충전 {formatDuration(earned)}</Muted>
          </T>
        </Row>
      )}

      {empty ? (
        <View style={{ marginTop: 20 }}>
          <EmptyCard title="첫 기록을 만들어 보세요" sub="운동하면 날짜별로 여기에 쌓여요." />
        </View>
      ) : (
        body
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  empty: { alignItems: 'center', paddingVertical: 28, paddingHorizontal: 20 },
  zero: { alignItems: 'center', marginTop: 32 },
  zeroNum: { fontSize: 76, lineHeight: 84, letterSpacing: -3, color: '#C9CAC2' },
  zeroUnit: { fontSize: 22, fontWeight: '700', color: '#C9CAC2' },
  zeroTrack: { width: 220, height: 8, borderRadius: 8, backgroundColor: colors.dim, marginTop: 10 },
  emptyIcon: { width: 56, height: 56, borderRadius: 18, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  usage: { justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 14, borderWidth: 1, borderColor: colors.line },
  stat: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  record: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14 },
  recordTime: { width: 48, fontSize: 14, color: colors.mute },
});
