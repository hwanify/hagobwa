import { describe, expect, it } from 'vitest';

import { formatClock, formatDuration } from '../format';
import { earnedSeconds, repsNeeded, secondsPerRep, stepsSeconds } from '../rates';
import { measure, RepCounter, type Landmark } from '../repCounter';
import {
  applyEmergency,
  BankError,
  creditWorkout,
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
    expect(secondsPerRep('pushup', 'normal')).toBe(60);
    expect(earnedSeconds('pushup', 10, 'normal')).toBe(600);
  });
  it('difficulty scales earnings', () => {
    expect(earnedSeconds('squat', 10, 'easy')).toBe(450);
    expect(earnedSeconds('pushup', 10, 'hard')).toBe(300);
  });
  it('ignores non-positive reps', () => {
    expect(earnedSeconds('pushup', 0, 'normal')).toBe(0);
    expect(earnedSeconds('pushup', -3, 'normal')).toBe(0);
  });
  it('reps needed rounds up', () => {
    expect(repsNeeded(600, 'pushup', 'normal')).toBe(10);
    expect(repsNeeded(61, 'pushup', 'normal')).toBe(2);
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

describe('RepCounter', () => {
  it('counts full pushup reps', () => {
    const c = new RepCounter('pushup');
    let t = 0;
    const frames = [170, 120, 80, 120, 165, 170, 85, 160, 90, 170];
    let completed = 0;
    for (const deg of frames) {
      t += 300;
      if (c.update(pushupPose(deg), t).repCompleted) completed++;
    }
    expect(completed).toBe(3);
    expect(c.reps).toBe(3);
  });

  it('does not count half reps', () => {
    const c = new RepCounter('pushup');
    let t = 0;
    for (const deg of [170, 120, 110, 165, 120, 170]) c.update(pushupPose(deg), (t += 300));
    expect(c.reps).toBe(0);
  });

  it('does not count reps with sagging hips', () => {
    const c = new RepCounter('pushup');
    let t = 0;
    for (const deg of [170, 80, 170, 80, 170]) c.update(pushupPose(deg, true), (t += 300));
    expect(c.reps).toBe(0);
  });

  it('ignores reps faster than the minimum interval', () => {
    const c = new RepCounter('pushup');
    c.update(pushupPose(80), 0);
    c.update(pushupPose(170), 500); // rep 1
    c.update(pushupPose(80), 600);
    c.update(pushupPose(170), 700); // too fast
    expect(c.reps).toBe(1);
  });

  it('counts squats by knee angle', () => {
    const c = new RepCounter('squat');
    let t = 0;
    for (const deg of [178, 140, 90, 140, 170, 175, 95, 170]) c.update(squatPose(deg), (t += 400));
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
