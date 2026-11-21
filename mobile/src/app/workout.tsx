import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Mono, Muted, Row, Screen, Segmented, T } from '@/components/ui';
import { earnedSeconds, EXERCISES, type ExerciseId } from '@/core/rates';
import { repLine } from '@/core/voice';
import PoseCamera from '@/features/pose/PoseCamera';
import { closeScreen, goHome } from '@/navigation';
import { say, tapFeedback } from '@/platform/feedback';
import { useAppStore } from '@/store/app-store';
import { colors } from '@/theme';

export default function Workout() {
  const params = useLocalSearchParams<{ back?: string; first?: string }>();
  const first = params.first === '1';
  const back = params.back ?? '';

  const difficulty = useAppStore((s) => s.difficulty);
  const voice = useAppStore((s) => s.voice);
  const sound = useAppStore((s) => s.sound);
  const update = useAppStore((s) => s.updateSettings);
  const logWorkout = useAppStore((s) => s.logWorkout);

  const [exercise, setExercise] = useState<ExerciseId>('pushup');
  const [count, setCount] = useState(0);
  const [pulse, setPulse] = useState(0);

  const countRef = useRef(0);
  const live = useRef({ voice, sound });
  live.current = { voice, sound };
  const finishedRef = useRef(false);

  const addRep = useCallback(() => {
    if (finishedRef.current) return;
    const n = countRef.current + 1;
    countRef.current = n;
    setCount(n);
    setPulse((p) => p + 1);
    tapFeedback();
    if (live.current.sound) say(repLine(live.current.voice, n, 0));
  }, []);

  const finish = useCallback(() => {
    const reps = countRef.current;
    if (reps <= 0 || finishedRef.current || earnedSeconds(exercise, reps, difficulty) === 0) return;
    const saved = logWorkout(exercise, reps);
    if (!saved) return;
    finishedRef.current = true;
    router.replace({
      pathname: '/done',
      params: { id: saved.id, fresh: '1', added: String(saved.earnedSec), back, first: first ? '1' : '' },
    });
  }, [back, difficulty, exercise, first, logWorkout]);

  const reset = () => {
    countRef.current = 0;
    setCount(0);
  };

  const close = () => {
    if (first) goHome();
    else closeScreen();
  };

  // Earnings are whole minutes, so a few reps may not be worth a minute yet.
  const gain = earnedSeconds(exercise, count, difficulty);

  return (
    <Screen
      footer={
        <Row style={{ gap: 8 }}>
          <Button
            variant="quiet"
            style={{ flex: 1 }}
            label="탭으로 1회"
            icon={<Ionicons name="hand-left-outline" size={18} color={colors.ink} />}
            onPress={addRep}
          />
          <Button
            style={{ flex: 1.2 }}
            label={count > 0 && gain === 0 ? '조금만 더' : '충전하기'}
            onPress={finish}
            disabled={gain === 0}
          />
        </Row>
      }
    >
      <Row style={{ justifyContent: 'space-between' }}>
        <Pressable accessibilityRole="button" accessibilityLabel="닫기" onPress={close} style={styles.iconBtn}>
          <Ionicons name="close" size={22} color={colors.ink} />
        </Pressable>
        <Segmented
          options={EXERCISES}
          value={exercise}
          onChange={(e) => {
            setExercise(e);
            reset();
          }}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={sound ? '소리 끄기' : '소리 켜기'}
          onPress={() => update({ sound: !sound })}
          style={styles.iconBtn}
        >
          <Ionicons name={sound ? 'volume-high' : 'volume-mute'} size={20} color={sound ? colors.ink : colors.mute} />
        </Pressable>
      </Row>

      {first && (
        <T style={styles.firstNote}>첫 충전이에요. 하고 싶은 만큼 하고 충전하기를 누르세요.</T>
      )}

      <View style={{ marginTop: 14 }}>
        <PoseCamera exercise={exercise} onRep={addRep} />
      </View>

      {/* Just the count: what it's worth shows after charging. */}
      <View style={{ alignItems: 'center', marginTop: 16 }}>
        <Mono key={pulse} style={{ fontSize: 72, lineHeight: 78, letterSpacing: -2 }}>
          {count}
          <T style={{ fontSize: 24, fontWeight: '700', color: colors.mute }}>회</T>
        </Mono>
      </View>
      <Muted style={styles.tip}>
        폰을 바닥에 세우고 몸 옆모습이 다 보이게 두면 가장 잘 세져요. 무리하지 말고, 아프면 바로 멈추세요.
      </Muted>
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center' },
  firstNote: { marginTop: 14, fontWeight: '700', color: colors.red },
  tip: { fontSize: 12, lineHeight: 18, marginTop: 10, textAlign: 'center' },
});
