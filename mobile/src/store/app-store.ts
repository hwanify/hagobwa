import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { AppState as RNAppState } from 'react-native';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { AppId } from '@/core/apps';
import { firstOpenedAtFor } from '@/core/plan';
import { repsNeeded, type Difficulty, type ExerciseId } from '@/core/rates';
import {
  applyEmergency,
  EMERGENCY_PER_DAY,
  capFor,
  chargeScreenTime,
  creditWorkout,
  emptyBank,
  endSession,
  startSession,
  tick,
  type BankState,
} from '@/core/timebank';
import { blocker, emergencyDayUsed, markEmergencyDay } from '@/platform/blocker';
import { dayKey } from '@/core/dates';

export interface Settings {
  onboarded: boolean;
  goalHours: number;
  lockedApps: AppId[];
  difficulty: Difficulty;
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

/** Kept on the phone only, never sent anywhere (see core/plan). */
interface Install {
  /** First time this phone opened the app (ms; 0 until known): early-bird backup evidence. */
  firstOpenedAt: number;
}

/** When the OS usage monitor was last (re)started, so its checkpoints can be charged once. */
interface BlockerSync {
  blockerSince: number;
  /** Seconds of that monitor's usage already charged to the balance. */
  blockerCharged: number;
  /** When the usage window ends (0 = none running, -1 = unknown, e.g. after an update). */
  blockerUntil: number;
}

export type AppState = Settings & { bank: BankState } & BlockerSync & Install & Actions;

const defaults: Settings & { bank: BankState } & BlockerSync & Install = {
  firstOpenedAt: 0,
  blockerSince: 0,
  blockerCharged: 0,
  blockerUntil: -1,
  onboarded: false,
  goalHours: 2,
  lockedApps: ['youtube', 'instagram'],
  difficulty: 'normal',
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

      updateSettings: (patch) => {
        const before = get();
        set(patch);
        const goalChanged = patch.goalHours !== undefined && patch.goalHours !== before.goalHours;
        const rateChanged = patch.difficulty !== undefined && patch.difficulty !== before.difficulty;
        if (!goalChanged && !rateChanged) return;
        if (blocker.kind === 'simulated') {
          // A lower maximum also trims what's already saved.
          const cap = capFor(get().goalHours);
          if (get().bank.balanceSec > cap) set({ bank: { ...get().bank, balanceSec: cap } });
          return;
        }
        // Re-lock with the new numbers: the lock screen shows "푸시업 N개면 10분" for this
        // difficulty, and the balance is trimmed to the new maximum after charging usage.
        void get().syncBlocker();
      },

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
          const now = Date.now();
          set({ bank: applyEmergency(get().bank, now) });
          // Shared with the lock screen's emergency button: one per day across both.
          markEmergencyDay(dayKey(now));
          void get().syncBlocker();
          return true;
        } catch {
          return false;
        }
      },

      resetAll: () => {
        // Everything goes, as the privacy policy says; this phone "first opens" again now.
        set({ ...defaults, bank: emptyBank(), firstOpenedAt: Date.now() });
        void get().syncBlocker();
      },

      clearBalance: () => {
        set({ bank: { ...endSession(get().bank, Date.now()), balanceSec: 0 }, blockerSince: 0, blockerCharged: 0, blockerUntil: -1 });
        void get().syncBlocker();
      },

      // One sync at a time: a charge, the app coming back and a picker change can all ask at
      // once, and two overlapping restarts of the Screen Time monitor could leave it half set up.
      syncBlocker: (opts) => {
        const run = syncQueue.then(() => syncOnce(opts));
        syncQueue = run.catch(() => {});
        return run;
      },
    }),
    {
      name: 'hagobwa-v1',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      partialize: ({ onboarded, goalHours, lockedApps, difficulty, sound, bank, blockerSince, blockerCharged, blockerUntil, firstOpenedAt }) => ({
        firstOpenedAt,
        blockerSince,
        blockerCharged,
        blockerUntil,
        onboarded,
        goalHours,
        lockedApps,
        difficulty,
        sound,
        bank,
      }),
      // Saved data from before firstOpenedAt existed loads as is (it just lacks the field, so the
      // default 0 stays); fill it in once, here, and never touch it again.
      onRehydrateStorage: () => (state, error) => {
        if (error || !state) return;
        const at = firstOpenedAtFor(state.firstOpenedAt, state.bank.workouts.map((w) => w.at), Date.now());
        if (at !== state.firstOpenedAt) useAppStore.setState({ firstOpenedAt: at });
      },
    },
  ),
);

let syncQueue: Promise<void> = Promise.resolve();

/** See AppState.syncBlocker. Runs only through the queue above. */
async function syncOnce({ restart = true }: { restart?: boolean } = {}): Promise<void> {
  if (blocker.kind === 'simulated') return;
  const { getState: get, setState: set } = useAppStore;
  const now = Date.now();
  // An emergency unlock used from the lock screen counts for today in the app too.
  const today = dayKey(now);
  if (emergencyDayUsed() === today && get().bank.emergency.day !== today) {
    set({ bank: { ...get().bank, emergency: { day: today, used: EMERGENCY_PER_DAY } } });
  }
  const s = get();
  // Usage is cumulative since the monitor started, so short sessions add up (30s + 30s = 1 min).
  const used = s.blockerSince > 0 ? blocker.usedSecondsSince(s.blockerSince) : 0;
  const charged = chargeScreenTime(s.bank, Math.max(0, used - s.blockerCharged), now);
  // The maximum can have been lowered in settings: trim what's saved to it.
  const cap = capFor(s.goalHours);
  const trimmed = charged.balanceSec > cap;
  const bank = trimmed ? { ...charged, balanceSec: cap } : charged;
  // Restarting the monitor drops the partial minute in progress, so only restart when the
  // balance changed (charge, emergency, picker) or the usage window is about to end.
  const until = s.blockerUntil ?? -1;
  const stale = until < 0 || (until > 0 && now > until - 15 * 60_000);
  if (!restart && !stale && !trimmed) {
    set({ bank, blockerCharged: Math.max(s.blockerCharged, used) });
    return;
  }
  set({ bank, blockerSince: now, blockerCharged: 0 });
  try {
    const ends = await blocker.apply(get().onboarded ? bank.balanceSec : 0, repsNeeded(600, 'pushup', get().difficulty));
    set({ blockerUntil: ends });
  } catch {
    // Screen Time refused (e.g. permission revoked): keep the in-app balance as is.
  }
}

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
