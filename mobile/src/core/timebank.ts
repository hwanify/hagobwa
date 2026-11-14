import { addDays, dayKey, startOfDay, startOfWeek } from './dates';
import { earnedSeconds, type Difficulty, type ExerciseId } from './rates';

export const EMERGENCY_PER_DAY = 1;
export const EMERGENCY_GRANT_SEC = 5 * 60;
export const EMERGENCY_WAIT_SEC = 30;
/** Keep this many days of workout history. */
export const HISTORY_DAYS = 120;

export interface WorkoutRecord {
  id: string;
  at: number;
  exercise: ExerciseId;
  reps: number;
  earnedSec: number;
}

export interface ActiveSession {
  appId: string;
  startedAt: number;
  lastTickAt: number;
}

export interface BankState {
  balanceSec: number;
  workouts: WorkoutRecord[];
  /** Seconds used per day per app: usage["2026-11-14"]["youtube"] = 600 */
  usage: Record<string, Record<string, number>>;
  emergency: { day: string; used: number };
  session: ActiveSession | null;
}

export function emptyBank(): BankState {
  return { balanceSec: 0, workouts: [], usage: {}, emergency: { day: '', used: 0 }, session: null };
}

export class BankError extends Error {
  constructor(
    public code: 'NO_BALANCE' | 'EMERGENCY_USED' | 'NO_REPS' | 'SESSION_ACTIVE',
    message: string,
  ) {
    super(message);
  }
}

/** Upper bound on stored balance: the user's daily goal. */
export function capFor(goalHours: number): number {
  return Math.max(1, goalHours) * 3600;
}

export function creditWorkout(
  state: BankState,
  input: { exercise: ExerciseId; reps: number; difficulty: Difficulty; now: number; capSec: number; id?: string },
): { state: BankState; earnedSec: number; record: WorkoutRecord } {
  const reps = Math.floor(input.reps);
  if (reps <= 0) throw new BankError('NO_REPS', '운동 횟수가 없어요.');
  const raw = earnedSeconds(input.exercise, reps, input.difficulty);
  const balanceSec = Math.min(input.capSec, state.balanceSec + raw);
  const earnedSec = balanceSec - state.balanceSec;
  const record: WorkoutRecord = {
    id: input.id ?? `${input.now}-${Math.random().toString(36).slice(2, 8)}`,
    at: input.now,
    exercise: input.exercise,
    reps,
    earnedSec: raw,
  };
  const cutoff = addDays(startOfDay(input.now), -HISTORY_DAYS);
  const workouts = [...state.workouts.filter((w) => w.at >= cutoff), record];
  return { state: { ...state, balanceSec, workouts }, earnedSec, record };
}

function addUsage(usage: BankState['usage'], appId: string, at: number, seconds: number): BankState['usage'] {
  if (seconds <= 0) return usage;
  const day = dayKey(at);
  const prevDay = usage[day] ?? {};
  return { ...usage, [day]: { ...prevDay, [appId]: (prevDay[appId] ?? 0) + seconds } };
}

export function startSession(state: BankState, appId: string, now: number): BankState {
  if (state.balanceSec <= 0) throw new BankError('NO_BALANCE', '남은 시간이 없어요.');
  if (state.session && state.session.appId !== appId) {
    state = tick(state, now).state;
  }
  return { ...state, session: { appId, startedAt: now, lastTickAt: now } };
}

/**
 * Charge elapsed session time against the balance.
 * Returns exhausted=true (and ends the session) when the balance hits zero.
 */
export function tick(state: BankState, now: number): { state: BankState; exhausted: boolean } {
  const s = state.session;
  if (!s) return { state, exhausted: false };
  const elapsed = Math.max(0, Math.floor((now - s.lastTickAt) / 1000));
  if (elapsed === 0) return { state, exhausted: false };
  const charged = Math.min(elapsed, state.balanceSec);
  const balanceSec = state.balanceSec - charged;
  const usage = addUsage(state.usage, s.appId, now, charged);
  const exhausted = balanceSec <= 0;
  return {
    state: {
      ...state,
      balanceSec,
      usage,
      session: exhausted ? null : { ...s, lastTickAt: s.lastTickAt + elapsed * 1000 },
    },
    exhausted,
  };
}

export function endSession(state: BankState, now: number): BankState {
  const { state: ticked } = tick(state, now);
  return { ...ticked, session: null };
}

export function emergencyLeft(state: BankState, now: number): number {
  const used = state.emergency.day === dayKey(now) ? state.emergency.used : 0;
  return Math.max(0, EMERGENCY_PER_DAY - used);
}

export function applyEmergency(state: BankState, now: number): BankState {
  if (emergencyLeft(state, now) <= 0) {
    throw new BankError('EMERGENCY_USED', '오늘 비상 해제를 다 썼어요.');
  }
  const day = dayKey(now);
  const used = state.emergency.day === day ? state.emergency.used + 1 : 1;
  return { ...state, balanceSec: state.balanceSec + EMERGENCY_GRANT_SEC, emergency: { day, used } };
}

/* ---------- read models ---------- */

export function repsBetween(state: BankState, from: number, to: number): number {
  return state.workouts.filter((w) => w.at >= from && w.at < to).reduce((n, w) => n + w.reps, 0);
}

export function todayReps(state: BankState, now: number): number {
  const s = startOfDay(now);
  return repsBetween(state, s, addDays(s, 1));
}

export function weekReps(state: BankState, now: number): number {
  const s = startOfWeek(now);
  return repsBetween(state, s, addDays(s, 7));
}

export function weekEarnedSec(state: BankState, now: number): number {
  const s = startOfWeek(now);
  const e = addDays(s, 7);
  return state.workouts.filter((w) => w.at >= s && w.at < e).reduce((n, w) => n + w.earnedSec, 0);
}

/** Reps for Mon..Sun of the current week. */
export function weekSeries(state: BankState, now: number): number[] {
  const s = startOfWeek(now);
  return Array.from({ length: 7 }, (_, i) => repsBetween(state, addDays(s, i), addDays(s, i + 1)));
}

export function usageOnDay(state: BankState, ms: number): number {
  const day = state.usage[dayKey(ms)] ?? {};
  return Object.values(day).reduce((a, b) => a + b, 0);
}

export function weekUsageSec(state: BankState, weekStartMs: number): number {
  let total = 0;
  for (let i = 0; i < 7; i++) total += usageOnDay(state, addDays(weekStartMs, i));
  return total;
}

/**
 * Consecutive days with at least one rep, ending today.
 * If today has no reps yet the streak still counts through yesterday.
 */
export function streakDays(state: BankState, now: number): number {
  const days = new Set(state.workouts.filter((w) => w.reps > 0).map((w) => dayKey(w.at)));
  let cursor = startOfDay(now);
  if (!days.has(dayKey(cursor))) cursor = addDays(cursor, -1);
  let n = 0;
  while (days.has(dayKey(cursor))) {
    n++;
    cursor = addDays(cursor, -1);
  }
  return n;
}
