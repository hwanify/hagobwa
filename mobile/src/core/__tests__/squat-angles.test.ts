import { describe, expect, it } from 'vitest';

import { STEADY_JS } from '../../features/pose/pose-html';
import { RepCounter, type Landmark } from '../repCounter';

/**
 * Squats seen by a phone camera from any angle around the person (front, diagonal, side), with
 * perspective, camera height, MediaPipe-like jitter, glitchy joints, left/right swaps and
 * dropped frames, through the camera page's smoothing and the counter. Seeded, so it's the
 * same every run.
 */
let seed = 20261128;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
const R = (a: number, b: number) => a + (b - a) * rnd();
const rad = (d: number) => (d * Math.PI) / 180;
/** Portrait 3:4 camera: the app's y runs to height/width. */
const AR = 4 / 3;
type P3 = { f: number; l: number; u: number };

/** Joints in body space (f forward, l to the left, u up), feet planted at the origin; d = depth 0..~1.2. */
function body(d: number, sway: number): Record<number, P3> {
  const shin = rad(38 * d);
  const thigh = rad(4 + 72 * d);
  const lean = rad(45 * d);
  const ankle = { f: 0, u: 0.04 };
  const knee = { f: 0.2 * Math.sin(shin), u: ankle.u + 0.2 * Math.cos(shin) };
  const hip = { f: knee.f - 0.2 * Math.sin(thigh), u: knee.u + 0.2 * Math.cos(thigh) };
  const sh = { f: hip.f + 0.28 * Math.sin(lean), u: hip.u + 0.28 * Math.cos(lean) };
  const J: Record<number, P3> = {};
  const half: Record<number, number> = { 11: 0.1, 23: 0.07, 25: 0.08 + 0.04 * d, 27: 0.09 };
  const swayAt: Record<number, number> = { 11: 1, 23: 1, 25: 0.5, 27: 0 };
  for (const [i, p] of [
    [11, sh],
    [23, hip],
    [25, knee],
    [27, ankle],
  ] as const) {
    J[i] = { f: p.f, l: half[i] + sway * swayAt[i], u: p.u };
    J[i + 1] = { f: p.f, l: -half[i] + sway * swayAt[i], u: p.u };
  }
  for (const [s, e, w] of [
    [11, 13, 15],
    [12, 14, 16],
  ] as const) {
    J[e] = { f: J[s].f + 0.12 * Math.sin(rad(20 + 60 * d)), l: J[s].l, u: J[s].u - 0.12 * Math.cos(rad(20 + 60 * d)) };
    J[w] = { f: J[e].f + 0.12, l: J[s].l * 0.6, u: J[e].u };
  }
  J[0] = { f: sh.f + 0.05, l: sway, u: sh.u + 0.09 };
  return J;
}

interface Camera {
  /** 0 = straight in front, 90 = from the side. */
  theta: number;
  dist: number;
  height: number;
  zoom: number;
  x0: number;
  floorY: number;
  farVis: number;
  noise: number;
  glitch: number;
  swap: number;
  drop: number;
}

const camera = (theta: number): Camera => ({
  theta,
  dist: R(1.4, 3.2),
  height: R(0, 0.5),
  zoom: R(0.85, 1.35),
  x0: R(-0.12, 0.12),
  floorY: R(1.12, 1.3),
  farVis: R(-0.12, 0.05),
  noise: R(0.002, 0.01),
  glitch: R(0, 0.04),
  swap: R(0, 0.02),
  drop: R(0, 0.02),
});

const PAIRS = [
  [11, 12],
  [13, 14],
  [15, 16],
  [23, 24],
  [25, 26],
  [27, 28],
];

/** What MediaPipe would report (raw, before the page's smoothing). */
function shoot(J: Record<number, P3>, c: Camera, swapped: boolean): Landmark[] | null {
  if (rnd() < c.drop) return null;
  const cf = Math.cos(rad(c.theta));
  const cl = Math.sin(rad(c.theta));
  const F = c.zoom * c.dist;
  const horizon = c.floorY - (c.height * F) / c.dist;
  const lm: Landmark[] = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0.05 }));
  for (const [k, p] of Object.entries(J)) {
    const i = Number(k);
    const z = c.dist - (p.f * cf + p.l * cl);
    // The far leg stays well seen up to ~60 degrees (as in real clips), then fades.
    const far = p.l * cl < 0 && i !== 0;
    const vis = far ? Math.min(0.97, 0.95 - 0.7 * Math.min(1, Math.max(0, (Math.abs(c.theta) - 60) / 25)) + c.farVis) : 0.95;
    const n = c.noise * (vis < 0.6 ? 2.5 : 1);
    lm[i] = {
      x: 0.5 + c.x0 + ((p.f * cl - p.l * cf) * F) / z + gauss() * n,
      y: (horizon - ((p.u - c.height) * F) / z + gauss() * n) / AR,
      visibility: Math.min(1, Math.max(0, vis + gauss() * 0.03)),
    };
  }
  if (rnd() < c.glitch) {
    const i = [0, 11, 12, 23, 24, 25, 26, 27, 28][Math.floor(rnd() * 9)];
    lm[i] = { ...lm[i], x: lm[i].x + R(-0.25, 0.25), y: lm[i].y + R(-0.25, 0.25) };
  }
  if (swapped) for (const [a, b] of PAIRS) [lm[a], lm[b]] = [lm[b], lm[a]];
  return lm;
}

/** Stand still, then squat to each depth with random tempo; returns the count. */
function set(theta: number, depths: number[]): number {
  const c = camera(theta);
  const page = new Function(`${STEADY_JS}; return { steady };`)() as {
    steady: (lm: Landmark[] | null, now: number) => Landmark[] | null;
  };
  const counter = new RepCounter('squat');
  let t = 0;
  let swapFrames = 0;
  const sway0 = R(-0.02, 0.02);
  const frame = (d: number, sway: number) => {
    t += 55 + R(-8, 8);
    if (swapFrames > 0) swapFrames--;
    else if (rnd() < c.swap) swapFrames = 2 + Math.floor(rnd() * 5);
    const lm = page.steady(shoot(body(d, sway0 + sway), c, swapFrames > 0), t);
    counter.update(lm?.map((p) => ({ x: p.x, y: p.y * AR, visibility: p.visibility })), t);
  };
  const still = (ms: number) => {
    for (let e = 0; e < ms; e += 55) frame(R(0, 0.02), R(-0.003, 0.003));
  };
  const ease = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * x);
  still(R(900, 2000));
  for (const depth of depths) {
    const down = R(600, 1500);
    const bottom = R(0, 600);
    const up = R(500, 1200);
    for (let e = 0; e < down; e += 55) frame(depth * ease(e / down), 0.01 * Math.sin(e / 300));
    for (let e = 0; e < bottom; e += 55) frame(depth + R(-0.02, 0.02), 0);
    for (let e = 0; e < up; e += 55) frame(depth * (1 - ease(e / up)), 0.01 * Math.sin(e / 300));
    still(R(200, 1500));
  }
  still(1000);
  return counter.reps;
}

/** Thighs about parallel or lower. */
const full = () => R(0.88, 1.2);
/** Down a third to two thirds of the way. */
const half = () => R(0.3, 0.62);
const angle = ([a, b]: [number, number]) => R(a, b) * (rnd() < 0.5 ? -1 : 1);

describe('squats from any camera angle (simulated)', () => {
  for (const [name, range] of [
    ['front', [0, 25]],
    ['diagonal', [25, 65]],
    ['side', [65, 90]],
  ] as [string, [number, number]][]) {
    it(`${name}: counts full squats, never half ones`, () => {
      let exact = 0;
      let over = 0;
      for (let i = 0; i < 25; i++) {
        const got = set(angle(range), [full(), full(), full(), full(), full()]);
        if (got === 5) exact++;
        if (got > 5) over++;
      }
      let halves = 0;
      for (let i = 0; i < 20; i++) halves += set(angle(range), [half(), half(), half(), half(), half()]);
      expect(over).toBe(0);
      expect(exact).toBeGreaterThanOrEqual(24);
      expect(halves).toBeLessThanOrEqual(1);
    });
  }
});
