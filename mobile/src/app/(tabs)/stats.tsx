import { StyleSheet, View } from 'react-native';

import { ChargeHistory } from '@/components/charge-history';
import { Divider, H1, H2, Mono, Muted, Row, Screen, T } from '@/components/ui';
import { addDays, startOfDay, startOfWeek, WEEKDAY_LABELS } from '@/core/dates';
import { formatDuration } from '@/core/format';
import { streakDays, weekEarnedSec, weekReps, weekSeries, weekUsageSec } from '@/core/timebank';
import { useAppStore, useNow } from '@/store/app-store';
import { colors } from '@/theme';

export default function Stats() {
  const now = useNow(60_000);
  const bank = useAppStore((s) => s.bank);
  const series = weekSeries(bank, now);
  const max = Math.max(30, ...series);
  const todayIdx = Math.round((startOfDay(now) - startOfWeek(now)) / 86_400_000);

  const thisWeek = startOfWeek(now);
  const used = weekUsageSec(bank, thisWeek);
  const usedLast = weekUsageSec(bank, addDays(thisWeek, -7));
  const diff = usedLast - used;

  const rows: [string, string, boolean?][] = [
    ['이번 주 운동', `${weekReps(bank, now)}회`],
    ['충전한 시간', formatDuration(weekEarnedSec(bank, now))],
    ['잠긴 앱 사용', formatDuration(used)],
    [
      '지난주보다',
      usedLast === 0 ? '비교할 기록이 아직 없어요' : diff >= 0 ? `${formatDuration(diff)} 줄었어요` : `${formatDuration(-diff)} 늘었어요`,
      usedLast > 0 && diff >= 0,
    ],
    ['연속 기록', `${streakDays(bank, now)}일`],
  ];

  return (
    <Screen edges={['top']}>
      <H1 style={{ marginTop: 8 }}>이번 주 기록</H1>
      <View style={styles.chart}>
        {series.map((reps, i) => {
          const today = i === todayIdx;
          return (
            <View key={WEEKDAY_LABELS[i]} style={styles.col}>
              <Mono style={styles.value}>{reps || ''}</Mono>
              <View
                style={[
                  styles.bar,
                  { height: Math.max(4, (reps / max) * 120), backgroundColor: today ? colors.red : reps ? colors.ink : colors.dim },
                ]}
              />
              <T style={[styles.day, today && { color: colors.red }]}>{WEEKDAY_LABELS[i]}</T>
            </View>
          );
        })}
      </View>
      <View style={{ marginTop: 20 }}>
        {rows.map(([k, v, good], i) => (
          <View key={k}>
            {i > 0 && <Divider />}
            <Row style={styles.row}>
              <Muted>{k}</Muted>
              {/\d/.test(v) ? (
                <Mono style={[{ fontSize: 15 }, good && { color: colors.red }]}>{v}</Mono>
              ) : (
                <Muted>{v}</Muted>
              )}
            </Row>
          </View>
        ))}
      </View>

      <H2 style={{ marginTop: 28, marginBottom: 4 }}>충전 기록</H2>
      <Muted style={{ fontSize: 12 }}>눌러서 충전 완료 카드를 다시 볼 수 있어요.</Muted>
      <ChargeHistory workouts={bank.workouts} now={now} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: 170, marginTop: 20 },
  col: { flex: 1, alignItems: 'center', gap: 6 },
  value: { fontSize: 10, color: colors.mute },
  bar: { width: '100%', borderTopLeftRadius: 8, borderTopRightRadius: 8 },
  day: { fontSize: 12, fontWeight: '700', color: colors.mute },
  row: { justifyContent: 'space-between', paddingVertical: 14 },
});
