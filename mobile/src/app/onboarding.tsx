import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppTile, Button, Divider, H1, Muted, Row, Screen, T } from '@/components/ui';
import { LOCKABLE_APPS, type AppId } from '@/core/apps';
import { useLockPicker } from '@/features/lock/LockPicker';
import { blocker } from '@/platform/blocker';
import { useAppStore } from '@/store/app-store';
import { colors, radius } from '@/theme';

const GOALS = [
  { h: 1, note: '빡세게' },
  { h: 2, note: '적당히' },
  { h: 3, note: '천천히 줄이기' },
];

export default function Onboarding() {
  const complete = useAppStore((s) => s.completeOnboarding);
  const [step, setStep] = useState(0);
  const [goal, setGoal] = useState(2);
  const [apps, setApps] = useState<AppId[]>(['youtube', 'instagram']);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  /** iOS Screen Time: Apple's picker replaces our app list, and permission comes first. */
  const native = blocker.kind === 'ios-screentime';
  const picker = useLockPicker();
  const steps = native ? 2 : 3;

  const toggle = (id: AppId) => {
    setNote('');
    setApps((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const go = (next: number) => {
    setNote('');
    setStep(next);
  };

  const pickApps = async () => {
    setNote('');
    if (!(await picker.open())) setNote('스크린타임 권한이 없으면 앱을 잠글 수 없어요. 한 번만 허용해 주세요.');
  };

  const finishNative = () => {
    complete({ goalHours: goal, lockedApps: [] });
    router.replace({ pathname: '/workout', params: { first: '1' } });
  };

  const finish = async () => {
    setBusy(true);
    const ok = await blocker.requestAuthorization();
    setBusy(false);
    if (!ok) {
      setNote('권한이 없으면 앱을 잠글 수 없어요. 한 번만 허용해 주세요.');
      return;
    }
    complete({ goalHours: goal, lockedApps: apps });
    router.replace({ pathname: '/workout', params: { first: '1' } });
  };

  const footer =
    step === 0 ? (
      <Button label="다음" onPress={() => go(1)} />
    ) : native ? (
      picker.count > 0 ? (
        <Button label={`${picker.count}개 잠그고 첫 충전하기`} onPress={finishNative} />
      ) : picker.closedOnce ? (
        <View style={{ gap: 6 }}>
          <Button label="다시 고르기" onPress={pickApps} />
          <Button variant="ghost" label="일단 넘어가기 (잠금 탭에서 다시 고를 수 있어요)" onPress={finishNative} />
        </View>
      ) : (
        <Button label="허용하고 잠글 앱 고르기" onPress={pickApps} />
      )
    ) : step === 1 ? (
      <Button label={`${apps.length}개 잠그기`} onPress={() => go(2)} disabled={apps.length === 0} />
    ) : (
      <Button label={busy ? '확인 중...' : '허용하고 첫 충전하기'} onPress={finish} disabled={busy} />
    );

  return (
    <Screen footer={footer}>
      <Row style={{ gap: 6, marginTop: 4 }}>
        {Array.from({ length: steps }, (_, i) => i).map((i) => (
          <View key={i} style={[styles.progress, { backgroundColor: i <= step ? colors.red : colors.line }]} />
        ))}
      </Row>

      {step > 0 && (
        <Pressable accessibilityRole="button" onPress={() => go(step - 1)} style={{ marginTop: 16 }}>
          <T style={{ color: colors.mute, fontWeight: '600' }}>이전</T>
        </Pressable>
      )}

      {step === 0 && (
        <View style={{ marginTop: 32 }}>
          <H1>한 번에 얼마나{'\n'}모아둘까요?</H1>
          <Muted style={{ marginTop: 8 }}>운동으로 충전한 시간은 여기까지만 쌓여요. 다 쓰면 다시 운동해서 채우면 돼요.</Muted>
          <View style={{ marginTop: 28, gap: 10 }}>
            {GOALS.map((g) => {
              const active = goal === g.h;
              return (
                <Pressable
                  key={g.h}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: active }}
                  onPress={() => setGoal(g.h)}
                  style={[styles.option, active ? styles.optionOn : null]}
                >
                  <T style={{ fontSize: 17, fontWeight: '700' }}>{g.h}시간</T>
                  <Muted style={{ fontSize: 13 }}>{g.note}</Muted>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      {step === 1 && native && (
        <View style={{ marginTop: 20 }}>
          <H1>무엇을 잠글까요?</H1>
          <Muted style={{ marginTop: 8 }}>
            아이폰 스크린타임 권한을 허용한 뒤, 손이 먼저 가는 앱을 골라 주세요. 어떤 앱을 골랐는지는 애플만 알고 하고봐도 몰라요.
          </Muted>
          <View style={styles.permCard}>
            <T style={{ fontWeight: '700' }}>허용하면 이렇게 돼요</T>
            <Muted>· 고른 앱을 열면 잠금 화면이 떠요{'\n'}· 운동으로 충전한 시간만큼 열려요{'\n'}· 시간을 다 쓰면 다시 잠겨요</Muted>
          </View>
          {picker.count > 0 && (
            <Pressable accessibilityRole="button" onPress={pickApps} style={{ marginTop: 16 }}>
              <T style={{ fontWeight: '700' }}>
                {picker.count}개 골랐어요 <T style={{ color: colors.mute, fontWeight: '600' }}>· 다시 고르기</T>
              </T>
            </Pressable>
          )}
          {note ? <T style={styles.note}>{note}</T> : null}
          {picker.element}
        </View>
      )}

      {step === 1 && !native && (
        <View style={{ marginTop: 20 }}>
          <H1>무엇을 잠글까요?</H1>
          <Muted style={{ marginTop: 8 }}>손이 먼저 가는 앱을 모두 골라 주세요.</Muted>
          <View style={{ marginTop: 20 }}>
            {LOCKABLE_APPS.map((a, i) => {
              const on = apps.includes(a.id);
              return (
                <View key={a.id}>
                  {i > 0 && <Divider />}
                  <Pressable
                    accessibilityRole="switch"
                    accessibilityState={{ checked: on }}
                    onPress={() => toggle(a.id)}
                    style={styles.appRow}
                  >
                    <AppTile appId={a.id} />
                    <T style={{ flex: 1, fontSize: 16, fontWeight: '600' }}>{a.name}</T>
                    <View style={[styles.switch, { backgroundColor: on ? colors.red : colors.line }]}>
                      <View style={[styles.knob, { left: on ? 22 : 2 }]} />
                    </View>
                  </Pressable>
                </View>
              );
            })}
          </View>
          {note ? <T style={styles.note}>{note}</T> : null}
        </View>
      )}

      {step === 2 && (
        <View style={{ marginTop: 20 }}>
          <H1>마지막으로{'\n'}권한이 필요해요</H1>
          <Muted style={{ marginTop: 8 }}>
            앱을 잠그려면 스크린타임(안드로이드는 사용 기록) 접근이 필요해요. 어떤 앱을 얼마나 썼는지는 기기 밖으로 나가지 않아요.
          </Muted>
          <View style={styles.permCard}>
            <T style={{ fontWeight: '700' }}>허용하면 이렇게 돼요</T>
            <Muted>· 고른 앱을 열면 하고봐 차단 화면이 떠요{'\n'}· 운동으로 충전한 시간만큼 열려요{'\n'}· 시간이 다 되면 다시 잠겨요</Muted>
          </View>
          <Muted style={{ marginTop: 16, fontSize: 13 }}>{blocker.description}</Muted>
          {note ? <T style={styles.note}>{note}</T> : null}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { flex: 1, height: 4, borderRadius: 4 },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: colors.ground,
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  optionOn: { borderColor: colors.red, backgroundColor: colors.white },
  appRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
  switch: { width: 48, height: 28, borderRadius: 14 },
  knob: { position: 'absolute', top: 2, width: 24, height: 24, borderRadius: 12, backgroundColor: colors.white },
  note: { marginTop: 14, color: colors.red, fontWeight: '600', fontSize: 14 },
  permCard: { marginTop: 24, backgroundColor: colors.ground, borderRadius: radius.md, padding: 16, gap: 6 },
});
