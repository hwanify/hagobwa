import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as Updates from 'expo-updates';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Chip, H1, H2, Muted, Row, Screen, Segmented, T } from '@/components/ui';
import { DIFFICULTIES, rateLabel } from '@/core/rates';
import { sayCount } from '@/platform/feedback';
import { clearPicked } from '@/features/lock/LockPicker';
import { blocker } from '@/platform/blocker';
import { useAppStore } from '@/store/app-store';
import { colors } from '@/theme';

const PRIVACY_URL = 'https://github.com/hwanify/pushupapp/blob/main/docs/PRIVACY.md';
const SUPPORT_URL = 'https://github.com/hwanify/pushupapp/issues';

function versionText(): string {
  const v = Constants.expoConfig?.version ?? '';
  const ota = Updates.updateId ? ` (${Updates.updateId.slice(0, 6)})` : '';
  return `하고봐 ${v}${ota}`;
}

function open(url: string) {
  WebBrowser.openBrowserAsync(url).catch(() => {});
}

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

      <H2 style={styles.section}>최대 충전량</H2>
      <Muted>잔고는 이 시간까지만 쌓여요. 다 쓰면 다시 운동해서 채우면 돼요.</Muted>
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

      <H2 style={styles.section}>구령</H2>
      <Pressable
        accessibilityRole="button"
        onPress={() => [1, 2, 3].forEach((n, i) => setTimeout(() => sayCount(n), i * 700))}
        style={styles.toggleRow}
      >
        <T>구령 들어보기</T>
        <T style={{ fontWeight: '700', color: colors.red }}>하나, 둘, 셋</T>
      </Pressable>
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

      <Row style={styles.links}>
        <Pressable accessibilityRole="link" onPress={() => open(PRIVACY_URL)} hitSlop={8}>
          <Muted style={styles.link}>개인정보처리방침</Muted>
        </Pressable>
        <Muted style={{ fontSize: 12 }}>·</Muted>
        <Pressable accessibilityRole="link" onPress={() => open(SUPPORT_URL)} hitSlop={8}>
          <Muted style={styles.link}>문의하기</Muted>
        </Pressable>
      </Row>
      <Muted style={styles.version}>{versionText()}</Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 28, marginBottom: 4 },
  chips: { gap: 6, marginTop: 10, flexWrap: 'wrap' },
  toggleRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 14, marginTop: 6 },
  links: { justifyContent: 'center', gap: 8, marginTop: 32 },
  link: { fontSize: 12, textDecorationLine: 'underline' },
  version: { fontSize: 11, textAlign: 'center', marginTop: 8, marginBottom: 8 },
});
