import type { ExerciseId } from './rates';

/** MediaPipe Pose landmark (normalized image coordinates). */
export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export type Phase = 'up' | 'down';
export type Side = 'left' | 'right';

export interface Measurement {
  /** Main joint angle: elbow (push-up) or knee (squat). */
  angle: number | null;
  /**
   * Secondary depth signal, ~1 at the top and smaller at the bottom:
   * vertical shoulder-to-wrist (push-up) or hip-to-ankle (squat) distance over limb length.
   * It still moves when the main angle is hard to see (e.g. camera in front).
   */
  depth: number | null;
  /** false when the body is visible but form is bad (e.g. sagging hips). */
  valid: boolean;
  /**
   * 'front': phone in front of the head (both shoulders wide apart on screen). The elbow
   * angle barely changes from there, so reps are counted from how far the shoulders drop.
   */
  view?: 'side' | 'front';
  hint: '' | 'show-arms' | 'show-legs' | 'straighten' | 'no-person';
}

export interface RepUpdate extends Measurement {
  phase: Phase;
  repCompleted: boolean;
  reps: number;
  /** 0 = bottom of the rep, 1 = top (smoothed, calibrated to this person). */
  progress: number | null;
}

/**
 * Starting range of the main angle (top = arms/legs straight, bottom = a good deep rep).
 * The counter widens/narrows this to the person within the first reps.
 */
export const DEFAULT_RANGE: Record<ExerciseId, { top: number; bottom: number }> = {
  pushup: { top: 160, bottom: 85 },
  squat: { top: 170, bottom: 95 },
};

/** Smallest range we accept, so standing still can never look like a rep. */
const MIN_ANGLE_RANGE = 50;
const MIN_DEPTH_RANGE = 0.25;

/**
 * Progress thresholds with hysteresis. A rep is a full cycle
 * up -> going down -> down -> going up -> up; pausing near a boundary can't double count.
 */
const ENTER_DESCENT = 0.75;
const REACH_BOTTOM = 0.3;
const LEAVE_BOTTOM = 0.42;
const REACH_TOP = 0.8;
const ABORT_TO_TOP = 0.88;

/** Minimum time between two counted reps. Blocks jitter. */
export const MIN_REP_MS = 450;
/** Forget the locked body side after this long without seeing it. */
const SIDE_LOST_MS = 1500;
const VIS = 0.5;

// MediaPipe Pose indices
const IDX: Record<Side, { shoulder: number; elbow: number; wrist: number; hip: number; knee: number; ankle: number }> = {
  left: { shoulder: 11, elbow: 13, wrist: 15, hip: 23, knee: 25, ankle: 27 },
  right: { shoulder: 12, elbow: 14, wrist: 16, hip: 24, knee: 26, ankle: 28 },
};

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
const dist = (a: Landmark, b: Landmark) => Math.hypot(a.x - b.x, a.y - b.y);

function joints(lm: Landmark[], side: Side) {
  const ix = IDX[side];
  return { s: lm[ix.shoulder], e: lm[ix.elbow], w: lm[ix.wrist], h: lm[ix.hip], k: lm[ix.knee], a: lm[ix.ankle] };
}

/** How well a side is visible for this exercise (0..3-ish). */
export function sideScore(lm: Landmark[], exercise: ExerciseId, side: Side): number {
  const d = joints(lm, side);
  return exercise === 'pushup' ? vis(d.s) + vis(d.e) + vis(d.w) : vis(d.h) + vis(d.k) + vis(d.a);
}

export function bestSide(lm: Landmark[], exercise: ExerciseId): Side {
  return sideScore(lm, exercise, 'left') >= sideScore(lm, exercise, 'right') ? 'left' : 'right';
}

export function measure(lm: Landmark[] | undefined, exercise: ExerciseId, side?: Side): Measurement {
  if (!lm || lm.length < 29) return { angle: null, depth: null, valid: false, hint: 'no-person' };
  const d = joints(lm, side ?? bestSide(lm, exercise));

  if (exercise === 'pushup') {
    const front = frontPushup(lm);
    if (front) return front;
    if (vis(d.s) < VIS || vis(d.e) < VIS || vis(d.w) < VIS) {
      return { angle: null, depth: null, valid: false, hint: 'show-arms' };
    }
    const angle = angleAt(d.s, d.e, d.w);
    const arm = dist(d.s, d.e) + dist(d.e, d.w);
    const depth = arm > 0 ? (d.w.y - d.s.y) / arm : null;
    const end = vis(d.a) > VIS ? d.a : d.k;
    if (vis(d.h) > VIS && vis(end) > VIS && angleAt(d.s, d.h, end) < 140) {
      return { angle, depth, valid: false, hint: 'straighten' };
    }
    return { angle, depth, valid: true, hint: '' };
  }

  if (vis(d.h) < VIS || vis(d.k) < VIS || vis(d.a) < VIS) {
    return { angle: null, depth: null, valid: false, hint: 'show-legs' };
  }
  const leg = dist(d.h, d.k) + dist(d.k, d.a);
  const depth = leg > 0 ? (d.a.y - d.h.y) / leg : null;
  return { angle: angleAt(d.h, d.k, d.a), depth, valid: true, hint: '' };
}

/** Shoulder width counts as "wide" (camera in front) at this fraction of the upper arm. */
const FRONT_SHOULDER_RATIO = 0.7;

/**
 * Push-up seen from in front of the head. Shoulder width is the ruler here: it stays the
 * same size on screen while the shoulders drop toward the hands. Depth is ~1 at the top and
 * ~0.2 at the bottom. Hips and feet are hidden behind the body from here, so the hip check
 * is skipped.
 */
function frontPushup(lm: Landmark[]): Measurement | null {
  const L = joints(lm, 'left');
  const R = joints(lm, 'right');
  if (vis(L.s) < VIS || vis(R.s) < VIS) return null;
  const width = dist(L.s, R.s);
  const upper = Math.max(vis(L.e) >= VIS ? dist(L.s, L.e) : 0, vis(R.e) >= VIS ? dist(R.s, R.e) : 0);
  if (upper === 0 || width < FRONT_SHOULDER_RATIO * upper) return null;
  const arms = [L, R].filter((a) => vis(a.e) >= VIS && vis(a.w) >= VIS);
  if (arms.length === 0) return { angle: null, depth: null, valid: false, hint: 'show-arms', view: 'front' };
  const angle = arms.reduce((n, a) => n + angleAt(a.s, a.e, a.w), 0) / arms.length;
  const drop = arms.reduce((n, a) => n + (a.w.y - a.s.y), 0) / arms.length;
  return { angle, depth: drop / (1.6 * width), valid: true, hint: '', view: 'front' };
}

/**
 * One Euro filter: smooths jitter when still, follows quickly when moving.
 * (Casiez et al. 2012). A few multiplications per frame.
 */
export class OneEuro {
  private x: number | null = null;
  private dx = 0;
  private t = 0;

  constructor(
    private minCutoff: number,
    private beta: number,
    private dCutoff = 1,
  ) {}

  reset(): void {
    this.x = null;
    this.dx = 0;
  }

  filter(value: number, tMs: number): number {
    if (this.x === null) {
      this.x = value;
      this.t = tMs;
      return value;
    }
    const dt = Math.max(1e-3, (tMs - this.t) / 1000);
    this.t = tMs;
    const alpha = (cutoff: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));
    const rawDx = (value - this.x) / dt;
    this.dx += alpha(this.dCutoff) * (rawDx - this.dx);
    const cutoff = this.minCutoff + this.beta * Math.abs(this.dx);
    this.x += alpha(cutoff) * (value - this.x);
    return this.x;
  }
}

/**
 * Tracks the top and bottom a person actually reaches, so thresholds fit their body and
 * camera angle. New extremes are adopted at once; otherwise the range eases toward the
 * extremes of the last few seconds, so a shallow camera view is learned within a few reps.
 * The bottom never drifts far above the deepest point already reached in this set.
 * The top (resting position) is the anchor: when the range is too small, the bottom moves.
 */
export class AdaptiveRange {
  top: number;
  bottom: number;
  private recent: { t: number; v: number }[] = [];
  /** Deepest value seen this set: once someone has shown a full rep, half reps stay half. */
  private floor = Infinity;

  constructor(
    private init: { top: number; bottom: number },
    private minRange: number,
    /** Fraction per second the extremes ease toward the recent window's extremes. */
    private rate = 0.6,
    private windowMs = 4000,
  ) {
    this.top = init.top;
    this.bottom = init.bottom;
  }

  reset(): void {
    this.top = this.init.top;
    this.bottom = this.init.bottom;
    this.recent = [];
    this.floor = Infinity;
  }

  update(v: number, tMs: number, dtSec: number): void {
    this.recent.push({ t: tMs, v });
    while (this.recent.length && this.recent[0].t < tMs - this.windowMs) this.recent.shift();
    let lo = v;
    let hi = v;
    for (const r of this.recent) {
      if (r.v < lo) lo = r.v;
      if (r.v > hi) hi = r.v;
    }
    // Only learn from real movement: holding still must not shrink the range.
    const moving = hi - lo >= this.minRange * 0.5;
    const k = moving ? Math.min(1, this.rate * dtSec) : 0;
    this.top = v > this.top ? v : this.top + (hi - this.top) * k;
    this.bottom = v < this.bottom ? v : this.bottom + (lo - this.bottom) * k;
    this.floor = Math.min(this.floor, v);
    this.bottom = Math.min(this.bottom, this.floor + (this.top - this.floor) * 0.2);
    if (this.top - this.bottom < this.minRange) this.bottom = this.top - this.minRange;
  }

  /** 0 at the bottom, 1 at the top. */
  progress(v: number): number {
    return Math.min(1, Math.max(0, (v - this.bottom) / (this.top - this.bottom)));
  }
}

type State = 'up' | 'goingDown' | 'down' | 'goingUp';

/**
 * Counts reps from a stream of pose frames.
 * Signal: smoothed joint angle (plus a depth signal once it shows a real range), mapped to
 * 0..1 progress against the person's own range, then a 4-state machine with hysteresis.
 */
export class RepCounter {
  private state: State = 'up';
  private lastRepAt = -Infinity;
  private count = 0;
  private side: Side | null = null;
  private sideSeenAt = -Infinity;
  private lastT: number | null = null;
  private angleFilter = new OneEuro(1.2, 0.02);
  private depthFilter = new OneEuro(1.2, 1.5);
  private angleRange: AdaptiveRange;
  private depthRange = new AdaptiveRange({ top: 1, bottom: 0.5 }, MIN_DEPTH_RANGE);
  private depthSpan = { min: Infinity, max: -Infinity };

  constructor(private exercise: ExerciseId) {
    this.angleRange = new AdaptiveRange(DEFAULT_RANGE[exercise], MIN_ANGLE_RANGE);
  }

  get reps(): number {
    return this.count;
  }

  setExercise(exercise: ExerciseId): void {
    this.exercise = exercise;
    this.angleRange = new AdaptiveRange(DEFAULT_RANGE[exercise], MIN_ANGLE_RANGE);
    this.reset();
  }

  reset(): void {
    this.state = 'up';
    this.lastRepAt = -Infinity;
    this.count = 0;
    this.resetTracking();
  }

  private resetTracking(): void {
    this.side = null;
    this.sideSeenAt = -Infinity;
    this.lastT = null;
    this.angleFilter.reset();
    this.depthFilter.reset();
    this.angleRange.reset();
    this.depthRange.reset();
    this.depthSpan = { min: Infinity, max: -Infinity };
  }

  /** Keep one body side for the whole set; only switch after it's been gone a while. */
  private pickSide(lm: Landmark[] | undefined, nowMs: number): Side | undefined {
    if (!lm || lm.length < 29) return this.side ?? undefined;
    const best = bestSide(lm, this.exercise);
    if (this.side === null) {
      this.side = best;
    } else if (best !== this.side && sideScore(lm, this.exercise, this.side) < 3 * VIS) {
      if (nowMs - this.sideSeenAt > SIDE_LOST_MS) {
        const keep = { count: this.count, state: this.state, lastRepAt: this.lastRepAt };
        this.resetTracking();
        Object.assign(this, keep);
        this.side = best;
      }
      return this.side;
    }
    this.sideSeenAt = nowMs;
    return this.side;
  }

  update(lm: Landmark[] | undefined, nowMs: number): RepUpdate {
    const side = this.pickSide(lm, nowMs);
    const m = measure(lm, this.exercise, side);
    const dt = this.lastT === null ? 0 : Math.max(0, (nowMs - this.lastT) / 1000);
    let repCompleted = false;
    let progress: number | null = null;

    if (m.angle !== null) {
      this.lastT = nowMs;
      const angle = this.angleFilter.filter(m.angle, nowMs);
      this.angleRange.update(angle, nowMs, dt);
      progress = this.angleRange.progress(angle);

      if (m.depth !== null) {
        const depth = this.depthFilter.filter(m.depth, nowMs);
        this.depthRange.update(depth, nowMs, dt);
        this.depthSpan.min = Math.min(this.depthSpan.min, depth);
        this.depthSpan.max = Math.max(this.depthSpan.max, depth);
        if (m.view === 'front') {
          // From the front the elbow angle hardly moves: count on the shoulder drop alone.
          progress = this.depthRange.progress(depth);
        } else if (this.depthSpan.max - this.depthSpan.min >= MIN_DEPTH_RANGE) {
          // Only trust depth once it has actually moved like a rep; then average both signals.
          progress = (progress + this.depthRange.progress(depth)) / 2;
        }
      }
    }

    if (progress !== null && m.valid) {
      switch (this.state) {
        case 'up':
          if (progress < ENTER_DESCENT) this.state = 'goingDown';
          break;
        case 'goingDown':
          if (progress < REACH_BOTTOM) this.state = 'down';
          else if (progress > ABORT_TO_TOP) this.state = 'up'; // half rep: no count
          break;
        case 'down':
          if (progress > LEAVE_BOTTOM) this.state = 'goingUp';
          break;
        case 'goingUp':
          if (progress < REACH_BOTTOM) this.state = 'down';
          else if (progress > REACH_TOP) {
            this.state = 'up';
            if (nowMs - this.lastRepAt >= MIN_REP_MS) {
              this.lastRepAt = nowMs;
              this.count++;
              repCompleted = true;
            }
          }
          break;
      }
    }

    const phase: Phase = this.state === 'down' || this.state === 'goingUp' ? 'down' : 'up';
    return { ...m, phase, progress, repCompleted, reps: this.count };
  }
}

export const HINT_TEXT: Record<Measurement['hint'], string> = {
  '': '',
  'show-arms': '어깨부터 손목까지 화면에 보이게 해주세요',
  'show-legs': '엉덩이부터 발목까지 보이게 물러나 주세요',
  straighten: '허리를 펴고 몸을 일직선으로',
  'no-person': '사람이 안 보여요. 화면에서 조금 떨어져 주세요',
};
