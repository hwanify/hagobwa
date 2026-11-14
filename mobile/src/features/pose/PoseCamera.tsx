import { StyleSheet, View } from 'react-native';

import { T } from '@/components/ui';
import { colors } from '@/theme';

import type { PoseCameraProps } from './types';

/**
 * Native placeholder.
 *
 * On-device pose counting on iOS/Android needs a camera frame processor
 * (react-native-vision-camera + MediaPipe / ML Kit pose), which requires a development build.
 * The counting logic itself is shared: feed landmarks into `RepCounter` from `@/core/repCounter`.
 * Until then the workout screen's tap button counts reps.
 */
export default function PoseCamera(_props: PoseCameraProps) {
  return (
    <View style={styles.frame}>
      <T style={styles.title}>카메라 자동 세기는 준비 중이에요</T>
      <T style={styles.note}>지금은 아래 탭 버튼으로 세어 주세요. 브라우저 버전에서는 웹캠 자동 세기가 돼요.</T>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: 18,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  title: { color: colors.paper, fontWeight: '700', fontSize: 15, textAlign: 'center' },
  note: { color: 'rgba(247,247,243,0.7)', fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
