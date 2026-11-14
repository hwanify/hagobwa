import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { Button, Card, Mono, Muted, Row, Screen, T } from '@/components/ui';
import { appById } from '@/core/apps';
import { formatDuration } from '@/core/format';
import { EXERCISE_LABEL, type ExerciseId } from '@/core/rates';
import { streakDays, todayReps } from '@/core/timebank';
import { successFeedback } from '@/platform/feedback';
import { useAppStore } from '@/store/app-store';
import { colors, radius } from '@/theme';

export default function Done() {
  const p = useLocalSearchParams<{ gain?: string; reps?: string; ex?: string; back?: string; first?: string }>();
  const gain = Number(p.gain) || 0;
  const reps = Number(p.reps) || 0;
  const exercise = (p.ex === 'squat' ? 'squat' : 'pushup') as ExerciseId;
  const backApp = p.back ? appById(p.back) : undefined;

  const bank = useAppStore((s) => s.bank);
  const openApp = useAppStore((s) => s.openApp);
  const [shareNote, setShareNote] = useState('');
  const now = Date.now();
  const today = todayReps(bank, now);
  const streak = streakDays(bank, now);

  useEffect(() => {
    successFeedback();
  }, []);

  const share = async () => {
    const message = `오늘 ${EXERCISE_LABEL[exercise]} 포함 운동 ${today}회 하고 ${formatDuration(gain)} 벌었어요. ${streak}일 연속 중! #하고봐`;
    try {
      await Share.share({ message });
    } catch {
      setShareNote('이 브라우저는 공유를 지원하지 않아요. 앱에서는 카카오톡 공유 창이 열려요.');
    }
  };

  const goBackToApp = () => {
    if (backApp && openApp(backApp.id)) {
      router.replace({ pathname: '/session', params: { app: backApp.id } });
    } else {
      router.replace('/');
    }
  };

  return (
    <Screen
      footer={
        backApp ? (
          <Button label={`${backApp.name} 보러 가기`} onPress={goBackToApp} icon={<Ionicons name="arrow-forward" size={18} color={colors.white} />} />
        ) : (
          <Button label="홈으로" onPress={() => router.replace('/')} />
        )
      }
    >
      <Muted style={{ marginTop: 16, fontWeight: '600' }}>{p.first === '1' ? '첫 충전 완료' : '충전 완료'}</Muted>

      <View style={styles.ticket}>
        <View style={[styles.notch, { left: -12 }]} />
        <View style={[styles.notch, { right: -12 }]} />
        <Row style={{ justifyContent: 'space-between' }}>
          <T style={styles.ticketSmall}>하고봐 시간카드</T>
          <T style={styles.ticketSmall}>
            {EXERCISE_LABEL[exercise]} {reps}회
          </T>
        </Row>
        <Mono style={styles.gain}>+{formatDuration(gain)}</Mono>
        {gain === 0 && <T style={styles.ticketSmall}>하루 최대치까지 모여서 더 쌓이지 않았어요.</T>}
        <Row style={styles.ticketFoot}>
          <T style={{ color: colors.white }}>잔고</T>
          <Mono style={{ color: colors.white }}>{formatDuration(bank.balanceSec)}</Mono>
        </Row>
      </View>

      <Card tone="ink" style={{ marginTop: 20 }}>
        <T style={{ color: 'rgba(247,247,243,0.6)', fontSize: 11, fontWeight: '600' }}>인증 카드 미리보기</T>
        <T style={{ color: colors.paper, fontSize: 17, fontWeight: '800', marginTop: 8, lineHeight: 24 }}>
          오늘 운동 {today}회 하고{'\n'}
          {formatDuration(gain)} 벌었어요
        </T>
        <Row style={{ gap: 4, marginTop: 4 }}>
          <Ionicons name="flame" size={13} color={colors.red} />
          <T style={{ color: 'rgba(247,247,243,0.7)', fontSize: 12 }}>{streak}일 연속 · 하고봐</T>
        </Row>
        <Button
          variant="paper"
          style={{ marginTop: 12, paddingVertical: 11 }}
          label="친구에게 자랑하기"
          icon={<Ionicons name="share-social-outline" size={16} color={colors.ink} />}
          onPress={share}
        />
        {shareNote ? <Muted style={{ color: 'rgba(247,247,243,0.7)', marginTop: 8, fontSize: 12 }}>{shareNote}</Muted> : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  ticket: {
    marginTop: 12,
    backgroundColor: colors.red,
    borderRadius: radius.lg,
    padding: 20,
    overflow: 'hidden',
  },
  notch: { position: 'absolute', top: '50%', width: 24, height: 24, marginTop: -12, borderRadius: 12, backgroundColor: colors.paper },
  ticketSmall: { color: 'rgba(255,255,255,0.85)', fontSize: 12, fontWeight: '600' },
  gain: { color: colors.white, fontSize: 52, letterSpacing: -2, marginTop: 14 },
  ticketFoot: {
    justifyContent: 'space-between',
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderTopColor: 'rgba(255,255,255,0.45)',
  },
});
