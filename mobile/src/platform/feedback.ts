import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

export function say(text: string): void {
  try {
    Speech.stop();
    Speech.speak(text, { language: 'ko-KR', rate: Platform.OS === 'web' ? 1.05 : 1.0 });
  } catch {
    // Speech is a bonus. Never block the workout on it.
  }
}

export function tapFeedback(): void {
  if (Platform.OS === 'web') return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

export function successFeedback(): void {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
