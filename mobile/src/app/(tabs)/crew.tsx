import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { H1, Mono, Muted, Row, Screen, T } from '@/components/ui';
import { weekReps } from '@/core/timebank';
import { useAppStore, useNow } from '@/store/app-store';
import { colors } from '@/theme';

/** Sample members until the crew backend exists. */
const SAMPLE = [
  { name: '3대500가자', reps: 312 },
  { name: '쇼츠끊는중', reps: 241 },
  { name: '퇴근후푸시업', reps: 188 },
  { name: '헬린이탈출', reps: 97 },
];

export default function Crew() {
  const now = useNow(60_000);
  const bank = useAppStore((s) => s.bank);
  const mine = weekReps(bank, now);
  const rows = [...SAMPLE, { name: '나', reps: mine, me: true }].sort((a, b) => b.reps - a.reps);

  return (
    <Screen edges={['top']}>
      <Muted style={{ fontWeight: '600', marginTop: 8 }}>야근크루 · 5명</Muted>
      <H1 style={{ marginTop: 2 }}>이번 주 랭킹</H1>
      <View style={{ marginTop: 16, gap: 6 }}>
        {rows.map((r, i) => {
          const me = 'me' in r && r.me;
          return (
            <Row key={r.name} style={[styles.row, { backgroundColor: me ? colors.red : colors.ground }]}>
              <Mono style={[styles.rank, me && { color: colors.white }]}>{i + 1}</Mono>
              <T style={[styles.name, me && { color: colors.white }]}>{r.name}</T>
              <Mono style={me ? { color: colors.white } : undefined}>{r.reps}회</Mono>
            </Row>
          );
        })}
      </View>
      <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: '/workout', params: { target: '20' } })} style={styles.cta}>
        <T style={{ fontWeight: '700' }}>순위 올리러 가기</T>
        <Ionicons name="chevron-forward" size={18} color={colors.ink} />
      </Pressable>
      <Muted style={{ fontSize: 12, marginTop: 16 }}>
        지금은 예시 크루예요. 내 기록은 실제 운동량이고, 친구 연결은 서버가 붙으면 열려요.
      </Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { gap: 12, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 13 },
  rank: { width: 20, fontSize: 15 },
  name: { flex: 1, fontWeight: '700' },
  cta: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.line,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 13,
  },
});
