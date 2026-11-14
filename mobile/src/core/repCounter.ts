import type { ExerciseId } from './rates';

/** MediaPipe Pose landmark (normalized image coordinates). */
export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export type Phase = 'up' | 'down';

export interface Measurement {
  angle: number | null;
  /** false when the body is visible but form is bad (e.g. sagging hips). */
  valid: boolean;
  hint: '' | 'show-arms' | 'show-legs' | 'straighten' | 'no-person';
}

export interface RepUpdate extends Measurement {
  phase: Phase;
  repCompleted: boolean;
  reps: number;
}

export const THRESHOLDS: Record<ExerciseId, { down: number; up: number }> = {
  pushup: { down: 95, up: 150 },
  squat: { down: 100, up: 160 },
};

/** Minimum time between two counted reps. Blocks jitter and half-reps. */
export const MIN_REP_MS = 450;
const VIS = 0.5;

// MediaPipe Pose indices
const L = { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 };
const R = { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 };

export function angleAt(a: Landmark, b: Landmark, c: Landmark): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (mag === 0) return 180;
  const cos = Math.min(1, Math.max(-1, (abx * cbx + aby * cby) / mag));
  return (Math.acos(cos) * 180) / Math.PI;
}

const vis = (p?: Landmark) => p?.visibility ?? 0;

export function measure(lm: Landmark[] | undefined, exercise: ExerciseId): Measurement {
  if (!lm || lm.length < 29) return { angle: null, valid: false, hint: 'no-person' };
  const side = (ix: typeof L) => ({
    s: lm[ix.shoulder], e: lm[ix.elbow], w: lm[ix.wrist], h: lm[ix.hip], k: lm[ix.knee], a: lm[ix.ankle],
  });
  const left = side(L);
  const right = side(R);
  const score = (d: ReturnType<typeof side>) =>
    exercise === 'pushup' ? vis(d.s) + vis(d.e) + vis(d.w) + vis(d.h) : vis(d.h) + vis(d.k) + vis(d.a);
  const d = score(left) >= score(right) ? left : right;

  if (exercise === 'pushup') {
    if (vis(d.s) < VIS || vis(d.e) < VIS || vis(d.w) < VIS) {
      return { angle: null, valid: false, hint: 'show-arms' };
    }
    const angle = angleAt(d.s, d.e, d.w);
    const end = vis(d.a) > VIS ? d.a : d.k;
    if (vis(d.h) > VIS && vis(end) > VIS && angleAt(d.s, d.h, end) < 140) {
      return { angle, valid: false, hint: 'straighten' };
    }
    return { angle, valid: true, hint: '' };
  }

  if (vis(d.h) < VIS || vis(d.k) < VIS || vis(d.a) < VIS) {
    return { angle: null, valid: false, hint: 'show-legs' };
  }
  return { angle: angleAt(d.h, d.k, d.a), valid: true, hint: '' };
}

/**
 * Counts reps from a stream of pose frames.
 * A rep = valid "down" (joint angle below threshold) followed by a valid "up".
 */
export class RepCounter {
  private phase: Phase = 'up';
  private lastRepAt = -Infinity;
  private count = 0;

  constructor(private exercise: ExerciseId) {}

  get reps(): number {
    return this.count;
  }

  setExercise(exercise: ExerciseId): void {
    this.exercise = exercise;
    this.reset();
  }

  reset(): void {
    this.phase = 'up';
    this.lastRepAt = -Infinity;
    this.count = 0;
  }

  update(lm: Landmark[] | undefined, nowMs: number): RepUpdate {
    const m = measure(lm, this.exercise);
    let repCompleted = false;
    if (m.angle !== null && m.valid) {
      const t = THRESHOLDS[this.exercise];
      if (this.phase === 'up' && m.angle < t.down) {
        this.phase = 'down';
      } else if (this.phase === 'down' && m.angle > t.up && nowMs - this.lastRepAt >= MIN_REP_MS) {
        this.phase = 'up';
        this.lastRepAt = nowMs;
        this.count++;
        repCompleted = true;
      }
    }
    return { ...m, phase: this.phase, repCompleted, reps: this.count };
  }
}

export const HINT_TEXT: Record<Measurement['hint'], string> = {
  '': '',
  'show-arms': '어깨부터 손목까지 화면에 보이게 해주세요',
  'show-legs': '엉덩이부터 발목까지 보이게 물러나 주세요',
  straighten: '허리를 펴고 몸을 일직선으로',
  'no-person': '사람이 안 보여요. 화면에서 조금 떨어져 주세요',
};
