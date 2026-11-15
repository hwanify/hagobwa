import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AppId } from '@/core/apps';
import type { Difficulty, ExerciseId } from '@/core/rates';
import {
  applyEmergency,
  capFor,
  chargeScreenTime,
  creditWorkout,
  emptyBank,
  endSession,
  startSession,
  tick,
  type BankState,
} from '@/core/timebank';
import type { VoiceMode } from '@/core/voice';
import { blocker } from '@/platform/blocker';

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
  /** Saves the workout. Returns its record id and the seconds actually added to the balance. */
  logWorkout(exercise: ExerciseId, reps: number): { id: string; earnedSec: number } | null;
  openApp(appId: AppId): boolean;
  tickSession(): { exhausted: boolean };
  closeApp(): void;
  /** Demo helper: pretend `seconds` of the open session already passed. */
  skipAhead(seconds: number): { exhausted: boolean };
  emergencyUnlock(): boolean;
  resetAll(): void;
  /** Test helper: empty the balance (and lock the apps) without touching records. */
  clearBalance(): void;
  /**
   * Real (OS) blocking: charge usage the OS reported since the last sync, then re-shield or
   * re-open the picked apps to match the balance. No-op on the simulated blocker.
   */
  syncBlocker(opts?: { restart?: boolean }): Promise<void>;
}

/** When the OS usage monitor was last (re)started, so its checkpoints can be charged once. */
interface BlockerSync {
  blockerSince: number;
  /** Seconds of that monitor's usage already charged to the balance. */
  blockerCharged: number;
}

export type AppState = Settings & { bank: BankState } & BlockerSync & Actions;

const defaults: Settings & { bank: BankState } & BlockerSync = {
  blockerSince: 0,
  blockerCharged: 0,
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

      completeOnboarding: ({ goalHours, lockedApps }) => {
        set({ onboarded: true, goalHours, lockedApps });
        void get().syncBlocker();
      },

      updateSettings: (patch) => set(patch),

      logWorkout: (exercise, reps) => {
        const s = get();
        if (reps <= 0) return null;
        const r = creditWorkout(s.bank, {
          exercise,
          reps,
          difficulty: s.difficulty,
          now: Date.now(),
          capSec: capFor(s.goalHours),
        });
        set({ bank: r.state });
        void get().syncBlocker();
        return { id: r.record.id, earnedSec: r.earnedSec };
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
          void get().syncBlocker();
          return true;
        } catch {
          return false;
        }
      },

      resetAll: () => {
        set({ ...defaults, bank: emptyBank() });
        void get().syncBlocker();
      },

      clearBalance: () => {
        set({ bank: { ...endSession(get().bank, Date.now()), balanceSec: 0 }, blockerSince: 0, blockerCharged: 0 });
        void get().syncBlocker();
      },

      syncBlocker: async ({ restart = true } = {}) => {
        if (blocker.kind === 'simulated') return;
        const s = get();
        const now = Date.now();
        // Usage is cumulative since the monitor started, so short sessions add up (30s + 30s = 1 min).
        const used = s.blockerSince > 0 ? blocker.usedSecondsSince(s.blockerSince) : 0;
        const bank = chargeScreenTime(s.bank, Math.max(0, used - s.blockerCharged), now);
        // Restarting the monitor drops the partial minute in progress, so only restart when the
        // balance changed (charge, emergency, picker) or the monitor is from before midnight
        // (iOS resets usage then and shields the apps until we re-sync).
        const midnight = new Date(now);
        midnight.setHours(0, 0, 0, 0);
        const stale = s.blockerSince < midnight.getTime();
        if (!restart && !stale) {
          set({ bank, blockerCharged: Math.max(s.blockerCharged, used) });
          return;
        }
        set({ bank, blockerSince: now, blockerCharged: 0 });
        try {
          await blocker.apply(get().onboarded ? bank.balanceSec : 0);
        } catch {
          // Screen Time refused (e.g. permission revoked): keep the in-app balance as is.
        }
      },
    }),
    {
      name: 'hagobwa-v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ onboarded, goalHours, lockedApps, difficulty, voice, sound, bank, blockerSince, blockerCharged }) => ({
        blockerSince,
        blockerCharged,
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

/** Keep OS blocking in step with the balance: on launch and whenever the app comes back. */
export function useBlockerSync(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || blocker.kind === 'simulated') return;
    void useAppStore.getState().syncBlocker({ restart: false });
    const sub = RNAppState.addEventListener('change', (st) => {
      if (st === 'active') void useAppStore.getState().syncBlocker({ restart: false });
    });
    return () => sub.remove();
  }, [enabled]);
}

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
