import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Chip, H1, H2, Muted, Row, Screen, Segmented, T } from '@/components/ui';
import { DIFFICULTIES, rateLabel } from '@/core/rates';
import { VOICE_MODES } from '@/core/voice';
import { say } from '@/platform/feedback';
import { clearPicked } from '@/features/lock/LockPicker';
import { blocker } from '@/platform/blocker';
import { useAppStore } from '@/store/app-store';
import { colors } from '@/theme';

const SAMPLE_LINE = {
  basic: '하나. 둘. 셋. 충전 완료.',
  drill: '하나! 둘! 셋! 허리 펴라! 넷! 다섯! 아직 안 끝났다!',
  pt: '하나. 둘. 좋아요, 자세 좋아요. 셋. 세 개만 더!',
  mom: '하나. 둘. 그거 하고 폰 보는 거야, 알지? 셋.',
} as const;

/** Test builds: how the current usage window is doing (start, end, minutes iOS reported). */
function usageDiag(since: number, until: number, charged: number): string {
  const t = (ms: number) => {
    const d = new Date(ms);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };
  const used = since > 0 ? Math.round(blocker.usedSecondsSince(since) / 60) : 0;
  const end = until > 0 ? t(until) : until === 0 ? '없음' : '모름';
  return `창 ${since > 0 ? t(since) : '-'} → ${end} · iOS 보고 ${used}분 · 차감 ${Math.round(charged / 60)}분 · 이벤트 ${blocker.eventCount()}개`;
}

export default function Settings() {
  const s = useAppStore();
  const [confirmReset, setConfirmReset] = useState(false);
  // Hidden test tools: tap the title 7 times.
  const [taps, setTaps] = useState(0);
  const dev = taps >= 7;

  return (
    <Screen edges={['top']}>
      <Pressable onPress={() => setTaps((n) => n + 1)} accessible={false}>
        <H1 style={{ marginTop: 8 }}>설정</H1>
      </Pressable>

      <H2 style={styles.section}>하루 최대 시간</H2>
      <Muted>잔고는 이 시간까지만 모여요.</Muted>
      <Row style={styles.chips}>
        {[1, 2, 3, 4].map((h) => (
          <Chip key={h} tone="ink" label={`${h}시간`} active={s.goalHours === h} onPress={() => s.updateSettings({ goalHours: h })} />
        ))}
      </Row>

      <H2 style={styles.section}>난이도</H2>
      <Muted>푸시업 {rateLabel('pushup', s.difficulty)}, 스쿼트 {rateLabel('squat', s.difficulty)}</Muted>
      <View style={{ marginTop: 10, alignSelf: 'flex-start' }}>
        <Segmented options={DIFFICULTIES} value={s.difficulty} onChange={(d) => s.updateSettings({ difficulty: d })} />
      </View>

      <H2 style={styles.section}>구령 목소리</H2>
      <Row style={styles.chips}>
        {VOICE_MODES.map((v) => (
          <Chip
            key={v.id}
            label={v.label}
            active={s.voice === v.id}
            onPress={() => {
              s.updateSettings({ voice: v.id });
              say(SAMPLE_LINE[v.id]);
            }}
          />
        ))}
      </Row>
      <Pressable accessibilityRole="switch" accessibilityState={{ checked: s.sound }} onPress={() => s.updateSettings({ sound: !s.sound })} style={styles.toggleRow}>
        <T>운동 중 소리</T>
        <T style={{ fontWeight: '700', color: s.sound ? colors.red : colors.mute }}>{s.sound ? '켜짐' : '꺼짐'}</T>
      </Pressable>

      <View style={{ marginTop: 28, gap: 8 }}>
        {dev && (
          <Button
            variant="ghost"
            label={s.bank.balanceSec > 0 ? '테스트: 잔고 0으로 만들기' : '테스트: 잔고가 0이에요'}
            disabled={s.bank.balanceSec <= 0}
            onPress={s.clearBalance}
          />
        )}
        {dev && blocker.kind === 'ios-screentime' && (
          <Muted style={{ fontSize: 11, textAlign: 'center' }}>
            {blocker.diagnose()}
            {'\n'}
            {usageDiag(s.blockerSince, s.blockerUntil, s.blockerCharged)}
          </Muted>
        )}
        {confirmReset ? (
          <>
            <T style={{ color: colors.red, fontWeight: '700' }}>잔고, 운동 기록, 설정, 잠근 앱이 모두 지워지고 잠금이 풀려요.</T>
            <Row style={{ gap: 8 }}>
              <Button variant="quiet" style={{ flex: 1 }} label="취소" onPress={() => setConfirmReset(false)} />
              <Button
                style={{ flex: 1 }}
                label="모두 지우기"
                onPress={() => {
                  // Forget the picked apps first so the reset also lifts every lock.
                  clearPicked();
                  s.resetAll();
                  router.replace('/onboarding');
                }}
              />
            </Row>
          </>
        ) : (
          <Button variant="ghost" label="데이터 초기화" onPress={() => setConfirmReset(true)} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 28, marginBottom: 4 },
  chips: { gap: 6, marginTop: 10, flexWrap: 'wrap' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, marginTop: 6 },
});
