import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppTile, Button, Card, Chip, Divider, H1, H2, Muted, Row, Screen, Segmented, T } from '@/components/ui';
import { LOCKABLE_APPS, type AppId } from '@/core/apps';
import { formatDuration } from '@/core/format';
import { DIFFICULTIES, secondsPerRep } from '@/core/rates';
import { VOICE_MODES } from '@/core/voice';
import { say } from '@/platform/feedback';
import { LockedAppList } from '@/features/lock/LockedAppList';
import { useLockPicker } from '@/features/lock/LockPicker';
import { blocker } from '@/platform/blocker';
import { useAppStore } from '@/store/app-store';
import { colors } from '@/theme';

const SAMPLE_LINE = {
  basic: '하나. 둘. 셋. 충전 완료.',
  drill: '하나! 둘! 셋! 허리 펴라! 넷! 다섯! 아직 안 끝났다!',
  pt: '하나. 둘. 좋아요, 자세 좋아요. 셋. 세 개만 더!',
  mom: '하나. 둘. 그거 하고 폰 보는 거야, 알지? 셋.',
} as const;

export default function Settings() {
  const s = useAppStore();
  const [note, setNote] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const picker = useLockPicker();

  const toggleApp = (id: AppId) => {
    setNote('');
    if (s.lockedApps.includes(id)) {
      s.updateSettings({ lockedApps: s.lockedApps.filter((x) => x !== id) });
    } else {
      s.updateSettings({ lockedApps: [...s.lockedApps, id] });
    }
  };

  return (
    <Screen edges={['top']}>
      <H1 style={{ marginTop: 8 }}>설정</H1>

      <H2 style={styles.section}>하루 최대 시간</H2>
      <Muted>잔고는 이 시간까지만 모여요.</Muted>
      <Row style={styles.chips}>
        {[1, 2, 3, 4].map((h) => (
          <Chip key={h} tone="ink" label={`${h}시간`} active={s.goalHours === h} onPress={() => s.updateSettings({ goalHours: h })} />
        ))}
      </Row>

      <H2 style={styles.section}>난이도</H2>
      <Muted>푸시업 1회 = {formatDuration(secondsPerRep('pushup', s.difficulty))}, 스쿼트 1회 = {formatDuration(secondsPerRep('squat', s.difficulty))}</Muted>
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

      <H2 style={styles.section}>잠글 앱</H2>
      {blocker.kind === 'ios-screentime' ? (
        <View>
          <Muted style={{ marginBottom: 4 }}>편집을 누르면 지금 잠근 앱이 체크된 채로 열려요. 추가하거나 빼고 완료를 누르세요.</Muted>
          <LockedAppList />
          <Pressable accessibilityRole="button" onPress={() => void picker.open()} style={styles.toggleRow} disabled={picker.saving}>
            <T>{picker.count > 0 ? `${picker.count}개 잠그는 중` : '아직 고르지 않았어요'}</T>
            <T style={{ fontWeight: '700', color: picker.saving ? colors.mute : colors.red }}>
              {picker.saving ? '저장 중…' : picker.count > 0 ? '편집' : '고르기'}
            </T>
          </Pressable>
        </View>
      ) : LOCKABLE_APPS.map((a, i) => {
        const on = s.lockedApps.includes(a.id);
        return (
          <View key={a.id}>
            {i > 0 && <Divider />}
            <Pressable accessibilityRole="switch" accessibilityState={{ checked: on }} onPress={() => toggleApp(a.id)} style={styles.appRow}>
              <AppTile appId={a.id} size={34} />
              <T style={{ flex: 1, fontWeight: '600' }}>{a.name}</T>
              <T style={{ fontWeight: '700', color: on ? colors.red : colors.mute }}>{on ? '잠금' : '-'}</T>
            </Pressable>
          </View>
        );
      })}
      {picker.element}
      {note ? <T style={{ color: colors.red, fontWeight: '600', marginTop: 8 }}>{note}</T> : null}

      <Card style={{ marginTop: 24 }}>
        <T style={{ fontWeight: '700' }}>앱 잠금 상태</T>
        <Muted style={{ fontSize: 13, marginTop: 4 }}>{blocker.description}</Muted>
      </Card>

      <View style={{ marginTop: 28, gap: 8 }}>
        <Button
          variant="ghost"
          label={s.bank.balanceSec > 0 ? '테스트: 잔고 0으로 만들기' : '테스트: 잔고가 0이에요'}
          disabled={s.bank.balanceSec <= 0}
          onPress={s.clearBalance}
        />
        {blocker.kind === 'ios-screentime' && (
          <Muted style={{ fontSize: 11, textAlign: 'center' }}>{blocker.diagnose()}</Muted>
        )}
        {confirmReset ? (
          <>
            <T style={{ color: colors.red, fontWeight: '700' }}>잔고, 운동 기록, 설정이 모두 지워져요.</T>
            <Row style={{ gap: 8 }}>
              <Button variant="quiet" style={{ flex: 1 }} label="취소" onPress={() => setConfirmReset(false)} />
              <Button
                style={{ flex: 1 }}
                label="모두 지우기"
                onPress={() => {
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
  appRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
});
