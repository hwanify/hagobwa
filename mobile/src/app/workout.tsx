import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Button, Mono, Muted, Row, Screen, Segmented, T } from '@/components/ui';
import { formatDuration } from '@/core/format';
import { earnedSeconds, EXERCISES, type ExerciseId } from '@/core/rates';
import PoseCamera from '@/features/pose/PoseCamera';
import { closeScreen, goHome } from '@/navigation';
import { releaseCounts, sayCount, tapFeedback } from '@/platform/feedback';
import { useAppStore } from '@/store/app-store';
import { colors } from '@/theme';

export default function Workout() {
  const params = useLocalSearchParams<{ back?: string; first?: string }>();
  const first = params.first === '1';
  const back = params.back ?? '';

  const difficulty = useAppStore((s) => s.difficulty);
  const sound = useAppStore((s) => s.sound);
  const update = useAppStore((s) => s.updateSettings);
  const logWorkout = useAppStore((s) => s.logWorkout);

  const [exercise, setExercise] = useState<ExerciseId>('pushup');
  const [count, setCount] = useState(0);
  const [pulse, setPulse] = useState(0);

  const countRef = useRef(0);
  const live = useRef({ sound });
  live.current = { sound };
  useEffect(() => releaseCounts, []);
  const finishedRef = useRef(false);

  const addRep = useCallback(() => {
    if (finishedRef.current) return;
    const n = countRef.current + 1;
    countRef.current = n;
    setCount(n);
    setPulse((p) => p + 1);
    tapFeedback();
    if (live.current.sound) sayCount(n);
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

  const gainPreview = earnedSeconds(exercise, count, difficulty);

  return (
    <Screen
      scroll={false}
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
            label={count > 0 && gainPreview === 0 ? '조금만 더' : '충전하기'}
            onPress={finish}
            disabled={gainPreview === 0}
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

      {/* The camera takes whatever height is left, so everything fits on one screen. */}
      <View style={{ flex: 1, marginTop: 12 }}>
        <PoseCamera exercise={exercise} onRep={addRep} fill />
      </View>

      <Row style={{ justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 12 }}>
        <Mono key={pulse} style={{ fontSize: 56, lineHeight: 62, letterSpacing: -2 }}>
          {count}
          <T style={{ fontSize: 22, fontWeight: '700', color: colors.mute }}>회</T>
        </Mono>
        <View style={{ alignItems: 'flex-end', paddingBottom: 6 }}>
          <Muted style={{ fontSize: 13 }}>충전 예정</Muted>
          <T style={{ fontSize: 18, fontWeight: '800', color: colors.red }}>+{formatDuration(gainPreview)}</T>
        </View>
      </Row>
    </Screen>
  );
}

const styles = StyleSheet.create({
  iconBtn: { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.ground, alignItems: 'center', justifyContent: 'center' },
  firstNote: { marginTop: 14, fontWeight: '700', color: colors.red },
});
