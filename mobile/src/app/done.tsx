import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { Button, Card, Mono, Muted, Row, Screen, T } from '@/components/ui';
import { appById } from '@/core/apps';
import { formatDuration } from '@/core/format';
import { EXERCISE_LABEL } from '@/core/rates';
import { streakDays, todayReps } from '@/core/timebank';
import { closeScreen, goHome } from '@/navigation';
import { successFeedback } from '@/platform/feedback';
import { useAppStore } from '@/store/app-store';
import { colors, radius } from '@/theme';

function formatWhen(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Charge receipt.
 *  - Right after a workout: /done?id=<record>&fresh=1[&back=<app>][&added=<sec>]
 *  - From the history list: /done?id=<record>
 */
export default function Done() {
  const p = useLocalSearchParams<{ id?: string; fresh?: string; back?: string; added?: string; first?: string }>();
  const fresh = p.fresh === '1';
  const bank = useAppStore((s) => s.bank);
  const openApp = useAppStore((s) => s.openApp);
  const record = bank.workouts.find((w) => w.id === p.id);
  const backApp = fresh && p.back ? appById(p.back) : undefined;
  const [shareNote, setShareNote] = useState('');

  useEffect(() => {
    if (fresh) successFeedback();
  }, [fresh]);

  if (!record) {
    return (
      <Screen footer={<Button label="닫기" onPress={closeScreen} />}>
        <Muted style={{ marginTop: 40, textAlign: 'center' }}>이 충전 기록을 찾을 수 없어요.</Muted>
      </Screen>
    );
  }

  const added = p.added !== undefined ? Number(p.added) : record.earnedSec;
  const capped = fresh && added < record.earnedSec;
  const now = Date.now();
  const streak = streakDays(bank, now);
  const dayReps = todayReps(bank, record.at);

  const share = async () => {
    const message = `${EXERCISE_LABEL[record.exercise]} ${record.reps}회 하고 ${formatDuration(record.earnedSec)} 벌었어요. ${streak}일 연속 중! #하고봐`;
    try {
      await Share.share({ message });
    } catch {
      setShareNote('이 기기에서는 공유를 열 수 없어요.');
    }
  };

  const goBackToApp = () => {
    if (backApp && openApp(backApp.id)) router.replace({ pathname: '/session', params: { app: backApp.id } });
    else goHome();
  };

  const footer = fresh ? (
    backApp ? (
      <Button label={`${backApp.name} 보러 가기`} onPress={goBackToApp} icon={<Ionicons name="arrow-forward" size={18} color={colors.white} />} />
    ) : (
      <Button label="홈으로" onPress={goHome} />
    )
  ) : (
    <Button variant="quiet" label="닫기" onPress={closeScreen} />
  );

  return (
    <Screen footer={footer}>
      <Row style={{ justifyContent: 'space-between', marginTop: 16 }}>
        <Muted style={{ fontWeight: '600' }}>{fresh ? (p.first === '1' ? '첫 충전 완료' : '충전 완료') : '충전 기록'}</Muted>
        {!fresh && (
          <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={closeScreen} hitSlop={10}>
            <Ionicons name="close" size={22} color={colors.mute} />
          </Pressable>
        )}
      </Row>

      <View style={styles.ticket}>
        <View style={[styles.notch, { left: -12 }]} />
        <View style={[styles.notch, { right: -12 }]} />
        <Row style={{ justifyContent: 'space-between' }}>
          <T style={styles.ticketSmall}>하고봐 시간카드</T>
          <T style={styles.ticketSmall}>{formatWhen(record.at)}</T>
        </Row>
        <Mono style={styles.gain}>+{formatDuration(record.earnedSec)}</Mono>
        <T style={styles.ticketSmall}>
          {EXERCISE_LABEL[record.exercise]} {record.reps}회
        </T>
        {capped && <T style={[styles.ticketSmall, { marginTop: 6 }]}>최대 충전량이 꽉 차서 {formatDuration(added)}만 쌓였어요.</T>}
        <Row style={styles.ticketFoot}>
          <T style={{ color: colors.white }}>{fresh ? '지금 잔고' : '현재 잔고'}</T>
          <Mono style={{ color: colors.white }}>{formatDuration(bank.balanceSec)}</Mono>
        </Row>
      </View>

      <Card tone="ink" style={{ marginTop: 20 }}>
        <T style={{ color: 'rgba(247,247,243,0.6)', fontSize: 11, fontWeight: '600' }}>인증 카드 미리보기</T>
        <T style={{ color: colors.paper, fontSize: 17, fontWeight: '800', marginTop: 8, lineHeight: 24 }}>
          그날 운동 {dayReps}회 하고{'\n'}
          {formatDuration(record.earnedSec)} 벌었어요
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
  ticket: { marginTop: 12, backgroundColor: colors.red, borderRadius: radius.lg, padding: 20, overflow: 'hidden' },
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
