import { describe, expect, it } from 'vitest';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import { firstOpenedAtFor, hasPlusFeature, isEarlyBird, isPlus, PAID_LAUNCH, PLUS_FEATURES, type PlusFeature } from '../plan';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 29, 3, 0);

describe('plan: nothing is locked yet', () => {
  it('everyone has Plus and every Plus feature', () => {
    expect(PAID_LAUNCH).toBeNull();
    expect(isPlus()).toBe(true);
    for (const f of Object.keys(PLUS_FEATURES) as PlusFeature[]) expect(hasPlusFeature(f)).toBe(true);
  });

  it('everyone is an early bird until paid plans start', () => {
    expect(isEarlyBird({ originalAppVersion: null, firstOpenedAt: 0 })).toBe(true);
  });
});

describe('plan: early bird once paid plans start', () => {
  const launch = { firstPaidBuild: 30, at: NOW };

  it("goes by Apple's first-install build number when it's there", () => {
    expect(isEarlyBird({ originalAppVersion: '18', firstOpenedAt: NOW + DAY }, launch)).toBe(true);
    expect(isEarlyBird({ originalAppVersion: '30', firstOpenedAt: NOW - DAY }, launch)).toBe(false);
    expect(isEarlyBird({ originalAppVersion: '31', firstOpenedAt: 0 }, launch)).toBe(false);
    // TestFlight and the sandbox always say "1.0".
    expect(isEarlyBird({ originalAppVersion: '1.0', firstOpenedAt: 0 }, launch)).toBe(true);
  });

  it("falls back to the phone's own dates when Apple's record can't be read", () => {
    expect(isEarlyBird({ originalAppVersion: null, firstOpenedAt: NOW - DAY }, launch)).toBe(true);
    expect(isEarlyBird({ originalAppVersion: null, firstOpenedAt: NOW + DAY }, launch)).toBe(false);
    // An older workout on the phone also proves it.
    expect(isEarlyBird({ originalAppVersion: null, firstOpenedAt: NOW + DAY, workoutTimes: [NOW - 3 * DAY] }, launch)).toBe(true);
    expect(isEarlyBird({ originalAppVersion: 'abc', firstOpenedAt: 0, workoutTimes: [] }, launch)).toBe(false);
  });
});

describe('firstOpenedAt', () => {
  it('is kept once saved, whatever happens later', () => {
    expect(firstOpenedAtFor(NOW - 5 * DAY, [NOW - 30 * DAY], NOW)).toBe(NOW - 5 * DAY);
  });

  it('a new phone starts now; a phone used before it was recorded gets its oldest workout', () => {
    expect(firstOpenedAtFor(undefined, [], NOW)).toBe(NOW);
    expect(firstOpenedAtFor(0, [NOW - 2 * DAY, NOW - 9 * DAY, NOW - DAY], NOW)).toBe(NOW - 9 * DAY);
  });

  it('ignores broken values', () => {
    expect(firstOpenedAtFor(Number.NaN, [Number.NaN, -5, 'x', null, NOW - DAY], NOW)).toBe(NOW - DAY);
    expect(firstOpenedAtFor('2026-01-01', [], NOW)).toBe(NOW);
    // A workout dated in the future (wrong clock) can't make it later than now.
    expect(firstOpenedAtFor(0, [NOW + DAY], NOW)).toBe(NOW);
  });
});

/**
 * The app's store (store/app-store.ts) persists with zustand to AsyncStorage under
 * 'hagobwa-v1', version 1, and fills firstOpenedAt in onRehydrateStorage. Saved data from
 * before the field existed must load untouched, get the field once, and keep it.
 */
describe('saved data from before firstOpenedAt', () => {
  interface Saved {
    onboarded: boolean;
    goalHours: number;
    difficulty: string;
    bank: { balanceSec: number; workouts: { at: number; reps: number }[] };
    firstOpenedAt: number;
  }
  const defaults: Saved = { onboarded: false, goalHours: 2, difficulty: 'normal', bank: { balanceSec: 0, workouts: [] }, firstOpenedAt: 0 };

  function memoryStorage(initial: Record<string, string>) {
    const data = { ...initial };
    return {
      data,
      getItem: async (k: string) => data[k] ?? null,
      setItem: async (k: string, v: string) => {
        data[k] = v;
      },
      removeItem: async (k: string) => {
        delete data[k];
      },
    };
  }

  function load(storage: ReturnType<typeof memoryStorage>, now: number) {
    return new Promise<Saved>((resolve) => {
      const store = create<Saved>()(
        persist(() => ({ ...defaults }), {
          name: 'hagobwa-v1',
          version: 1,
          storage: createJSONStorage(() => storage),
          onRehydrateStorage: () => (state, error) => {
            if (error || !state) return;
            const at = firstOpenedAtFor(state.firstOpenedAt, state.bank.workouts.map((w) => w.at), now);
            if (at !== state.firstOpenedAt) store.setState({ firstOpenedAt: at });
          },
        }),
      );
      store.persist.onFinishHydration(() => setTimeout(() => resolve(store.getState()), 0));
    });
  }

  it('loads as before, gets the oldest workout date once, and keeps it after that', async () => {
    const old = {
      state: { onboarded: true, goalHours: 3, difficulty: 'hard', bank: { balanceSec: 1200, workouts: [{ at: NOW - 6 * DAY, reps: 20 }, { at: NOW - 2 * DAY, reps: 10 }] } },
      version: 1,
    };
    const storage = memoryStorage({ 'hagobwa-v1': JSON.stringify(old) });

    const first = await load(storage, NOW);
    expect(first).toMatchObject({ onboarded: true, goalHours: 3, difficulty: 'hard', bank: old.state.bank });
    expect(first.firstOpenedAt).toBe(NOW - 6 * DAY);
    expect(JSON.parse(storage.data['hagobwa-v1'])).toMatchObject({ version: 1, state: { firstOpenedAt: NOW - 6 * DAY, goalHours: 3 } });

    // Days later, with the old workouts gone from history: still the same date.
    const later = JSON.parse(storage.data['hagobwa-v1']);
    later.state.bank.workouts = [{ at: NOW + 3 * DAY, reps: 5 }];
    storage.data['hagobwa-v1'] = JSON.stringify(later);
    const again = await load(storage, NOW + 10 * DAY);
    expect(again.firstOpenedAt).toBe(NOW - 6 * DAY);
    expect(again.bank.workouts).toHaveLength(1);
  });

  it('a fresh install records now', async () => {
    const storage = memoryStorage({});
    const s = await load(storage, NOW);
    expect(s.firstOpenedAt).toBe(NOW);
    expect(JSON.parse(storage.data['hagobwa-v1']).state.firstOpenedAt).toBe(NOW);
  });
});
