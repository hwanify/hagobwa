import { Pressable, StyleSheet, View } from 'react-native';

import { Mono, Muted, T } from '@/components/ui';
import { WEEKDAY_LABELS } from '@/core/dates';
import type { DayTotal } from '@/core/timebank';
import { colors } from '@/theme';

/**
 * Chart colors. Push-ups = brand red, squats = a lighter red from the same family.
 * Passes the CVD (15.5) and normal-vision (17.8) separation checks. The light red is under 3:1
 * against the background, so identity is also carried by the legend, 2px gaps between
 * segments and the visible totals.
 */
export const SERIES = { pushup: colors.red, squat: '#F0989A' } as const;

/**
 * Month heatmap ramp on the page background: no reps → most reps.
 * One hue, light → dark, with clear steps so the grid reads crisp rather than washed out.
 */
const EMPTY = '#E9EAE4';
const HEAT = [EMPTY, '#F2B4B6', '#E9797C', colors.red, '#A82A30'];

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
        <Muted style={styles.legendText}>푸시업</Muted>
      </View>
      <View style={styles.legendItem}>
        <View style={[styles.swatch, { backgroundColor: SERIES.squat }]} />
        <Muted style={styles.legendText}>스쿼트</Muted>
      </View>
    </View>
  );
}

/** Two-segment bar (push-ups then squats) with a 2px gap and fully rounded outer ends. */
export function SplitBar({ pushup, squat, height = 10, widthPct = 100 }: { pushup: number; squat: number; height?: number; widthPct?: number }) {
  if (pushup + squat === 0) return null;
  const r = height / 2;
  return (
    <View style={{ flexDirection: 'row', gap: pushup && squat ? 2 : 0, height, width: `${widthPct}%` }}>
      {pushup > 0 && (
        <View
          style={{
            flex: pushup,
            backgroundColor: SERIES.pushup,
            borderTopLeftRadius: r,
            borderBottomLeftRadius: r,
            borderTopRightRadius: squat ? 0 : r,
            borderBottomRightRadius: squat ? 0 : r,
          }}
        />
      )}
      {squat > 0 && (
        <View
          style={{
            flex: squat,
            backgroundColor: SERIES.squat,
            borderTopRightRadius: r,
            borderBottomRightRadius: r,
            borderTopLeftRadius: pushup ? 0 : r,
            borderBottomLeftRadius: pushup ? 0 : r,
          }}
        />
      )}
    </View>
  );
}

/** This week, one row per weekday (Mon..Sun): split bar + total. */
export function WeekBars({ days, today }: { days: DayTotal[]; today: number }) {
  const max = Math.max(1, ...days.map((d) => d.pushup + d.squat));
  return (
    <View style={{ gap: 2 }}>
      {days.map((d, i) => {
        const total = d.pushup + d.squat;
        const isToday = d.day === today;
        const future = d.day > today;
        return (
          <View
            key={d.day}
            accessible
            accessibilityLabel={`${WEEKDAY_LABELS[i]}요일 푸시업 ${d.pushup}회 스쿼트 ${d.squat}회`}
            style={styles.weekRow}
          >
            <T style={[styles.weekDay, isToday && { color: colors.red }, future && { opacity: 0.35 }]}>{WEEKDAY_LABELS[i]}</T>
            <View style={styles.weekTrack}>
              {total > 0 ? (
                <SplitBar pushup={d.pushup} squat={d.squat} widthPct={(total / max) * 100} />
              ) : (
                <View style={[styles.weekEmpty, future && { opacity: 0.5 }]} />
              )}
            </View>
            <Mono style={[styles.weekTotal, !total && { color: colors.mute, opacity: 0.5 }]}>{total || '-'}</Mono>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Month heatmap (Mon-first): one rounded square per elapsed day,
 * darker = more reps. Future days are left blank. A small dot marks today (red) or the
 * selected day (ink).
 */
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
  for (let i = 0; i < cells.length; i += 7) {
    const week = cells.slice(i, i + 7);
    // Only weeks that have started; future weeks would just leave an empty gap.
    if (week.some((d) => d && d.day <= today)) weeks.push(week);
  }

  return (
    <View style={{ gap: 2 }}>
      <View style={styles.calRow}>
        {WEEKDAY_LABELS.map((w) => (
          <Muted key={w} style={styles.calHead}>
            {w}
          </Muted>
        ))}
      </View>
      {weeks.map((week, wi) => (
        <View key={wi} style={styles.calRow}>
          {week.map((d, di) => {
            if (!d || d.day > today) return <View key={di} style={styles.calSlot} />;
            const total = d.pushup + d.squat;
            const isSel = selected === d.day;
            const isToday = d.day === today;
            return (
              <Pressable
                key={di}
                accessibilityRole="button"
                accessibilityLabel={`${new Date(d.day).getDate()}일 ${total}회`}
                accessibilityState={{ selected: isSel }}
                onPress={() => onSelect(d)}
                hitSlop={2}
                style={styles.calSlot}
              >
                <View style={[styles.calSquare, { backgroundColor: HEAT[heatLevel(total)] }]} />
                <View style={[styles.calDot, { backgroundColor: isToday ? colors.red : isSel ? colors.ink : 'transparent' }]} />
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
  legend: { flexDirection: 'row', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  swatch: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 12, fontWeight: '600' },
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 34 },
  weekDay: { width: 18, fontSize: 14, fontWeight: '700', color: colors.ink },
  weekTrack: { flex: 1, justifyContent: 'center' },
  weekEmpty: { height: 10, borderRadius: 5, backgroundColor: EMPTY },
  weekTotal: { width: 30, textAlign: 'right', fontSize: 14 },
  calRow: { flexDirection: 'row' },
  calHead: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  calSlot: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 3 },
  calSquare: { width: 32, height: 32, borderRadius: 10 },
  calDot: { width: 4, height: 4, borderRadius: 2 },
  heatLegend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 8 },
  heatLegendText: { fontSize: 12, fontWeight: '600' },
  heatSwatch: { width: 10, height: 10, borderRadius: 3 },
});
