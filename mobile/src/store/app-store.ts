import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AppId } from '@/core/apps';
import type { Difficulty, ExerciseId } from '@/core/rates';
import {
  applyEmergency,
  capFor,
  creditWorkout,
  emptyBank,
  endSession,
  startSession,
  tick,
  type BankState,
} from '@/core/timebank';
import type { VoiceMode } from '@/core/voice';

export interface Settings {
  onboarded: boolean;
  goalHours: number;
  lockedApps: AppId[];
  difficulty: Difficulty;
  voice: VoiceMode;
  sound: boolean;
}

interface Actions {
  completeOnboarding(input: { goalHours: number; lockedApps: AppId[] }): void;
  updateSettings(patch: Partial<Settings>): void;
  /** Returns the seconds actually added to the balance. */
  logWorkout(exercise: ExerciseId, reps: number): number;
  openApp(appId: AppId): boolean;
  tickSession(): { exhausted: boolean };
  closeApp(): void;
  /** Demo helper: pretend `seconds` of the open session already passed. */
  skipAhead(seconds: number): { exhausted: boolean };
  emergencyUnlock(): boolean;
  resetAll(): void;
}

export type AppState = Settings & { bank: BankState } & Actions;

const defaults: Settings & { bank: BankState } = {
  onboarded: false,
  goalHours: 2,
  lockedApps: ['youtube', 'instagram'],
  difficulty: 'normal',
  voice: 'drill',
  sound: true,
  bank: emptyBank(),
};

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      ...defaults,

      completeOnboarding: ({ goalHours, lockedApps }) => set({ onboarded: true, goalHours, lockedApps }),

      updateSettings: (patch) => set(patch),

      logWorkout: (exercise, reps) => {
        const s = get();
        if (reps <= 0) return 0;
        const r = creditWorkout(s.bank, {
          exercise,
          reps,
          difficulty: s.difficulty,
          now: Date.now(),
          capSec: capFor(s.goalHours),
        });
        set({ bank: r.state });
        return r.earnedSec;
      },

      openApp: (appId) => {
        const s = get();
        if (s.bank.balanceSec <= 0) return false;
        set({ bank: startSession(s.bank, appId, Date.now()) });
        return true;
      },

      tickSession: () => {
        const r = tick(get().bank, Date.now());
        if (r.state !== get().bank) set({ bank: r.state });
        return { exhausted: r.exhausted };
      },

      closeApp: () => set({ bank: endSession(get().bank, Date.now()) }),

      skipAhead: (seconds) => {
        const bank = get().bank;
        if (!bank.session) return { exhausted: false };
        const shifted = { ...bank, session: { ...bank.session, lastTickAt: bank.session.lastTickAt - seconds * 1000 } };
        const r = tick(shifted, Date.now());
        set({ bank: r.state });
        return { exhausted: r.exhausted };
      },

      emergencyUnlock: () => {
        try {
          set({ bank: applyEmergency(get().bank, Date.now()) });
          return true;
        } catch {
          return false;
        }
      },

      resetAll: () => set({ ...defaults, bank: emptyBank() }),
    }),
    {
      name: 'hagobwa-v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ onboarded, goalHours, lockedApps, difficulty, voice, sound, bank }) => ({
        onboarded,
        goalHours,
        lockedApps,
        difficulty,
        voice,
        sound,
        bank,
      }),
    },
  ),
);

/** True once persisted state has been loaded from storage. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useAppStore.persist.hasHydrated());
  useEffect(() => {
    const unsub = useAppStore.persist.onFinishHydration(() => setHydrated(true));
    setHydrated(useAppStore.persist.hasHydrated());
    return unsub;
  }, []);
  return hydrated;
}

/** Re-render every `ms` milliseconds; returns the current time. */
export function useNow(ms = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
