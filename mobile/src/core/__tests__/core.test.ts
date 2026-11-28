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
  // Everything not set explicitly is a low-confidence guess, like MediaPipe's hidden joints.
  return Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.2 }));
}
const rad = (deg: number) => (deg * Math.PI) / 180;

/**
 * Push-up filmed from the side, hand planted on the floor at (0.3, 0.8); the shoulder moves.
 * Forearm stays vertical, the elbow angle is `elbowDeg`, the body runs to the feet at x = 0.9.
 */
function pushupPose(elbowDeg: number, sag = false): Landmark[] {
  const lm = blank();
  const set = (i: number, x: number, y: number, v = 1) => (lm[i] = { x, y, visibility: v });
  const wrist = { x: 0.3, y: 0.8 };
  const elbow = { x: 0.3, y: 0.65 };
  const sh = { x: 0.3 - 0.15 * Math.sin(rad(elbowDeg)), y: 0.65 + 0.15 * Math.cos(rad(elbowDeg)) };
  const ankle = { x: 0.9, y: 0.78 };
  const hip = { x: (sh.x + ankle.x) / 2, y: (sh.y + ankle.y) / 2 + (sag ? 0.2 : 0) };
  // Near side (left) clear, far side (right) hidden behind the body.
  for (const [s, e, w, h, k, a, v] of [
    [11, 13, 15, 23, 25, 27, 1],
    [12, 14, 16, 24, 26, 28, 0.3],
  ]) {
    set(s, sh.x, sh.y, v);
    set(e, elbow.x, elbow.y, v);
    set(w, wrist.x, wrist.y, v);
    set(h, hip.x, hip.y, v);
    set(k, (hip.x + ankle.x) / 2, (hip.y + ankle.y) / 2, v);
    set(a, ankle.x, ankle.y, v);
  }
  set(0, sh.x - 0.08, sh.y + 0.02);
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

interface FrontOpts {
  /** Whole picture moved (phone moved): added to every point. */
  shift?: { x: number; y: number };
  /** Whole picture scaled around the centre (phone moved closer/farther). */
  zoom?: number;
  /** Random wrist/elbow wobble, in picture units. */
  noise?: number;
  /** Wrists out of sight (phone too close / being carried). */
  noHands?: boolean;
  /** Upright body (standing): hips in view well below the shoulders, head above them. */
  upright?: boolean;
  /** Raise the hands toward the shoulders by this fraction (arms moving, not planted). */
  lift?: number;
}

/**
 * Push-up filmed by a phone standing on the floor in front of the head (down = 0 top .. 1 bottom).
 * Hands stay planted; the shoulders come down to them and get ~17% wider (closer to the phone).
 * The gap from shoulders to wrists goes from 1.35 to 0.25 shoulder widths, as worked out for a
 * phone 50-150 cm away. Coordinates are isotropic (y over the frame width), like the app sends.
 */
function frontPose(down: number, o: FrontOpts = {}): Landmark[] {
  const lm = blank();
  const zoom = o.zoom ?? 1;
  const shift = o.shift ?? { x: 0, y: 0 };
  const n = () => (Math.random() - 0.5) * 2 * (o.noise ?? 0);
  const set = (i: number, x: number, y: number, v = 1) =>
    (lm[i] = { x: 0.5 + (x - 0.5) * zoom + shift.x, y: 0.65 + (y - 0.65) * zoom + shift.y, visibility: v });
  const width = 0.3 * (1 + 0.17 * down);
  const wristY = 1.0 - (o.lift ?? 0) * 0.3;
  const shoulderY = 1.0 - (1.35 - 1.1 * down) * width;
  for (const [s, e, w, h, k, a, dir] of [
    [11, 13, 15, 23, 25, 27, -1],
    [12, 14, 16, 24, 26, 28, 1],
  ]) {
    const sx = 0.5 + (dir * width) / 2;
    set(s, sx, shoulderY);
    set(e, sx + dir * (0.03 + 0.08 * down) + n(), (shoulderY + wristY) / 2 - 0.03 * down + n(), 0.8);
    set(w, 0.5 + dir * 0.19 + n(), wristY + n(), o.noHands ? 0.1 : 0.9);
    if (o.upright) {
      // Standing in front of the phone: hips, knees and ankles in plain view below.
      set(h, sx * 0.9 + 0.05, shoulderY + 1.3 * width, 0.95);
      set(k, sx * 0.9 + 0.05, shoulderY + 2.4 * width, 0.9);
      set(a, sx * 0.9 + 0.05, shoulderY + 3.4 * width, 0.9);
    } else {
      // Hips/legs are behind the body from here: low-confidence guesses near the shoulders.
      set(h, sx, shoulderY + 0.05, 0.3);
      set(k, sx, shoulderY + 0.08, 0.2);
      set(a, sx, shoulderY + 0.02, 0.2);
    }
  }
  // Standing: head above the shoulders (as measured on real footage, ~0.3-0.4 shoulder widths).
  set(0, 0.5, o.upright ? shoulderY - 0.35 * width : shoulderY + 0.02, 0.95);
  return lm;
}

describe('pose measurement', () => {
  it('measures the shoulders-to-hands gap from the front', () => {
    const top = measure(frontPose(0), 'pushup');
    const bottom = measure(frontPose(1), 'pushup');
    expect(top.view).toBe('front');
    expect(top.valid).toBe(true);
    expect(top.plank).toBe(true);
    expect(top.depth!).toBeCloseTo(1.35, 1);
    expect(bottom.depth!).toBeCloseTo(0.25, 1);
  });
  it('is not fooled by moving or zooming the phone', () => {
    const a = measure(frontPose(0), 'pushup').depth!;
    const b = measure(frontPose(0, { shift: { x: 0.1, y: -0.2 }, zoom: 1.4 }), 'pushup').depth!;
    expect(b).toBeCloseTo(a, 5);
  });
  it('asks for the hands when they are out of sight', () => {
    const m = measure(frontPose(0, { noHands: true }), 'pushup');
    expect(m.valid).toBe(false);
    expect(m.hint).toBe('show-hands');
  });
  it('does not take a standing or sitting body for a plank', () => {
    expect(measure(frontPose(0, { upright: true }), 'pushup').plank).toBe(false);
  });
  it('keeps the side view for side-on push-ups', () => {
    const m = measure(pushupPose(170), 'pushup');
    expect(m.view).toBe('side');
    expect(m.plank).toBe(true);
  });
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

/** Feed keyframes, interpolated at ~20 fps like the camera, `msPerKey` apart. */
function play(c: RepCounter, pose: (v: number) => Landmark[], keys: number[], msPerKey = 400, t0 = 0) {
  let t = t0;
  let completed = 0;
  for (let i = 1; i < keys.length; i++) {
    const steps = Math.max(1, Math.round(msPerKey / 50));
    for (let s = 1; s <= steps; s++) {
      t += msPerKey / steps;
      const v = keys[i - 1] + ((keys[i] - keys[i - 1]) * s) / steps;
      if (c.update(pose(v), t).repCompleted) completed++;
    }
  }
  return { completed, t };
}

/** Front-view keyframes: get into position, then `n` push-ups down to `depth` (0..1). */
const frontSet = (n: number, depth = 1) => [0, 0, 0, ...Array.from({ length: n }, () => [depth, 0]).flat(), 0];

describe('RepCounter: push-ups, phone in front', () => {
  it('counts push-ups after getting into position', () => {
    const c = new RepCounter('pushup');
    play(c, (d) => frontPose(d), frontSet(5), 600);
    expect(c.reps).toBe(5);
  });

  it('counts fast push-ups with no pause at the top', () => {
    const c = new RepCounter('pushup');
    const keys = [0];
    for (let i = 0; i < 8; i++) keys.push(1, 0);
    play(c, (d) => frontPose(d), keys, 450);
    // The first rep or two may go to getting ready; the rest must count.
    expect(c.reps).toBeGreaterThanOrEqual(6);
  });

  it('counts while the wrists and elbows jitter', () => {
    const c = new RepCounter('pushup');
    play(c, (d) => frontPose(d, { noise: 0.015 }), frontSet(6), 600);
    expect(c.reps).toBe(6);
  });

  it('never counts while holding the top with jitter', () => {
    const c = new RepCounter('pushup');
    const keys = Array.from({ length: 80 }, (_, i) => (i % 2 ? 0 : 0.08));
    play(c, (d) => frontPose(d, { noise: 0.015 }), keys, 150);
    expect(c.reps).toBe(0);
  });

  it('does not count half push-ups', () => {
    const c = new RepCounter('pushup');
    play(c, (d) => frontPose(d), frontSet(5, 0.4), 600);
    expect(c.reps).toBe(0);
  });

  it('never counts while the phone is carried around', () => {
    const c = new RepCounter('pushup');
    let t = 0;
    for (let i = 0; i < 400; i++) {
      t += 50;
      // Walking: the picture sways and zooms; only face and shoulders are in view.
      const k = i / 10;
      c.update(frontPose(0.5 + 0.5 * Math.sin(k), { noHands: true, shift: { x: 0.05 * Math.sin(k * 1.3), y: 0.15 * Math.sin(k) }, zoom: 1 + 0.3 * Math.sin(k * 0.7) }), t);
    }
    expect(c.reps).toBe(0);
  });

  it('never counts when the phone moves while the person holds still', () => {
    const c = new RepCounter('pushup');
    let t = 0;
    for (let i = 0; i < 400; i++) {
      t += 50;
      const k = i / 8;
      c.update(frontPose(0, { shift: { x: 0.1 * Math.sin(k), y: 0.25 * Math.sin(k * 1.7) }, zoom: 1 + 0.35 * Math.sin(k * 0.9) }), t);
    }
    expect(c.reps).toBe(0);
  });

  it('never counts standing up and moving the arms', () => {
    const c = new RepCounter('pushup');
    const keys = [0, 0, 0];
    for (let i = 0; i < 8; i++) keys.push(1, 0);
    play(c, (l) => frontPose(0, { upright: true, lift: l }), keys, 600);
    expect(c.reps).toBe(0);
  });

  it('pauses when the phone gets bumped, then carries on after settling again', () => {
    const c = new RepCounter('pushup');
    const { t } = play(c, (d) => frontPose(d), frontSet(3), 600);
    expect(c.reps).toBe(3);
    // Bumped mid-rep: the whole picture jumps while the person is going down.
    const r = play(c, (d) => frontPose(d, { shift: { x: 0, y: d > 0.5 ? 0.3 : 0 } }), [0, 1, 0], 600, t);
    expect(c.reps).toBe(3);
    // Settled in the new place: counting starts again.
    play(c, (d) => frontPose(d, { shift: { x: 0, y: 0.3 } }), frontSet(2), 600, r.t);
    expect(c.reps).toBe(5);
  });

  it('counts when the start was higher than the reps (got into position from higher up)', () => {
    const c = new RepCounter('pushup');
    // Hold the start with the body higher than the real tops (gap 1.8 instead of 1.35).
    const high = (d: number) => {
      const lm = frontPose(0);
      for (const i of [0, 11, 12, 13, 14]) lm[i] = { ...lm[i], y: lm[i].y - 0.45 * 0.3 * d };
      return lm;
    };
    let { t } = play(c, high, [1, 1, 1, 1], 300);
    // Then reps that only come back up to the normal top.
    const keys = [0];
    for (let i = 0; i < 6; i++) keys.push(1, 0);
    play(c, (d) => frontPose(d), keys, 600, t);
    expect(c.reps).toBeGreaterThanOrEqual(5);
  });

  it('counts again after leaving the picture and coming back', () => {
    const c = new RepCounter('pushup');
    let { t } = play(c, (d) => frontPose(d), frontSet(2), 600);
    for (let i = 0; i < 60; i++) c.update(undefined, (t += 50));
    play(c, (d) => frontPose(d), frontSet(2), 600, t);
    expect(c.reps).toBe(4);
  });
});

describe('RepCounter: push-ups from the side, squats', () => {
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
    // Elbow only appears to bend to 125 degrees, never reaching the default bottom.
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
  it('only counts, in native Korean up to 20', () => {
    expect(repLine('basic', 3, 10)).toBe('셋');
    expect(repLine('drill', 5, 10)).toBe('다섯!');
    expect(repLine('pt', 7, 10)).toBe('일곱');
    expect(repLine('mom', 10, 10)).toBe('열');
    expect(repLine('basic', 25, 30)).toBe('스물다섯');
    expect(repLine('basic', 100, 0)).toBe('백');
    expect(repLine('basic', 137, 0)).toBe('백서른일곱');
    expect(repLine('basic', 201, 0)).toBe('201');
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

describe('usageBetween', () => {
  it('adds up locked-app usage for the days in range', async () => {
    const { usageBetween, emptyBank } = await import('../timebank');
    const bank = {
      ...emptyBank(),
      usage: { '2026-11-16': { screentime: 600 }, '2026-11-17': { screentime: 120, youtube: 60 }, '2026-11-24': { screentime: 999 } },
    };
    const mon = new Date(2026, 10, 16).getTime();
    const nextMon = new Date(2026, 10, 23).getTime();
    expect(usageBetween(bank, mon, nextMon)).toBe(780);
    expect(usageBetween(bank, 0, Infinity)).toBe(1779);
  });
});
