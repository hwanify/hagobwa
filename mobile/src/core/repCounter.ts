import type { ExerciseId } from './rates';

/**
 * Pose landmark. The camera pages send x and y in the same unit (both divided by the frame
 * width), so distances and angles aren't skewed by the 3:4 frame.
 */
export interface Landmark {
  x: number;
  y: number;
  z?: number;
  visibility?: number;
}

export interface Point {
  x: number;
  y: number;
}

export type Phase = 'up' | 'down';
export type Side = 'left' | 'right';
export type Hint = '' | 'show-arms' | 'show-hands' | 'show-head' | 'show-legs' | 'straighten' | 'no-person' | 'get-ready';

export interface Measurement {
  /** Main joint angle: elbow (push-up) or knee (squat). */
  angle: number | null;
  /**
   * Depth signal, large at the top and small at the bottom.
   * Push-up: how far the hands are below the shoulders, over shoulder width (front) or arm length (side).
   * Squat: hip-to-ankle height over leg length.
   */
  depth: number | null;
  /** false when the body isn't measurable or the form is bad (e.g. sagging hips). */
  valid: boolean;
  /** Push-up camera position: 'front' = phone standing in front of the head, 'side' = beside the body. */
  view?: 'side' | 'front';
  hint: Hint;
  /** Push-up: body size on screen (shoulder width from the front, arm length from the side). */
  scale?: number;
  /** Push-up: the wrists (planted hands) per visible side. */
  hands?: Partial<Record<Side, Point>>;
  /** Push-up: looks like a plank (hands on the floor below the shoulders, body not upright). */
  plank?: boolean;
  /** Push-up from the front: each visible arm's shoulders-to-hand gap (x shoulder width). */
  gaps?: Partial<Record<Side, number>>;
}

export interface RepUpdate extends Measurement {
  phase: Phase;
  repCompleted: boolean;
  reps: number;
  /** 0 = bottom of the rep, 1 = top. */
  progress: number | null;
  /** Push-up: a set is running (got into position, hands still planted). Squats are always ready. */
  ready: boolean;
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
/** A state change must hold for this many frames in a row (~0.1 s), so one bad frame can't count. */
const CONFIRM_FRAMES = 2;

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
/** Hands need a clearer view: they are what keeps the count honest. */
const HAND_VIS = 0.6;

// Push-up set rules
/** Hands planted and still in a plank this long before counting starts. */
const READY_MS = 400;
/** While getting ready the hands may wobble this much (x body scale). */
const HOLD_HANDS_TOL = 0.15;
/** Once counting, hands moving farther than this (x body scale) means the phone or the person moved: pause. */
const PLANTED_TOL: Record<'front' | 'side', number> = { front: 0.5, side: 0.4 };
/** Out of sight this long ends the set (it restarts by getting into position again). */
const LOST_MS = 1500;
/**
 * Front view: hands at least this far below the shoulders (x shoulder width) = arms straight.
 * A real push-up from a phone on the floor goes from ~1.2-1.5 at the top to ~0.15-0.3 at the bottom.
 */
const FRONT_EXTENDED = 0.85;
/**
 * Front view progress is the hands-to-shoulders gap as a fraction of the top gap.
 * The bottom counts below 55% of the top (a half push-up stays around 70%),
 * the top counts again above 80%.
 */
const frontProgress = (frac: number) => Math.min(1, Math.max(0, 2 * frac - 0.8));

// MediaPipe Pose indices
const NOSE = 0;
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
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

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

  if (exercise === 'pushup') {
    const front = frontPushup(lm);
    if (front) return front;
    const m = sidePushup(lm, side ?? bestSide(lm, exercise));
    // Shoulders at/above the top edge: the phone is too close or tilted down. Say so, but keep
    // whatever could still be measured.
    if (lm[11].y < 0.03 || lm[12].y < 0.03) return { ...m, hint: 'show-head' };
    return m;
  }

  const d = joints(lm, side ?? bestSide(lm, exercise));
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
 * Push-up with the phone standing on the floor in front of the head, facing the person.
 *
 * The hands stay planted while the shoulders come down to them, so the count is the vertical
 * gap from shoulders to wrists over shoulder width. Moving or zooming the phone moves both
 * the same way, so it can't fake a rep (and moving hands pause the set, see RepCounter).
 * No wrists in sight = no count: guessed arms jitter.
 */
function frontPushup(lm: Landmark[]): Measurement | null {
  const L = joints(lm, 'left');
  const R = joints(lm, 'right');
  if (vis(L.s) < VIS || vis(R.s) < VIS) return null;
  const width = dist(L.s, R.s);
  if (width <= 0) return null;
  const lo = Math.min(L.s.x, R.s.x);
  const hi = Math.max(L.s.x, R.s.x);
  const inset = 0.15 * (hi - lo);
  const nose = lm[NOSE];
  const upper = Math.max(vis(L.e) >= VIS ? dist(L.s, L.e) : 0, vis(R.e) >= VIS ? dist(R.s, R.e) : 0);
  // Face between the shoulders = facing the camera; or shoulders wide next to the upper arm.
  const faceOn = vis(nose) >= VIS && nose.x > lo + inset && nose.x < hi - inset && (upper === 0 || width >= 0.45 * upper);
  const wide = upper > 0 && width >= FRONT_SHOULDER_RATIO * upper;
  if (!faceOn && !wide) return null;

  const arms = (['left', 'right'] as const).map((side) => [side, side === 'left' ? L : R] as const).filter(([, a]) => vis(a.w) >= HAND_VIS);
  if (arms.length === 0) {
    const cut = L.s.y < 0.03 || R.s.y < 0.03;
    return { angle: null, depth: null, valid: false, hint: cut ? 'show-head' : 'show-hands', view: 'front', scale: width };
  }
  const hands: Partial<Record<Side, Point>> = {};
  const gaps: Partial<Record<Side, number>> = {};
  let gap = 0;
  let angle = 0;
  let angles = 0;
  for (const [side, a] of arms) {
    hands[side] = { x: a.w.x, y: a.w.y };
    gap += a.w.y - a.s.y;
    gaps[side] = (a.w.y - a.s.y) / width;
    if (vis(a.e) >= VIS) {
      angle += angleAt(a.s, a.e, a.w);
      angles++;
    }
  }
  const depth = gap / arms.length / width;
  // Hands far above the shoulders or miles below: a broken frame, not a body.
  if (depth < -0.5 || depth > 3) return { angle: null, depth: null, valid: false, hint: '', view: 'front', scale: width };
  const shoulderY = (L.s.y + R.s.y) / 2;
  // Plank: both hands on the floor (level) below the shoulders, and the head not above the
  // shoulders like when standing or sitting. Looking down (nose hidden) is fine.
  const plank =
    arms.length === 2 &&
    Math.abs(L.w.y - R.w.y) <= 0.35 * width &&
    depth >= 0.4 &&
    (vis(nose) < VIS || nose.y > shoulderY - 0.3 * width);
  return { angle: angles ? angle / angles : null, depth, valid: true, hint: '', view: 'front', scale: width, hands, plank, gaps };
}

/** Push-up filmed from the side: elbow angle plus how far the hand is below the shoulder. */
function sidePushup(lm: Landmark[], side: Side): Measurement {
  const d = joints(lm, side);
  if (vis(d.s) < VIS || vis(d.e) < VIS || vis(d.w) < VIS) {
    return { angle: null, depth: null, valid: false, hint: 'show-arms', view: 'side' };
  }
  const angle = angleAt(d.s, d.e, d.w);
  const arm = dist(d.s, d.e) + dist(d.e, d.w);
  const depth = arm > 0 ? (d.w.y - d.s.y) / arm : null;
  const base = { angle, depth, view: 'side' as const, scale: arm, hands: { [side]: { x: d.w.x, y: d.w.y } } };
  const end = vis(d.a) > VIS ? d.a : d.k;
  if (vis(d.h) > VIS && vis(end) > VIS && angleAt(d.s, d.h, end) < 140) {
    return { ...base, valid: false, hint: 'straighten' };
  }
  // Plank: hand below the shoulder, and the torso closer to flat than upright (if the hip shows).
  const flat = vis(d.h) <= VIS || Math.abs(d.h.y - d.s.y) <= 0.7 * Math.abs(d.h.x - d.s.x);
  const plank = depth !== null && depth >= 0.3 && flat;
  return { ...base, valid: true, hint: '', plank };
}

/** Largest move of a hand seen in both, or Infinity if no hand is shared. */
function handsMoved(a: Partial<Record<Side, Point>>, b: Partial<Record<Side, Point>>): number {
  let moved = -1;
  for (const side of ['left', 'right'] as const) {
    const p = a[side];
    const q = b[side];
    if (p && q) moved = Math.max(moved, dist(p, q));
  }
  return moved < 0 ? Infinity : moved;
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

/** Where the 4-state machine wants to go for this progress (hysteresis between thresholds). */
function nextState(state: State, progress: number): State {
  switch (state) {
    case 'up':
      return progress < ENTER_DESCENT ? 'goingDown' : 'up';
    case 'goingDown':
      if (progress < REACH_BOTTOM) return 'down';
      return progress > ABORT_TO_TOP ? 'up' : 'goingDown'; // half rep: back up without a count
    case 'down':
      return progress > LEAVE_BOTTOM ? 'goingUp' : 'down';
    case 'goingUp':
      if (progress < REACH_BOTTOM) return 'down';
      return progress > REACH_TOP ? 'up' : 'goingUp';
  }
}

interface Hold {
  start: number;
  hands: Partial<Record<Side, Point>>;
  /** Recent gaps while holding (front view): a high percentile becomes the top of the set. */
  vals: { t: number; v: number }[];
  view: 'front' | 'side';
  /** Frames in a row that broke the hold (not a plank / hands moved); a few are forgiven. */
  misses: number;
}

/** Median of the last 3 values: drops single-frame spikes before smoothing. */
class Median3 {
  private v: number[] = [];
  reset(): void {
    this.v = [];
  }
  push(x: number): number {
    this.v.push(x);
    if (this.v.length > 3) this.v.shift();
    if (this.v.length < 3) return x;
    const [a, b, c] = this.v;
    return Math.max(Math.min(a, b), Math.min(Math.max(a, b), c));
  }
}

/** A hold survives this many bad frames in a row (one dropped or glitchy frame shouldn't restart it). */
const HOLD_MISSES = 3;
/** The set pauses when the hands are off their spot in this many of the last DRIFT_WINDOW frames. */
const DRIFT_FRAMES = 4;
const DRIFT_WINDOW = 6;
/**
 * The camera view (front/side) must read differently this many frames in a row (~1.5 s) to
 * end a set. Shorter flips happen when a shoulder pokes out of the picture at the top of a rep.
 */
const VIEW_CHANGE_FRAMES = 27;
/** Through dropouts this short the last reading holds, so a rep that just reached the top still counts. */
const HOLD_GAP_MS = 300;

/**
 * Counts reps from a stream of pose frames.
 *
 * Push-ups run in sets: counting starts once the person is in a plank with the hands planted
 * and still (READY_MS), and pauses when the hands move in the picture (phone moved, person got
 * up) or the body is out of sight for LOST_MS. Carrying the phone around therefore never counts.
 * Front view: the shoulders-to-hands gap as a fraction of the gap at the top.
 * Side view: elbow angle (plus depth once it shows a real range) against the person's own range.
 * Squats: knee angle against the person's own range, always counting.
 * Then a 4-state machine with hysteresis; each change must hold for CONFIRM_FRAMES frames.
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
  private gapFilter = new OneEuro(1.5, 2);
  private gapMedian = new Median3();
  /** Spike-free copies of the angle and depth for learning the range (progress uses the unclipped values). */
  private angleMedian = new Median3();
  private depthMedian = new Median3();
  /** Left minus right gap while both hands show, to keep the gap steady when one drops out. */
  private gapSkew = 0;
  private angleRange: AdaptiveRange;
  private depthRange = new AdaptiveRange({ top: 1, bottom: 0.5 }, MIN_DEPTH_RANGE);
  private depthSpan = { min: Infinity, max: -Infinity };
  private pending: State | null = null;
  private pendingFrames = 0;
  // push-up set
  private ready = false;
  private hold: Hold | null = null;
  private setView: 'front' | 'side' = 'front';
  private anchor: Partial<Record<Side, Point>> = {};
  private anchorScale = 1;
  private top = 1;
  private topCap = 1;
  private lostSince: number | null = null;
  private drift: boolean[] = [];
  private viewMisses = 0;
  private lastProgress: number | null = null;
  private lastUsableAt = -Infinity;

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
    this.lastRepAt = -Infinity;
    this.count = 0;
    this.resetTracking();
  }

  private resetTracking(): void {
    this.state = 'up';
    this.side = null;
    this.sideSeenAt = -Infinity;
    this.lastT = null;
    this.angleFilter.reset();
    this.depthFilter.reset();
    this.gapFilter.reset();
    this.gapMedian.reset();
    this.angleMedian.reset();
    this.depthMedian.reset();
    this.gapSkew = 0;
    this.angleRange.reset();
    this.depthRange.reset();
    this.depthSpan = { min: Infinity, max: -Infinity };
    this.pending = null;
    this.pendingFrames = 0;
    this.ready = false;
    this.hold = null;
    this.lostSince = null;
    this.drift = [];
    this.viewMisses = 0;
    this.lastProgress = null;
    this.lastUsableAt = -Infinity;
  }

  /** Stop counting until the person gets into position again. Keeps the count. */
  private endSet(): void {
    const keep = { count: this.count, lastRepAt: this.lastRepAt, side: this.side, sideSeenAt: this.sideSeenAt };
    this.resetTracking();
    Object.assign(this, keep);
  }

  /** Keep one body side for the whole set; only switch after it's been gone a while. */
  private pickSide(lm: Landmark[] | undefined, nowMs: number): Side | undefined {
    if (!lm || lm.length < 29) return this.side ?? undefined;
    const best = bestSide(lm, this.exercise);
    if (this.side === null) {
      this.side = best;
    } else if (best !== this.side && sideScore(lm, this.exercise, this.side) < 3 * VIS) {
      if (nowMs - this.sideSeenAt > SIDE_LOST_MS) {
        // From the front both arms count, so the side only matters for side-view sets.
        if (this.exercise !== 'pushup' || this.setView === 'side') this.endSet();
        this.side = best;
      }
      return this.side;
    }
    this.sideSeenAt = nowMs;
    return this.side;
  }

  update(lm: Landmark[] | undefined, nowMs: number): RepUpdate {
    return this.exercise === 'pushup' ? this.updatePushup(lm, nowMs) : this.updateSquat(lm, nowMs);
  }

  /** Feed one progress value through the state machine; true when a rep just completed. */
  private step(progress: number, nowMs: number): boolean {
    const next = nextState(this.state, progress);
    if (next === this.state) {
      this.pending = null;
      this.pendingFrames = 0;
      return false;
    }
    this.pendingFrames = next === this.pending ? this.pendingFrames + 1 : 1;
    this.pending = next;
    if (this.pendingFrames < CONFIRM_FRAMES) return false;
    const from = this.state;
    this.state = next;
    this.pending = null;
    this.pendingFrames = 0;
    if (from === 'goingUp' && next === 'up' && nowMs - this.lastRepAt >= MIN_REP_MS) {
      this.lastRepAt = nowMs;
      this.count++;
      return true;
    }
    return false;
  }

  private phase(): Phase {
    return this.state === 'down' || this.state === 'goingUp' ? 'down' : 'up';
  }

  /** Side-view progress from the elbow angle (and depth once it moves like a rep). */
  private angleProgress(m: Measurement, nowMs: number, dt: number): number | null {
    if (m.angle === null) return null;
    const angle = this.angleFilter.filter(m.angle, nowMs);
    // One wild frame must not become the new bottom/top of the range.
    this.angleRange.update(this.angleMedian.push(angle), nowMs, dt);
    let progress = this.angleRange.progress(angle);
    if (m.depth !== null) {
      const depth = this.depthFilter.filter(m.depth, nowMs);
      const steady = this.depthMedian.push(depth);
      this.depthRange.update(steady, nowMs, dt);
      this.depthSpan.min = Math.min(this.depthSpan.min, steady);
      this.depthSpan.max = Math.max(this.depthSpan.max, steady);
      // Only trust depth once it has actually moved like a rep; then average both signals.
      if (this.depthSpan.max - this.depthSpan.min >= MIN_DEPTH_RANGE) {
        progress = (progress + this.depthRange.progress(depth)) / 2;
      }
    }
    return progress;
  }

  /** Front-view gap from both arms, or from one arm corrected by the usual left-right difference. */
  private frontGap(m: Measurement): number {
    const l = m.gaps?.left;
    const r = m.gaps?.right;
    if (l !== undefined && r !== undefined) {
      this.gapSkew += (l - r - this.gapSkew) * 0.2;
      return (l + r) / 2;
    }
    if (l !== undefined) return l - this.gapSkew / 2;
    if (r !== undefined) return r + this.gapSkew / 2;
    return m.depth ?? 0;
  }

  private updatePushup(lm: Landmark[] | undefined, nowMs: number): RepUpdate {
    const m = measure(lm, 'pushup', this.pickSide(lm, nowMs));
    const out = (progress: number | null, repCompleted: boolean, hint = m.hint): RepUpdate => ({
      ...m,
      hint,
      phase: this.phase(),
      progress,
      repCompleted,
      reps: this.count,
      ready: this.ready,
    });

    let usable = m.valid && m.depth !== null && m.scale !== undefined && m.hands !== undefined && m.view !== undefined;
    // A frame that suddenly reads as the other camera view is usually a glitch: skip it.
    // Only a lasting change (the phone really moved to the side) ends the set.
    if (usable && this.ready && m.view !== this.setView) {
      if (++this.viewMisses >= VIEW_CHANGE_FRAMES) this.endSet();
      else usable = false;
    } else if (usable) {
      this.viewMisses = 0;
    }
    if (!usable) {
      if (this.hold && ++this.hold.misses > HOLD_MISSES) this.hold = null;
      let repCompleted = false;
      if (this.ready) {
        this.lostSince ??= nowMs;
        if (nowMs - this.lostSince > LOST_MS) this.endSet();
        else if (this.lastProgress !== null && nowMs - this.lastUsableAt <= HOLD_GAP_MS) {
          repCompleted = this.step(this.lastProgress, nowMs);
        }
      }
      return out(null, repCompleted, m.hint || (this.ready ? '' : 'get-ready'));
    }
    this.lostSince = null;
    const view = m.view!;
    const hands = m.hands!;
    const scale = m.scale!;

    const dt = this.lastT === null ? 0 : Math.max(0, (nowMs - this.lastT) / 1000);
    this.lastT = nowMs;
    const gap = view === 'front' ? this.gapFilter.filter(this.gapMedian.push(this.frontGap(m)), nowMs) : 0;
    const sideProgress = view === 'side' ? this.angleProgress(m, nowMs, dt) : null;

    if (!this.ready) {
      this.tryStart(m.plank === true, view, hands, scale, view === 'front' ? gap : (m.angle ?? 0), nowMs);
      return out(null, false, m.hint || (this.ready ? '' : 'get-ready'));
    }

    // Hands are planted: if they stay off their spot, the phone or the person moved. Pause.
    // One glitchy frame can't do it; a real move shows in most of the last few frames.
    this.drift.push(handsMoved(hands, this.anchor) > PLANTED_TOL[view] * this.anchorScale);
    if (this.drift.length > DRIFT_WINDOW) this.drift.shift();
    if (this.drift.filter(Boolean).length >= DRIFT_FRAMES) {
      this.endSet();
      return out(null, false, 'get-ready');
    }

    let progress: number;
    if (view === 'front') {
      // Straighter arms than at the start raise the top, gently and capped, so one bad frame can't.
      if (gap > this.top) this.top = Math.min(this.topCap, this.top + (gap - this.top) * 0.2);
      progress = frontProgress(gap / this.top);
    } else {
      progress = sideProgress ?? 1;
    }
    this.lastProgress = progress;
    this.lastUsableAt = nowMs;
    return out(progress, this.step(progress, nowMs));
  }

  /** Start a set once a plank has been held with the hands still for READY_MS. */
  private tryStart(plank: boolean, view: 'front' | 'side', hands: Partial<Record<Side, Point>>, scale: number, value: number, nowMs: number): void {
    const h = this.hold;
    const fresh = () => {
      this.hold = plank ? { start: nowMs, hands, vals: [{ t: nowMs, v: value }], view, misses: 0 } : null;
    };
    if (!h) return fresh();
    const off = !plank || h.view !== view || handsMoved(hands, h.hands) > HOLD_HANDS_TOL * scale;
    if (off) {
      if (++h.misses > HOLD_MISSES) fresh();
      return;
    }
    h.misses = 0;
    h.vals.push({ t: nowMs, v: value });
    while (h.vals[0].t < nowMs - 2 * READY_MS) h.vals.shift();
    if (nowMs - h.start < READY_MS) return;
    // Top of the set: 75th percentile of the last moments, so one glitchy frame can't set it.
    const sorted = h.vals.map((x) => x.v).sort((a, b) => a - b);
    const top = sorted[Math.floor(0.75 * (sorted.length - 1))];
    // Front view: the arms must be straight around now, so the top is a real top.
    if (view === 'front' && top < FRONT_EXTENDED) return;
    this.ready = true;
    this.hold = null;
    this.setView = view;
    this.anchor = hands;
    this.anchorScale = scale;
    this.top = view === 'front' ? top : 1;
    this.topCap = this.top * 1.25;
    if (view === 'side') {
      // Learn the elbow range from this set only, not from getting into position.
      this.angleRange.reset();
      this.depthRange.reset();
      this.depthSpan = { min: Infinity, max: -Infinity };
    }
    this.state = 'up';
    this.pending = null;
    this.pendingFrames = 0;
    this.drift = [];
  }

  private updateSquat(lm: Landmark[] | undefined, nowMs: number): RepUpdate {
    const m = measure(lm, this.exercise, this.pickSide(lm, nowMs));
    const dt = this.lastT === null ? 0 : Math.max(0, (nowMs - this.lastT) / 1000);
    let progress: number | null = null;
    if (m.angle !== null) {
      this.lastT = nowMs;
      progress = this.angleProgress(m, nowMs, dt);
    }
    const repCompleted = progress !== null && m.valid ? this.step(progress, nowMs) : false;
    return { ...m, phase: this.phase(), progress, repCompleted, reps: this.count, ready: true };
  }
}

export const HINT_TEXT: Record<Hint, string> = {
  '': '',
  'get-ready': '팔을 펴고 엎드린 자세로 잠깐 멈추면 시작해요',
  'show-hands': '양손이 보이게 폰을 조금 더 멀리 두세요',
  'show-head': '머리가 잘려요. 폰을 조금 더 멀리 두거나 뒤로 기울여 주세요',
  'show-arms': '어깨부터 손목까지 화면에 보이게 해주세요',
  'show-legs': '엉덩이부터 발목까지 보이게 물러나 주세요',
  straighten: '허리를 펴고 몸을 일직선으로',
  'no-person': '사람이 안 보여요. 몸이 화면에 들어오게 해주세요',
};
