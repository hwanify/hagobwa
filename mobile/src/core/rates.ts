export type ExerciseId = 'pushup' | 'squat';
export type Difficulty = 'easy' | 'normal' | 'hard';

export const EXERCISES: { id: ExerciseId; label: string }[] = [
  { id: 'pushup', label: '푸시업' },
  { id: 'squat', label: '스쿼트' },
];

export const EXERCISE_LABEL: Record<ExerciseId, string> = {
  pushup: '푸시업',
  squat: '스쿼트',
};

/**
 * Screen time is only ever earned in whole minutes (iOS reports usage per minute anyway):
 * `reps` of an exercise buy `minutes`. Leftover reps in a workout that don't complete a
 * group earn nothing.
 */
export const RATES: Record<ExerciseId, Record<Difficulty, { reps: number; minutes: number }>> = {
  pushup: { easy: { reps: 1, minutes: 2 }, normal: { reps: 1, minutes: 1 }, hard: { reps: 2, minutes: 1 } },
  squat: { easy: { reps: 1, minutes: 1 }, normal: { reps: 2, minutes: 1 }, hard: { reps: 4, minutes: 1 } },
};

/** Seconds of screen time 1,000 steps buy at "normal" difficulty. */
export const SECONDS_PER_1000_STEPS = 300;

export const DIFFICULTIES: { id: Difficulty; label: string; mult: number }[] = [
  { id: 'easy', label: '쉬움', mult: 1.5 },
  { id: 'normal', label: '보통', mult: 1 },
  { id: 'hard', label: '빡셈', mult: 0.5 },
];

export function difficultyMult(d: Difficulty): number {
  return DIFFICULTIES.find((x) => x.id === d)?.mult ?? 1;
}

/** "1회 = 1분", "2회 = 1분", "1회 = 2분" */
export function rateLabel(exercise: ExerciseId, difficulty: Difficulty): string {
  const r = RATES[exercise][difficulty];
  return `${r.reps}회 = ${r.minutes}분`;
}

export function earnedSeconds(exercise: ExerciseId, reps: number, difficulty: Difficulty): number {
  if (!Number.isFinite(reps) || reps <= 0) return 0;
  const r = RATES[exercise][difficulty];
  return Math.floor(Math.floor(reps) / r.reps) * r.minutes * 60;
}

/** Reps needed to buy at least `seconds` of screen time. */
export function repsNeeded(seconds: number, exercise: ExerciseId, difficulty: Difficulty): number {
  if (seconds <= 0) return 0;
  const r = RATES[exercise][difficulty];
  return Math.ceil(seconds / 60 / r.minutes) * r.reps;
}

export function stepsSeconds(steps: number, difficulty: Difficulty): number {
  if (!Number.isFinite(steps) || steps <= 0) return 0;
  return Math.floor((Math.floor(steps / 1000) * SECONDS_PER_1000_STEPS) * difficultyMult(difficulty));
}
