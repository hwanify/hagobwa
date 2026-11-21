import { describe, expect, it } from 'vitest';

import { formatClock, formatDuration } from '../format';
import { earnedSeconds, rateLabel, repsNeeded, stepsSeconds } from '../rates';
import { measure, RepCounter, type Landmark } from '../repCounter';
import {
  applyEmergency,
  BankError,
  creditWorkout,
  dailyTotals,
  dayLogs,
  emergencyLeft,
  exerciseTotals,
  emptyBank,
  EMERGENCY_GRANT_SEC,
  endSession,
  startSession,
  streakDays,
  tick,
  todayReps,
  weekSeries,
} from '../timebank';
import { repLine } from '../voice';

const T0 = new Date(2026, 10, 14, 12, 0, 0).getTime(); // Sat 14 Nov 2026, noon local
const DAY = 24 * 3600 * 1000;
const CAP = 2 * 3600;

describe('rates', () => {
  it('pushup 1 rep = 1 min at normal', () => {
    expect(rateLabel('pushup', 'normal')).toBe('1회 = 1분');
    expect(rateLabel('squat', 'hard')).toBe('4회 = 1분');
    expect(earnedSeconds('pushup', 10, 'normal')).toBe(600);
  });
  it('difficulty scales earnings', () => {
    expect(earnedSeconds('squat', 10, 'easy')).toBe(600);
    // whole minutes only: 7 squats at normal (2 per minute) = 3 minutes
    expect(earnedSeconds('squat', 7, 'normal')).toBe(180);
    expect(earnedSeconds('pushup', 10, 'hard')).toBe(300);
  });
  it('ignores non-positive reps', () => {
    expect(earnedSeconds('pushup', 0, 'normal')).toBe(0);
    expect(earnedSeconds('pushup', -3, 'normal')).toBe(0);
  });
  it('reps needed rounds up', () => {
    expect(repsNeeded(600, 'pushup', 'normal')).toBe(10);
    expect(repsNeeded(61, 'pushup', 'normal')).toBe(2);
    expect(repsNeeded(600, 'squat', 'normal')).toBe(20);
    expect(repsNeeded(600, 'squat', 'hard')).toBe(40);
  });
  it('steps: 1,000 steps = 5 min', () => {
    expect(stepsSeconds(2500, 'normal')).toBe(600);
  });
});

describe('format', () => {
  it('formats durations in Korean', () => {
    expect(formatDuration(0)).toBe('0분');
    expect(formatDuration(45)).toBe('45초');
    expect(formatDuration(750)).toBe('12분 30초');
    expect(formatDuration(3900)).toBe('1시간 5분');
    expect(formatDuration(7200)).toBe('2시간');
  });
  it('formats clocks', () => {
    expect(formatClock(665)).toBe('11:05');
    expect(formatClock(3723)).toBe('1:02:03');
  });
});

describe('timebank', () => {
  it('credits a workout and caps at the daily goal', () => {
    const r1 = creditWorkout(emptyBank(), { exercise: 'pushup', reps: 10, difficulty: 'normal', now: T0, capSec: CAP });
    expect(r1.earnedSec).toBe(600);
    expect(r1.state.balanceSec).toBe(600);
    const r2 = creditWorkout(r1.state, { exercise: 'pushup', reps: 200, difficulty: 'normal', now: T0, capSec: CAP });
    expect(r2.state.balanceSec).toBe(CAP);
    expect(r2.earnedSec).toBe(CAP - 600);
    expect(todayReps(r2.state, T0)).toBe(210);
  });

  it('rejects zero-rep workouts', () => {
    expect(() =>
      creditWorkout(emptyBank(), { exercise: 'pushup', reps: 0, difficulty: 'normal', now: T0, capSec: CAP }),
    ).toThrow(BankError);
  });

  it('charges session time and locks at zero', () => {
    let s = creditWorkout(emptyBank(), { exercise: 'pushup', reps: 2, difficulty: 'normal', now: T0, capSec: CAP }).state;
    s = startSession(s, 'youtube', T0);
    const t1 = tick(s, T0 + 30_000);
    expect(t1.exhausted).toBe(false);
    expect(t1.state.balanceSec).toBe(90);
    const t2 = tick(t1.state, T0 + 500_000);
    expect(t2.exhausted).toBe(true);
    expect(t2.state.balanceSec).toBe(0);
    expect(t2.state.session).toBeNull();
    expect(t2.state.usage['2026-11-14'].youtube).toBe(120);
  });

  it('cannot start a session with no balance', () => {
    expect(() => startSession(emptyBank(), 'youtube', T0)).toThrow(BankError);
  });

  it('ending a session charges the remaining time', () => {
    let s = creditWorkout(emptyBank(), { exercise: 'pushup', reps: 5, difficulty: 'normal', now: T0, capSec: CAP }).state;
    s = startSession(s, 'instagram', T0);
    s = endSession(s, T0 + 61_500);
    expect(s.balanceSec).toBe(300 - 61);
    expect(s.session).toBeNull();
  });

  it('emergency unlock: once per day, resets next day', () => {
    let s = emptyBank();
    expect(emergencyLeft(s, T0)).toBe(1);
    s = applyEmergency(s, T0);
    expect(s.balanceSec).toBe(EMERGENCY_GRANT_SEC);
    expect(emergencyLeft(s, T0)).toBe(0);
    expect(() => applyEmergency(s, T0 + 1000)).toThrow(BankError);
    expect(emergencyLeft(s, T0 + DAY)).toBe(1);
    s = applyEmergency(s, T0 + DAY);
    expect(s.balanceSec).toBe(2 * EMERGENCY_GRANT_SEC);
  });

  it('streak counts consecutive days and tolerates an empty today', () => {
    let s = emptyBank();
    for (const d of [-3, -2, -1]) {
      s = creditWorkout(s, { exercise: 'squat', reps: 5, difficulty: 'normal', now: T0 + d * DAY, capSec: CAP }).state;
    }
    expect(streakDays(s, T0)).toBe(3);
    s = creditWorkout(s, { exercise: 'squat', reps: 5, difficulty: 'normal', now: T0, capSec: CAP }).state;
    expect(streakDays(s, T0)).toBe(4);
    expect(streakDays(s, T0 + 2 * DAY)).toBe(0);
  });

  it('totals reps per exercise and groups by day', () => {
    let s = emptyBank();
    const add = (exercise: 'pushup' | 'squat', reps: number, at: number) =>
      (s = creditWorkout(s, { exercise, reps, difficulty: 'normal', now: at, capSec: 10 * CAP }).state);
    add('pushup', 10, T0 - DAY);
    add('pushup', 15, T0);
    add('squat', 20, T0 + 1000);
    const totals = exerciseTotals(s, T0 - 2 * DAY, T0 + DAY);
    expect(totals.pushup).toEqual({ reps: 25, sessions: 2, earnedSec: 1500 });
    expect(totals.squat).toEqual({ reps: 20, sessions: 1, earnedSec: 600 });
    expect(exerciseTotals(s, T0 - 1000, T0 + DAY).pushup.reps).toBe(15);
    const logs = dayLogs(s, 0, T0 + DAY);
    expect(logs).toHaveLength(2);
    expect(logs[0].totals).toEqual({ pushup: 15, squat: 20 });
    expect(logs[0].workouts[0].exercise).toBe('squat');
    expect(logs[1].totals).toEqual({ pushup: 10, squat: 0 });
  });

  it('daily totals cover every day in range, empty days included', () => {
    let s = emptyBank();
    s = creditWorkout(s, { exercise: 'pushup', reps: 12, difficulty: 'normal', now: T0 - DAY, capSec: 10 * CAP }).state;
    s = creditWorkout(s, { exercise: 'squat', reps: 8, difficulty: 'normal', now: T0, capSec: 10 * CAP }).state;
    s = creditWorkout(s, { exercise: 'pushup', reps: 3, difficulty: 'normal', now: T0 + 60_000, capSec: 10 * CAP }).state;
    const start = new Date(2026, 10, 12).getTime();
    const days = dailyTotals(s, start, 4); // 12, 13, 14, 15 Nov
    expect(days.map((d) => [d.pushup, d.squat])).toEqual([[0, 0], [12, 0], [3, 8], [0, 0]]);
    expect(days[2].earnedSec).toBe(3 * 60 + 8 * 30);
  });

  it('week series is Monday-first', () => {
    // T0 is Saturday -> index 5
    const s = creditWorkout(emptyBank(), { exercise: 'pushup', reps: 7, difficulty: 'normal', now: T0, capSec: CAP }).state;
    expect(weekSeries(s, T0)).toEqual([0, 0, 0, 0, 0, 7, 0]);
  });
});

/* ---------- pose ---------- */

function blank(): Landmark[] {
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 1 }));
}
const rad = (deg: number) => (deg * Math.PI) / 180;

function pushupPose(elbowDeg: number, sag = false): Landmark[] {
  const lm = blank();
  const set = (i: number, x: number, y: number) => (lm[i] = { x, y, visibility: 1 });
  for (const [s, e, w, h, k, a] of [
    [11, 13, 15, 23, 25, 27],
    [12, 14, 16, 24, 26, 28],
  ]) {
    set(s, 0.3, 0.5);
    set(e, 0.3, 0.6);
    set(w, 0.3 + 0.1 * Math.sin(rad(elbowDeg)), 0.6 - 0.1 * Math.cos(rad(elbowDeg)));
    set(h, 0.6, sag ? 0.8 : 0.5);
    set(k, 0.75, 0.5);
    set(a, 0.9, 0.5);
  }
  return lm;
}

function squatPose(kneeDeg: number): Landmark[] {
  const lm = blank();
  const set = (i: number, x: number, y: number) => (lm[i] = { x, y, visibility: 1 });
  for (const [h, k, a] of [
    [23, 25, 27],
    [24, 26, 28],
  ]) {
    set(h, 0.5, 0.4);
    set(k, 0.5, 0.6);
    set(a, 0.5 + 0.2 * Math.sin(rad(kneeDeg)), 0.6 - 0.2 * Math.cos(rad(kneeDeg)));
  }
  return lm;
}

describe('pose measurement', () => {
  it('measures the elbow angle', () => {
    expect(measure(pushupPose(170), 'pushup').angle).toBeCloseTo(170, 0);
    expect(measure(pushupPose(80), 'pushup').angle).toBeCloseTo(80, 0);
  });
  it('flags sagging hips as invalid', () => {
    const m = measure(pushupPose(80, true), 'pushup');
    expect(m.valid).toBe(false);
    expect(m.hint).toBe('straighten');
  });
  it('asks for visibility when arms are hidden', () => {
    const lm = pushupPose(170).map((p) => ({ ...p, visibility: 0.1 }));
    expect(measure(lm, 'pushup').hint).toBe('show-arms');
  });
  it('reports no person', () => {
    expect(measure(undefined, 'squat').hint).toBe('no-person');
  });
});

/** Feed keyframe angles, interpolated at ~20 fps like the camera, `msPerKey` apart. */
function play(c: RepCounter, pose: (deg: number) => Landmark[], keys: number[], msPerKey = 400, t0 = 0) {
  let t = t0;
  let completed = 0;
  for (let i = 1; i < keys.length; i++) {
    const steps = Math.max(1, Math.round(msPerKey / 50));
    for (let s = 1; s <= steps; s++) {
      t += msPerKey / steps;
      const deg = keys[i - 1] + ((keys[i] - keys[i - 1]) * s) / steps;
      if (c.update(pose(deg), t).repCompleted) completed++;
    }
  }
  return { completed, t };
}

describe('RepCounter', () => {
  it('counts full pushup reps', () => {
    const c = new RepCounter('pushup');
    const { completed } = play(c, pushupPose, [170, 170, 80, 170, 85, 165, 90, 170, 170]);
    expect(completed).toBe(3);
    expect(c.reps).toBe(3);
  });

  it('does not count half reps after a full one', () => {
    const c = new RepCounter('pushup');
    play(c, pushupPose, [170, 170, 80, 170, 125, 170, 130, 170, 125, 170, 128, 170, 170], 700);
    expect(c.reps).toBe(1);
  });

  it('does not count a single early half rep', () => {
    const c = new RepCounter('pushup');
    play(c, pushupPose, [170, 170, 125, 170, 170]);
    expect(c.reps).toBe(0);
  });

  it('does not double count a pause at the bottom or wobble near a threshold', () => {
    const c = new RepCounter('pushup');
    play(c, pushupPose, [170, 170, 85, 95, 85, 100, 88, 170, 160, 170, 158, 170]);
    expect(c.reps).toBe(1);
  });

  it('does not count reps with sagging hips', () => {
    const c = new RepCounter('pushup');
    play(c, (d) => pushupPose(d, true), [170, 80, 170, 80, 170]);
    expect(c.reps).toBe(0);
  });

  it('ignores reps faster than the minimum interval', () => {
    const c = new RepCounter('pushup');
    play(c, pushupPose, [170, 170, 80, 170, 80, 170], 100);
    expect(c.reps).toBeLessThanOrEqual(1);
  });

  it('adapts to a shallow camera view after a few reps', () => {
    // Elbow only appears to bend to 125 degrees (e.g. phone in front), never reaching the default bottom.
    const c = new RepCounter('pushup');
    const keys = [165];
    for (let i = 0; i < 8; i++) keys.push(125, 165);
    play(c, pushupPose, keys, 900);
    expect(c.reps).toBeGreaterThanOrEqual(5);
  });

  it('never counts jitter while holding still', () => {
    const c = new RepCounter('pushup');
    const keys = [168];
    for (let i = 0; i < 60; i++) keys.push(i % 2 ? 168 : 160 + (i % 5));
    play(c, pushupPose, keys, 200);
    expect(c.reps).toBe(0);
  });

  it('counts squats by knee angle', () => {
    const c = new RepCounter('squat');
    play(c, squatPose, [178, 178, 90, 175, 95, 170, 170]);
    expect(c.reps).toBe(2);
  });
});

describe('voice', () => {
  it('uses native Korean counts and mode lines', () => {
    expect(repLine('basic', 3, 10)).toBe('셋');
    expect(repLine('drill', 5, 10)).toBe('다섯! 아직 안 끝났다!');
    expect(repLine('pt', 7, 10)).toBe('일곱. 세 개만 더!');
    expect(repLine('drill', 10, 10)).toBe('열! 동작 그만! 수고했다!');
    expect(repLine('basic', 25, 30)).toBe('25');
  });
});

describe('screen time usage', () => {
  it('checks every minute for an hour, then every 5, ending exactly at the balance', async () => {
    const { usageCheckpoints } = await import('../timebank');
    expect(usageCheckpoints(30)).toEqual([]);
    expect(usageCheckpoints(3 * 60)).toEqual([1, 2, 3]);
    const long = usageCheckpoints(72 * 60);
    expect(long.slice(58, 64)).toEqual([59, 60, 65, 70, 72]);
  });

  it('charges reported usage, never below zero', async () => {
    const { chargeScreenTime, emptyBank, SCREEN_TIME_APP } = await import('../timebank');
    const bank = { ...emptyBank(), balanceSec: 600 };
    const now = Date.now();
    const a = chargeScreenTime(bank, 240, now);
    expect(a.balanceSec).toBe(360);
    expect(Object.values(a.usage)[0][SCREEN_TIME_APP]).toBe(240);
    expect(chargeScreenTime(a, 9999, now).balanceSec).toBe(0);
  });
});
