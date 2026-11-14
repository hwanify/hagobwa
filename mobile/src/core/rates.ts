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

/** Seconds of screen time one rep buys at "normal" difficulty. */
export const BASE_SECONDS_PER_REP: Record<ExerciseId, number> = {
  pushup: 60,
  squat: 30,
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

export function secondsPerRep(exercise: ExerciseId, difficulty: Difficulty): number {
  return Math.round(BASE_SECONDS_PER_REP[exercise] * difficultyMult(difficulty));
}

export function earnedSeconds(exercise: ExerciseId, reps: number, difficulty: Difficulty): number {
  if (!Number.isFinite(reps) || reps <= 0) return 0;
  return Math.floor(reps) * secondsPerRep(exercise, difficulty);
}

/** Reps needed to buy at least `seconds` of screen time. */
export function repsNeeded(seconds: number, exercise: ExerciseId, difficulty: Difficulty): number {
  if (seconds <= 0) return 0;
  return Math.ceil(seconds / secondsPerRep(exercise, difficulty));
}

export function stepsSeconds(steps: number, difficulty: Difficulty): number {
  if (!Number.isFinite(steps) || steps <= 0) return 0;
  return Math.floor((Math.floor(steps / 1000) * SECONDS_PER_1000_STEPS) * difficultyMult(difficulty));
}
