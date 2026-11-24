import * as Haptics from 'expo-haptics';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';

import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

import { koCount, type VoiceMode } from '@/core/voice';
import { COUNT_CLIPS } from '@/features/voice/counts';

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


/* ---------- recorded counts ---------- */

let audioReady = false;
const players = new Map<number, AudioPlayer>();

function playerFor(n: number): AudioPlayer | null {
  const clip = COUNT_CLIPS[n];
  if (clip === undefined) return null;
  let p = players.get(n);
  if (!p) {
    const player = createAudioPlayer(clip);
    // When a clip ends, stop it for good and rewind. Otherwise iOS can count it as
    // "was playing" and replay it when the audio session comes back after an interruption
    // (e.g. the camera starting), which made a stray "둘" pop out after the preview.
    player.addListener('playbackStatusUpdate', (s) => {
      if (!s.didJustFinish) return;
      try {
        player.pause();
        void player.seekTo(0);
      } catch {
        // released meanwhile
      }
    });
    players.set(n, player);
    p = player;
  }
  return p;
}

function prepareAudio(): void {
  if (audioReady) return;
  audioReady = true;
  setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
}

/**
 * Get the first counts ready when the workout screen opens, so "하나" plays the moment the
 * first rep lands instead of waiting for the audio session and the file to load.
 */
export function preloadCounts(): void {
  workoutOpen = true;
  try {
    prepareAudio();
    playerFor(1);
    playerFor(2);
    playerFor(3);
  } catch {
    // Counting out loud is a bonus.
  }
}

/**
 * Say a rep count in the recorded voice; numbers beyond the recordings use the system voice.
 * Plays over music (ducking it) and in silent mode, since the user asked for counting.
 */
export function sayCount(n: number): void {
  try {
    prepareAudio();
    const p = playerFor(n);
    if (!p) {
      say(koCount(n), 'drill');
      return;
    }
    // A fresh player is already at the start: play right away instead of waiting on a seek.
    if (p.currentTime > 0.01) void p.seekTo(0).then(() => p.play());
    else p.play();
    // Warm up the next couple so they start instantly.
    playerFor(n + 1);
    playerFor(n + 2);
  } catch {
    // Counting out loud is a bonus. Never block the workout on it.
  }
}

let previewTimers: ReturnType<typeof setTimeout>[] = [];
let workoutOpen = false;

/** Settings "구령 들어보기": 하나, 둘, 셋, then free the players so nothing lingers. */
export function previewCounts(): void {
  previewTimers.forEach(clearTimeout);
  previewTimers = [1, 2, 3].map((n, i) => setTimeout(() => sayCount(n), i * 700));
  previewTimers.push(setTimeout(() => !workoutOpen && releaseCounts(), 3 * 700 + 1500));
}

/** Free the preloaded clips when a workout ends. */
export function releaseCounts(): void {
  workoutOpen = false;
  for (const p of players.values()) {
    try {
      p.pause();
      p.remove();
    } catch {
      // already gone
    }
  }
  players.clear();
}
