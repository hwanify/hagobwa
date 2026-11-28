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
export type Hint = '' | 'show-arms' | 'show-hands' | 'show-head' | 'show-legs' | 'straighten' | 'no-person' | 'get-ready' | 'stand-ready';

export interface Measurement {
  /** Main joint angle: elbow (push-up) or knee (squat). */
  angle: number | null;
  /**
   * Depth signal, large at the top and small at the bottom.
   * Push-up: how far the hands are below the shoulders, over shoulder width (front) or arm length (side).
   * Squat: how far the feet are below the hips, over shoulder width (front) or leg length (side).
   */
  depth: number | null;
  /** false when the body isn't measurable or the form is bad (e.g. sagging hips). */
  valid: boolean;
  /** Camera position: 'front' = phone facing the person, 'side' = beside the body. */
  view?: 'side' | 'front';
  hint: Hint;
  /** Body size on screen (shoulder width from the front; arm or leg length from the side). */
  scale?: number;
  /** What stays planted during a rep, per visible side: wrists (push-up) or ankles (squat). */
  planted?: Partial<Record<Side, Point>>;
  /** In the start position: a plank (push-up) or standing straight (squat). */
  startPose?: boolean;
  /** Each visible side's gap (shoulder to hand / hip to foot), over `scale`. */
  gaps?: Partial<Record<Side, number>>;
  /** Push-up: body upright (standing or sitting), which never happens during a push-up. */
  upright?: boolean;
}

export interface RepUpdate extends Measurement {
  phase: Phase;
  repCompleted: boolean;
  reps: number;
  /** 0 = bottom of the rep, 1 = top. */
  progress: number | null;
  /** A set is running: got into the start position, and the hands (push-up) or feet (squat) stay put. */
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
/** Hands and feet need a clearer view: they are what keeps the count honest. */
const HAND_VIS = 0.6;

// Set rules (shared by push-ups and squats; what differs is in RULES below)
/** Hands/feet planted and still in the start position this long before counting starts. */
const READY_MS = 400;
/** While getting ready the hands/feet may wobble this much (x body scale). */
const HOLD_HANDS_TOL = 0.15;
/** Out of sight this long ends the set (it restarts by getting into position again). */
const LOST_MS = 1500;

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

/**
 * `view` (push-ups) measures that way regardless of how the frame looks. A phone at an angle
 * reads as "front" at the bottom of a rep (elbows flared) and "side" at the top, so a running
 * set keeps the view it started with; both ways of measuring work from an angle.
 */
export function measure(lm: Landmark[] | undefined, exercise: ExerciseId, side?: Side, view?: 'front' | 'side'): Measurement {
  if (!lm || lm.length < 29) return { angle: null, depth: null, valid: false, hint: 'no-person' };

  if (exercise === 'pushup') {
    if (view === 'front') {
      const cut = lm[11].y < 0.03 || lm[12].y < 0.03;
      return frontPushup(lm, true) ?? { angle: null, depth: null, valid: false, hint: cut ? 'show-head' : 'no-person', view: 'front' };
    }
    const front = view === 'side' ? null : frontPushup(lm);
    if (front) return front;
    const m = sidePushup(lm, side ?? bestSide(lm, exercise));
    // Shoulders at/above the top edge: the phone is too close or tilted down. Say so, but keep
    // whatever could still be measured.
    if (lm[11].y < 0.03 || lm[12].y < 0.03) return { ...m, hint: 'show-head' };
    return m;
  }

  if (view === 'front') return frontSquat(lm, true) ?? { angle: null, depth: null, valid: false, hint: 'show-legs', view: 'front' };
  const front = view === 'side' ? null : frontSquat(lm);
  return front ?? sideSquat(lm, side ?? bestSide(lm, exercise));
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
function frontPushup(lm: Landmark[], forced = false): Measurement | null {
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
  if (!faceOn && !wide && !forced) return null;

  const arms = (['left', 'right'] as const).map((side) => [side, side === 'left' ? L : R] as const).filter(([, a]) => vis(a.w) >= HAND_VIS);
  if (arms.length === 0) {
    const cut = L.s.y < 0.03 || R.s.y < 0.03;
    return { angle: null, depth: null, valid: false, hint: cut ? 'show-head' : 'show-hands', view: 'front', scale: width };
  }
  const planted: Partial<Record<Side, Point>> = {};
  const gaps: Partial<Record<Side, number>> = {};
  let gap = 0;
  let angle = 0;
  let angles = 0;
  for (const [side, a] of arms) {
    planted[side] = { x: a.w.x, y: a.w.y };
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
  // Upright = standing/sitting. In a plank seen from the front the legs run away from the
  // phone, so the knees hide behind the body or sit near hip height (on real footage: knee
  // visibility ~0.1-0.3, knees <= ~0.3 shoulder widths below the hips, from low or raised
  // phones alike). Standing, the knees are in plain view a whole thigh below the hips (~1.1).
  // With no legs in sight, only a head far above the shoulders counts as upright: looking up
  // at the phone at the top of a push-up raises it ~0.5 shoulder widths.
  const legsShow = vis(L.h) >= 0.6 && vis(R.h) >= 0.6 && vis(L.k) >= 0.6 && vis(R.k) >= 0.6;
  const noseAbove = vis(nose) >= VIS ? (shoulderY - nose.y) / width : 0;
  const upright = legsShow ? (L.k.y + R.k.y - L.h.y - R.h.y) / 2 > 0.7 * width : noseAbove > 0.7;
  // Plank: both hands on the floor (level) below the shoulders, not upright. True all through
  // a rep; whether the arms were straight is checked when a set starts.
  const startPose = arms.length === 2 && Math.abs(L.w.y - R.w.y) <= 0.35 * width && depth >= 0.1 && !upright;
  return { angle: angles ? angle / angles : null, depth, valid: true, hint: '', view: 'front', scale: width, planted, startPose, gaps, upright };
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
  const base = { angle, depth, view: 'side' as const, scale: arm, planted: { [side]: { x: d.w.x, y: d.w.y } } };
  const end = vis(d.a) > VIS ? d.a : d.k;
  if (vis(d.h) > VIS && vis(end) > VIS && angleAt(d.s, d.h, end) < 140) {
    return { ...base, valid: false, hint: 'straighten' };
  }
  // Plank: hand below the shoulder, and the torso closer to flat than upright (if the hip shows).
  const flat = vis(d.h) <= VIS || Math.abs(d.h.y - d.s.y) <= 0.7 * Math.abs(d.h.x - d.s.x);
  const startPose = depth !== null && depth >= 0.3 && flat;
  const upright = vis(d.h) > VIS && Math.abs(d.h.y - d.s.y) > 1.5 * Math.abs(d.h.x - d.s.x);
  return { ...base, valid: true, hint: '', startPose, upright, gaps: depth !== null ? { [side]: depth } : undefined };
}

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Squat with the phone standing a few steps in front, the whole body in the picture.
 *
 * The feet stay planted while the hips come down to them, so the count is the vertical gap from
 * hips to ankles. RepCounter measures it against the body size at the start of the set: leaning
 * forward at the bottom brings the shoulders closer to the phone, which would otherwise make
 * every squat look deeper. Moving or zooming the phone moves hips and feet alike.
 */
function frontSquat(lm: Landmark[], forced = false): Measurement | null {
  const L = joints(lm, 'left');
  const R = joints(lm, 'right');
  if (vis(L.h) < VIS || vis(R.h) < VIS) return null;
  const shouldersShow = vis(L.s) >= VIS && vis(R.s) >= VIS;
  const shoulderW = shouldersShow ? dist(L.s, R.s) : 0;
  const hipW = dist(L.h, R.h);
  const hips = mid(L.h, R.h);
  const torso = shouldersShow ? dist(mid(L.s, R.s), hips) : 0;
  const thigh = Math.max(vis(L.k) >= VIS ? dist(L.h, L.k) : 0, vis(R.k) >= VIS ? dist(R.h, R.k) : 0);
  // Facing the phone: shoulders wide next to the torso, or hips wide next to the thighs. From the
  // side both pairs stack up behind each other.
  const wide = (torso > 0 && shoulderW >= 0.45 * torso) || (thigh > 0 && hipW >= 0.45 * thigh);
  if (!wide && !forced) return null;
  // Shoulder width, or the hips (about 0.7 of it) when the shoulders are out of the picture.
  const scale = shoulderW > 0 ? shoulderW : hipW * 1.4;
  if (scale <= 0) return null;
  const legs = (['left', 'right'] as const).map((side) => [side, side === 'left' ? L : R] as const).filter(([, j]) => vis(j.a) >= HAND_VIS);
  if (legs.length === 0) return { angle: null, depth: null, valid: false, hint: 'show-legs', view: 'front', scale };
  const planted: Partial<Record<Side, Point>> = {};
  const gaps: Partial<Record<Side, number>> = {};
  let gap = 0;
  let angle = 0;
  let angles = 0;
  for (const [side, j] of legs) {
    planted[side] = { x: j.a.x, y: j.a.y };
    gaps[side] = (j.a.y - j.h.y) / scale;
    gap += gaps[side]!;
    if (vis(j.k) >= VIS) {
      angle += angleAt(j.h, j.k, j.a);
      angles++;
    }
  }
  const depth = gap / legs.length;
  // Feet far above the hips or miles below: a broken frame, not a body.
  if (depth < -0.5 || depth > 6) return { angle: null, depth: null, valid: false, hint: '', view: 'front', scale };
  // Standing: both feet down (level), knees between hips and feet, hips well above the feet and
  // the shoulders above the hips. Whether the legs were straight is checked when a set starts.
  const standing =
    legs.length === 2 &&
    Math.abs(L.a.y - R.a.y) <= 0.35 * scale &&
    depth >= 0.5 &&
    [L, R].every((j) => vis(j.k) >= VIS && j.k.y > j.h.y && j.k.y < j.a.y) &&
    (!shouldersShow || mid(L.s, R.s).y < hips.y - 0.5 * scale);
  return { angle: angles ? angle / angles : null, depth, valid: true, hint: '', view: 'front', scale, planted, startPose: standing, gaps };
}

/** Squat filmed from the side: hips come down to the planted foot; knee angle for display. */
function sideSquat(lm: Landmark[], side: Side): Measurement {
  const d = joints(lm, side);
  if (vis(d.h) < VIS || vis(d.k) < VIS || vis(d.a) < HAND_VIS) {
    return { angle: null, depth: null, valid: false, hint: 'show-legs', view: 'side' };
  }
  const leg = dist(d.h, d.k) + dist(d.k, d.a);
  if (leg <= 0) return { angle: null, depth: null, valid: false, hint: 'show-legs', view: 'side' };
  const angle = angleAt(d.h, d.k, d.a);
  const depth = (d.a.y - d.h.y) / leg;
  if (depth < -0.5 || depth > 1.5) return { angle: null, depth: null, valid: false, hint: '', view: 'side', scale: leg };
  // Standing: hip above the foot over a mostly straight leg, shoulder above the hip (if seen).
  const standing = depth >= 0.5 && (vis(d.s) < VIS || d.s.y < d.h.y - 0.25 * leg);
  return { angle, depth, valid: true, hint: '', view: 'side', scale: leg, planted: { [side]: { x: d.a.x, y: d.a.y } }, startPose: standing, gaps: { [side]: depth } };
}

/**
 * Largest move of a planted hand/foot seen in both, or Infinity if none is shared. MediaPipe
 * sometimes swaps left and right for a few frames (seen at the bottom of reps from a raised
 * phone), so with both the better of the two pairings counts: nothing moved, only the labels.
 */
function plantedMoved(a: Partial<Record<Side, Point>>, b: Partial<Record<Side, Point>>): number {
  if (a.left && a.right && b.left && b.right) {
    const same = Math.max(dist(a.left, b.left), dist(a.right, b.right));
    const swapped = Math.max(dist(a.left, b.right), dist(a.right, b.left));
    return Math.min(same, swapped);
  }
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
  /** Where the hands/feet were planted when the hold began. */
  planted: Partial<Record<Side, Point>>;
  /** Latest planted points seen (both, once a front frame showed both). */
  last: Partial<Record<Side, Point>>;
  /** How many frames read as each camera view: the set takes the majority. */
  views: Record<'front' | 'side', number>;
  /** Latest body scale per view. */
  scale: Partial<Record<'front' | 'side', number>>;
  /** Frames in a row that broke the hold (not in position / moved); a few are forgiven. */
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
/** The set pauses when the hands/feet are off their spot in this many of the last DRIFT_WINDOW frames. */
const DRIFT_FRAMES = 4;
const DRIFT_WINDOW = 6;
/** Through dropouts this short the last reading holds, so a rep that just reached the top still counts. */
const HOLD_GAP_MS = 300;
/**
 * The planted spot follows the hands/feet this slowly (s). A phone that slides or a slowly
 * panning camera is fine; a bump, a pick-up or a lifted hand/foot is faster and pauses the set.
 */
const ANCHOR_TAU = 1;
/** Push-up: upright (standing/sitting) this many frames in a row ends the set. */
const UPRIGHT_FRAMES = 8;
/** A new set takes its top from this much recent history (it may start mid-rep). */
const RECENT_MS = 1500;

/** What differs between push-ups and squats; the set logic is shared. */
interface SetRules {
  /**
   * Smallest top gap (x scale) that counts as arms straight / standing tall, per camera view.
   * Push-up front: ~1.2-1.5 at the top. Squat front: ~1.8-2.3 standing (hips to ankles over
   * shoulder width), side: ~0.95 (over leg length).
   */
  extended: Record<'front' | 'side', number>;
  /** Progress (0 bottom .. 1 top) from the gap as a fraction of the set's top. */
  progress: (frac: number) => number;
  /**
   * Came back up to at least this fraction of the top and went down again: the top was set
   * too high (e.g. while getting into position). That rep counts and its peak becomes the top.
   */
  retopFrac: number;
  /** Planted hands/feet moving farther than this (x scale) pause the set. */
  plantedTol: Record<'front' | 'side', number>;
  /** Shown while waiting for the start position. */
  readyHint: Hint;
  /**
   * Measure the gap against the body size at the start of the set (updated only while at the
   * top) instead of each frame's: in a squat the shoulders lean toward the phone at the bottom.
   */
  fixedScale: boolean;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

const RULES: Record<ExerciseId, SetRules> = {
  pushup: {
    extended: { front: 0.85, side: 0.3 },
    // Bottom below 55% of the top (a half push-up stays around 70%), top again above 80%.
    progress: (frac) => clamp01(2 * frac - 0.8),
    retopFrac: 0.6,
    plantedTol: { front: 0.5, side: 0.4 },
    readyHint: 'get-ready',
    fixedScale: false,
  },
  squat: {
    extended: { front: 1.2, side: 0.8 },
    // Bottom below 68% of the standing gap (thighs about parallel ~45-50%, a half squat ~75%),
    // top again above 90%.
    progress: (frac) => clamp01((frac - 0.548) / 0.44),
    retopFrac: 0.8,
    plantedTol: { front: 0.6, side: 0.5 },
    readyHint: 'stand-ready',
    fixedScale: true,
  },
};

/**
 * Counts reps from a stream of pose frames, in sets.
 *
 * Counting starts once the person holds the start position (push-up: plank; squat: standing)
 * with the hands/feet planted and still for READY_MS, and pauses when those move in the picture
 * (phone moved, person got up or walked) or the body is out of sight for LOST_MS. Carrying the
 * phone around or getting into position therefore never counts.
 * Signal: the gap from shoulders to hands (push-up) or hips to feet (squat) as a fraction of
 * the set's top; push-ups from the side use the elbow angle against the person's own range.
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
  /** Left minus right gap while both sides show, to keep the gap steady when one drops out. */
  private gapSkew = 0;
  private angleRange: AdaptiveRange;
  private depthRange = new AdaptiveRange({ top: 1, bottom: 0.5 }, MIN_DEPTH_RANGE);
  private depthSpan = { min: Infinity, max: -Infinity };
  private pending: State | null = null;
  private pendingFrames = 0;
  // set
  private ready = false;
  private hold: Hold | null = null;
  private setView: 'front' | 'side' = 'front';
  private anchor: Partial<Record<Side, Point>> = {};
  private anchorScale = 1;
  /** fixedScale exercises: body size the gap is measured against (from the top of the set). */
  private refScale = 1;
  private top = 1;
  private topCap = 1;
  private lostSince: number | null = null;
  private drift: boolean[] = [];
  private lastProgress: number | null = null;
  private lastUsableAt = -Infinity;
  private uprightFrames = 0;
  /** Start-position gaps of the last moments (kept across holds): the top of a new set comes from here. */
  private recentGaps: { t: number; v: number }[] = [];
  /** Highest gap since the last bottom. */
  private peakSinceBottom = 0;

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
    this.lastProgress = null;
    this.lastUsableAt = -Infinity;
    this.uprightFrames = 0;
    this.recentGaps = [];
    this.peakSinceBottom = 0;
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
        // From the front both sides count, so the side only matters for side-view sets.
        if (this.ready && this.setView === 'side') this.endSet();
        this.side = best;
      }
      return this.side;
    }
    this.sideSeenAt = nowMs;
    return this.side;
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

  /** Push-ups from the side: progress from the elbow angle (and depth once it moves like a rep). */
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

  /** The gap from both sides, or from one corrected by the usual left-right difference. */
  private sidesGap(m: Measurement): number {
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

  update(lm: Landmark[] | undefined, nowMs: number): RepUpdate {
    const rules = RULES[this.exercise];
    // A running set keeps its camera view; see measure().
    const m = measure(lm, this.exercise, this.pickSide(lm, nowMs), this.ready ? this.setView : undefined);
    const out = (progress: number | null, repCompleted: boolean, hint = m.hint): RepUpdate => ({
      ...m,
      hint,
      phase: this.phase(),
      progress,
      repCompleted,
      reps: this.count,
      ready: this.ready,
    });

    // The phone really moving to another spot shows as moving hands/feet (see below) or a lost
    // body. Push-ups from the front: the shoulders only get wider as the body comes down, so a
    // frame where they collapse to half the width is MediaPipe stacking both on one spot. Skip it.
    const collapsed =
      this.ready && this.exercise === 'pushup' && m.view === 'front' && m.scale !== undefined && m.scale < 0.55 * this.anchorScale;
    const usable = !collapsed && m.valid && m.depth !== null && m.scale !== undefined && m.planted !== undefined && m.view !== undefined;
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
      return out(null, repCompleted, m.hint || (this.ready ? '' : rules.readyHint));
    }
    this.lostSince = null;
    const view = m.view!;
    const planted = m.planted!;
    const scale = m.scale!;
    // Push-ups from the side go by the elbow angle; everything else by the gap.
    const byGap = this.exercise === 'squat' || view === 'front';

    const dt = this.lastT === null ? 0 : Math.max(0, (nowMs - this.lastT) / 1000);
    this.lastT = nowMs;
    // fixedScale: the gap against the set's body size (before a set starts, this frame's).
    const toRef = rules.fixedScale && this.ready ? scale / this.refScale : 1;
    const gap = byGap ? this.gapFilter.filter(this.gapMedian.push(this.sidesGap(m) * toRef), nowMs) : 0;
    if (byGap) {
      // Only start-position frames: getting into position (kneeling, body still high) would inflate it.
      if (m.startPose) this.recentGaps.push({ t: nowMs, v: gap });
      while (this.recentGaps.length && this.recentGaps[0].t < nowMs - RECENT_MS) this.recentGaps.shift();
    }
    const sideProgress = byGap ? null : this.angleProgress(m, nowMs, dt);

    if (!this.ready) {
      this.tryStart(m.startPose === true, view, planted, scale, nowMs);
      return out(null, false, m.hint || (this.ready ? '' : rules.readyHint));
    }

    // Push-ups: standing or sitting up ends the set.
    this.uprightFrames = this.exercise === 'pushup' && m.upright ? this.uprightFrames + 1 : 0;
    if (this.uprightFrames >= UPRIGHT_FRAMES) {
      this.endSet();
      return out(null, false, rules.readyHint);
    }

    // Hands/feet are planted: if they jump off their spot, the phone or the person moved. Pause.
    // One glitchy frame can't do it; a real move shows in most of the last few frames.
    // MediaPipe sometimes stacks both wrists/ankles on one spot for a few frames: their spacing
    // collapses, which neither a moved phone nor a person does. Those frames don't vote.
    const a = this.anchor;
    const pair = !!(a.left && a.right && planted.left && planted.right);
    const stacked = pair && dist(planted.left!, planted.right!) < 0.4 * dist(a.left!, a.right!);
    const off = !stacked && plantedMoved(planted, a) > rules.plantedTol[view] * this.anchorScale;
    if (!stacked) this.drift.push(off);
    if (this.drift.length > DRIFT_WINDOW) this.drift.shift();
    if (this.drift.filter(Boolean).length >= DRIFT_FRAMES) {
      this.endSet();
      return out(null, false, rules.readyHint);
    }
    const swapped =
      pair && Math.max(dist(a.left!, planted.right!), dist(a.right!, planted.left!)) < Math.max(dist(a.left!, planted.left!), dist(a.right!, planted.right!));
    const k = 1 - Math.exp(-dt / ANCHOR_TAU);
    if (!off && !swapped && !stacked) {
      // Slow drift (phone sliding, camera panning) is followed, so it never adds up to a pause.
      for (const side of ['left', 'right'] as const) {
        const q = this.anchor[side];
        const p = planted[side];
        if (q && p) this.anchor[side] = { x: q.x + (p.x - q.x) * k, y: q.y + (p.y - q.y) * k };
      }
      this.anchorScale += (scale - this.anchorScale) * k;
    }

    let progress: number;
    if (byGap) {
      // Straighter arms / taller standing than at the start raise the top, gently and capped
      // (frames are already spike-filtered), so one bad frame can't.
      if (gap > this.top) this.top = Math.min(this.topCap, this.top + (gap - this.top) * 0.2);
      const frac = gap / this.top;
      // fixedScale: follow a slowly zooming camera, but only while at the top (no squat lean).
      if (rules.fixedScale && frac >= 0.9 && Math.abs(scale / this.refScale - 1) < 0.25) this.refScale += (scale - this.refScale) * k;
      progress = rules.progress(frac);
    } else {
      progress = sideProgress ?? 1;
    }
    this.lastProgress = progress;
    this.lastUsableAt = nowMs;
    const before = this.state;
    let repCompleted = this.step(progress, nowMs);
    if (byGap) {
      if (this.state === 'goingUp') this.peakSinceBottom = Math.max(this.peakSinceBottom, gap);
      // Came up most of the way, then went down again: the top is too high. Count it, re-top.
      const peak = this.peakSinceBottom;
      if (before === 'goingUp' && this.state === 'down' && peak >= rules.retopFrac * this.top && peak >= rules.extended[view]) {
        this.top = peak;
        this.topCap = Math.max(this.topCap, peak * 1.6);
        if (nowMs - this.lastRepAt >= MIN_REP_MS) {
          this.lastRepAt = nowMs;
          this.count++;
          repCompleted = true;
        }
      }
      if (this.state === 'down' && before !== 'down') this.peakSinceBottom = 0;
    }
    return out(progress, repCompleted);
  }

  /**
   * Start a set once the start position has been held with the hands/feet still for READY_MS.
   * Frames may read as front or side (a phone at an angle flips between them); the set takes
   * the majority.
   */
  private tryStart(inPose: boolean, view: 'front' | 'side', planted: Partial<Record<Side, Point>>, scale: number, nowMs: number): void {
    const rules = RULES[this.exercise];
    const h = this.hold;
    if (!h || (!inPose && ++h.misses > HOLD_MISSES)) {
      this.hold = inPose
        ? { start: nowMs, planted, last: { ...planted }, views: { front: view === 'front' ? 1 : 0, side: view === 'side' ? 1 : 0 }, scale: { [view]: scale }, misses: 0 }
        : null;
      return;
    }
    if (!inPose) return;
    if (plantedMoved(planted, h.planted) > HOLD_HANDS_TOL * scale) {
      if (++h.misses > HOLD_MISSES) this.hold = null;
      return;
    }
    h.misses = 0;
    h.views[view]++;
    h.scale[view] = scale;
    Object.assign(h.last, planted);
    if (nowMs - h.start < READY_MS) return;
    const setView = h.views.front >= h.views.side ? 'front' : 'side';
    const byGap = this.exercise === 'squat' || setView === 'front';
    // Top of the set: 90th percentile of the last 1.5 s, so the set can start mid-rep, while a
    // glitchy frame or two can't set it.
    const sorted = this.recentGaps.map((x) => x.v).sort((a, b) => a - b);
    const top = sorted.length ? sorted[Math.floor(0.9 * (sorted.length - 1))] : 0;
    // The arms/legs must have been straight just now, so the top is a real top.
    if (byGap && top < rules.extended[setView]) return;
    this.ready = true;
    this.hold = null;
    this.setView = setView;
    this.anchor = h.last;
    this.anchorScale = h.scale[setView] ?? scale;
    this.refScale = this.anchorScale;
    this.top = byGap ? top : 1;
    // If the set started mid-rep the top is underestimated: let it grow to the real one.
    this.topCap = this.top * 1.6;
    if (!byGap) {
      // Learn the elbow range from this set only, not from getting into position.
      this.angleRange.reset();
      this.depthRange.reset();
      this.depthSpan = { min: Infinity, max: -Infinity };
    }
    this.state = 'up';
    this.pending = null;
    this.pendingFrames = 0;
    this.drift = [];
    this.uprightFrames = 0;
    this.recentGaps = [];
    this.peakSinceBottom = 0;
  }
}

export const HINT_TEXT: Record<Hint, string> = {
  '': '',
  'get-ready': '팔을 펴고 엎드린 자세로 잠깐 멈추면 시작해요',
  'stand-ready': '발끝까지 보이게 서서 잠깐 멈추면 시작해요',
  'show-hands': '양손이 보이게 폰을 조금 더 멀리 두세요',
  'show-head': '머리가 잘려요. 폰을 조금 더 멀리 두거나 뒤로 기울여 주세요',
  'show-arms': '어깨부터 손목까지 화면에 보이게 해주세요',
  'show-legs': '발끝까지 화면에 보이게 조금 뒤로 물러나 주세요',
  straighten: '허리를 펴고 몸을 일직선으로',
  'no-person': '사람이 안 보여요. 몸이 화면에 들어오게 해주세요',
};
