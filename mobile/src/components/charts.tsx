import { Pressable, StyleSheet, View } from 'react-native';

import { Mono, Muted, T } from '@/components/ui';
import { WEEKDAY_LABELS } from '@/core/dates';
import type { DayTotal } from '@/core/timebank';
import { colors } from '@/theme';

/**
 * Chart colors. Push-ups = brand red, squats = ink.
 * Red vs ink passes the CVD (14.8) and normal-vision (30.7) separation checks; identity is
 * also carried by the legend, 2px gaps between segments and direct total labels.
 */
export const SERIES = { pushup: colors.red, squat: '#3F4248' } as const;
/** Sequential ramp for the month heatmap: 0 reps → most reps (one hue, light → dark). */
const HEAT = ['#E6E7E1', '#F8CFCF', '#F0989A', colors.red, '#A82A30'];

function heatLevel(reps: number): number {
  if (reps <= 0) return 0;
  if (reps < 20) return 1;
  if (reps < 35) return 2;
  if (reps < 50) return 3;
  return 4;
}

export function Legend() {
  return (
    <View style={styles.legend}>
      <View style={styles.legendItem}>
        <View style={[styles.swatch, { backgroundColor: SERIES.pushup }]} />
        <T style={styles.legendText}>푸시업</T>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.swatch, { backgroundColor: SERIES.squat }]} />
        <T style={styles.legendText}>스쿼트</T>
      </View>
    </View>
  );
}

/** Two-segment bar (push-ups then squats) with a 2px gap and rounded outer ends. */
export function SplitBar({ pushup, squat, height = 22, widthPct = 100 }: { pushup: number; squat: number; height?: number; widthPct?: number }) {
  if (pushup + squat === 0) return null;
  return (
    <View style={{ flexDirection: 'row', gap: pushup && squat ? 2 : 0, height, width: `${widthPct}%` }}>
      {pushup > 0 && (
        <View
          style={{
            flex: pushup,
            backgroundColor: SERIES.pushup,
            borderTopLeftRadius: 4,
            borderBottomLeftRadius: 4,
            borderTopRightRadius: squat ? 0 : 4,
            borderBottomRightRadius: squat ? 0 : 4,
          }}
        />
      )}
      {squat > 0 && (
        <View
          style={{
            flex: squat,
            backgroundColor: SERIES.squat,
            borderTopRightRadius: 4,
            borderBottomRightRadius: 4,
            borderTopLeftRadius: pushup ? 0 : 4,
            borderBottomLeftRadius: pushup ? 0 : 4,
          }}
        />
      )}
    </View>
  );
}

/** This week, one row per weekday (Mon..Sun): split bar + total. No axes. */
export function WeekBars({ days, today, onPressDay }: { days: DayTotal[]; today: number; onPressDay?: (d: DayTotal) => void }) {
  const max = Math.max(1, ...days.map((d) => d.pushup + d.squat));
  return (
    <View>
      {days.map((d, i) => {
        const total = d.pushup + d.squat;
        const isToday = d.day === today;
        const future = d.day > today;
        const date = new Date(d.day);
        return (
          <Pressable
            key={d.day}
            accessibilityRole="button"
            accessibilityLabel={`${WEEKDAY_LABELS[i]}요일 푸시업 ${d.pushup}회 스쿼트 ${d.squat}회`}
            disabled={!onPressDay || total === 0}
            onPress={() => onPressDay?.(d)}
            style={[styles.weekRow, isToday && styles.weekRowToday]}
          >
            <View style={{ width: 48 }}>
              <T style={{ fontSize: 17, fontWeight: '800' }}>{WEEKDAY_LABELS[i]}</T>
              <Muted style={{ fontSize: 12, fontWeight: '700' }}>{isToday ? '오늘' : `${date.getMonth() + 1}/${date.getDate()}`}</Muted>
            </View>
            <View style={{ flex: 1 }}>
              {total > 0 ? (
                <SplitBar pushup={d.pushup} squat={d.squat} widthPct={(total / max) * 100} />
              ) : (
                <Muted style={{ fontSize: 15, fontWeight: '700', color: '#8A8D93' }}>{future ? '' : '쉬는 날'}</Muted>
              )}
            </View>
            <Mono style={{ width: 44, textAlign: 'right', fontSize: 17 }}>{total || ''}</Mono>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Month calendar heatmap (Mon-first). Darker = more reps; today outlined; future days dashed. */
export function MonthHeatmap({
  days,
  today,
  selected,
  onSelect,
}: {
  days: DayTotal[];
  today: number;
  selected: number | null;
  onSelect: (d: DayTotal) => void;
}) {
  const first = new Date(days[0]?.day ?? today);
  const lead = (first.getDay() + 6) % 7;
  const cells: (DayTotal | null)[] = [...Array.from({ length: lead }, () => null), ...days];
  while (cells.length % 7) cells.push(null);
  const weeks: (DayTotal | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View style={{ gap: 6 }}>
      <View style={styles.calRow}>
        {WEEKDAY_LABELS.map((w) => (
          <T key={w} style={styles.calHead}>
            {w}
          </T>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.calRow}>
          {week.map((d, di) => {
            if (!d) return <View key={di} style={styles.calCell} />;
            const total = d.pushup + d.squat;
            const future = d.day > today;
            const lv = heatLevel(total);
            const dark = !future && lv >= 3;
            const isSel = selected === d.day;
            return (
              <Pressable
                key={di}
                accessibilityRole="button"
                accessibilityLabel={`${new Date(d.day).getDate()}일 ${total}회`}
                accessibilityState={{ selected: isSel }}
                disabled={future}
                onPress={() => onSelect(d)}
                style={[
                  styles.calCell,
                  future ? styles.calFuture : { backgroundColor: HEAT[lv] },
                  d.day === today && styles.calToday,
                  isSel && d.day !== today && styles.calSelected,
                ]}
              >
                <T style={[styles.calDay, { color: future ? '#8A8D93' : dark ? colors.white : colors.ink }]}>{new Date(d.day).getDate()}</T>
                {!future && total > 0 && <T style={[styles.calReps, { color: dark ? colors.white : colors.ink }]}>{total}</T>}
              </Pressable>
            );
          })}
        </View>
      ))}
      <View style={styles.heatLegend}>
        <Muted style={styles.heatLegendText}>적게</Muted>
        {HEAT.map((c) => (
          <View key={c} style={[styles.heatSwatch, { backgroundColor: c }]} />
        ))}
        <Muted style={styles.heatLegendText}>많이</Muted>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  swatch: { width: 12, height: 12, borderRadius: 4 },
  legendText: { fontSize: 15, fontWeight: '700', color: '#3F4248' },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, paddingHorizontal: 8, marginHorizontal: -8, borderRadius: 12 },
  weekRowToday: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  calRow: { flexDirection: 'row', gap: 6 },
  calHead: { flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '700', color: '#3F4248' },
  calCell: { flex: 1, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  calFuture: { borderWidth: 1, borderStyle: 'dashed', borderColor: colors.line, backgroundColor: colors.white },
  calToday: { borderWidth: 3, borderColor: colors.ink },
  calSelected: { borderWidth: 2, borderColor: '#3F4248' },
  calDay: { fontSize: 14, fontWeight: '700', lineHeight: 16 },
  calReps: { fontSize: 11, fontWeight: '700', lineHeight: 13 },
  heatLegend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 4 },
  heatLegendText: { fontSize: 13, fontWeight: '700' },
  heatSwatch: { width: 18, height: 18, borderRadius: 5 },
});
