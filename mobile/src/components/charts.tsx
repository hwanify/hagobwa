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
/** Month heatmap ramp: no reps → most reps (one hue, light → dark). */
const HEAT = [colors.ground, '#F6D3D3', '#EE9B9D', colors.red, '#A82A30'];

function heatLevel(reps: number): number {
  if (reps <= 0) return 0;
  if (reps < 20) return 1;
  if (reps < 35) return 2;
  if (reps < 50) return 3;
  return 4;
}

/** Compact legend, sized like the other secondary labels in the app. */
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

/** Two-segment bar (push-ups then squats) with a 2px gap and rounded outer ends. */
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

/** This week, one row per weekday (Mon..Sun): thin split bar + total. No axes, no boxes. */
export function WeekBars({ days, today }: { days: DayTotal[]; today: number }) {
  const max = Math.max(1, ...days.map((d) => d.pushup + d.squat));
  return (
    <View style={{ gap: 4 }}>
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
            <T style={[styles.weekDay, isToday ? { color: colors.red } : future ? { color: colors.line } : null]}>{WEEKDAY_LABELS[i]}</T>
            <View style={styles.weekTrack}>
              {total > 0 ? (
                <SplitBar pushup={d.pushup} squat={d.squat} widthPct={(total / max) * 100} />
              ) : (
                <View style={[styles.weekEmpty, future && { opacity: 0.4 }]} />
              )}
            </View>
            <Mono style={[styles.weekTotal, !total && { color: colors.line }]}>{total || '-'}</Mono>
          </View>
        );
      })}
    </View>
  );
}

/**
 * Month heatmap (Mon-first): one rounded square per day, darker = more reps.
 * No numbers or outlines. Today and the selected day get a small dot underneath.
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
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View style={{ gap: 4 }}>
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
            if (!d) return <View key={di} style={styles.calSlot} />;
            const total = d.pushup + d.squat;
            const future = d.day > today;
            const isSel = selected === d.day;
            const isToday = d.day === today;
            return (
              <Pressable
                key={di}
                accessibilityRole="button"
                accessibilityLabel={`${new Date(d.day).getDate()}일 ${total}회`}
                accessibilityState={{ selected: isSel }}
                disabled={future}
                onPress={() => onSelect(d)}
                style={styles.calSlot}
              >
                <View style={[styles.calSquare, { backgroundColor: HEAT[future ? 0 : heatLevel(total)] }, future && { opacity: 0.45 }]} />
                <View
                  style={[
                    styles.calDot,
                    { backgroundColor: isToday ? colors.red : isSel ? colors.ink : 'transparent' },
                  ]}
                />
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
  weekRow: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 36 },
  weekDay: { width: 20, fontSize: 14, fontWeight: '700', color: colors.mute },
  weekTrack: { flex: 1, justifyContent: 'center' },
  weekEmpty: { height: 10, borderRadius: 5, backgroundColor: colors.ground },
  weekTotal: { width: 32, textAlign: 'right', fontSize: 14 },
  calRow: { flexDirection: 'row' },
  calHead: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', marginBottom: 2 },
  calSlot: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 2 },
  calSquare: { width: 30, height: 30, borderRadius: 9 },
  calDot: { width: 4, height: 4, borderRadius: 2 },
  heatLegend: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 6 },
  heatLegendText: { fontSize: 12, fontWeight: '600' },
  heatSwatch: { width: 10, height: 10, borderRadius: 3 },
});
