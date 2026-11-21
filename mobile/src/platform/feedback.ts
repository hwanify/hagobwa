import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import type { VoiceMode } from '@/core/voice';

/**
 * Native Korean voices only (no foreign accent): the best one installed on the phone,
 * preferring premium > enhanced > compact, and a different voice/tone per mode when possible.
 * Better voices: iPhone Settings > Accessibility > Read & Speak > Voices > Korean.
 */
const PREFERRED: Record<VoiceMode, string[]> = {
  basic: ['Yuna', 'Sora', 'Jian', 'Suhyun', 'Minsu'],
  drill: ['Minsu', 'Jian', 'Yuna', 'Sora'],
  pt: ['Sora', 'Suhyun', 'Yuna', 'Jian', 'Minsu'],
  mom: ['Suhyun', 'Yuna', 'Sora', 'Jian'],
};
const TONE: Record<VoiceMode, { rate: number; pitch: number }> = {
  basic: { rate: 1.0, pitch: 1.0 },
  drill: { rate: 1.15, pitch: 0.85 },
  pt: { rate: 1.05, pitch: 1.1 },
  mom: { rate: 0.95, pitch: 1.0 },
};

let koVoices: Speech.Voice[] | null = null;
const loading = Speech.getAvailableVoicesAsync()
  .then((vs) => {
    koVoices = vs.filter((v) => v.language?.toLowerCase().startsWith('ko'));
  })
  .catch(() => {
    koVoices = [];
  });

function grade(v: Speech.Voice): number {
  const id = v.identifier.toLowerCase();
  if (id.includes('premium')) return 3;
  if (id.includes('enhanced') || v.quality === Speech.VoiceQuality.Enhanced) return 2;
  return 1;
}

/** Best installed Korean voice for this mode (undefined = system default Korean). */
function pickVoice(mode: VoiceMode): string | undefined {
  if (!koVoices || koVoices.length === 0) return undefined;
  const rank = (v: Speech.Voice) => {
    const nameIdx = PREFERRED[mode].findIndex((n) => v.name.includes(n) || v.identifier.includes(n));
    return grade(v) * 10 - (nameIdx < 0 ? 9 : nameIdx);
  };
  return [...koVoices].sort((a, b) => rank(b) - rank(a))[0]?.identifier;
}

export function say(text: string, mode: VoiceMode = 'basic'): void {
  try {
    void loading;
    Speech.stop();
    const tone = TONE[mode];
    Speech.speak(text, {
      language: 'ko-KR',
      voice: pickVoice(mode),
      rate: Platform.OS === 'web' ? tone.rate * 1.05 : tone.rate,
      pitch: tone.pitch,
    });
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
