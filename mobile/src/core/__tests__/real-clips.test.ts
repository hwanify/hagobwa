import fs from 'node:fs';
import zlib from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { STEADY_JS } from '../../features/pose/pose-html';
import { RepCounter, type Landmark } from '../repCounter';
import type { ExerciseId } from '../rates';

/**
 * Real footage: MediaPipe landmarks (same model as the app) recorded from free push-up and squat
 * clips with known rep counts, replayed through exactly what the phone runs: the camera page's
 * joint smoothing, the same units, then RepCounter. Built by tools/pose-fixtures.
 */
interface Clip {
  id: number;
  exercise?: ExerciseId;
  view: string;
  min: number;
  max: number;
  note?: string;
  w: number;
  h: number;
  fps: number;
  keep: number[];
  frames: (number[] | null)[];
}

const file = new URL('./fixtures/pose-clips.json.gz', import.meta.url);
// Expected counts live in tools/pose-fixtures/clips.json (edit there; no need to re-record).
const expected = new URL('../../../../tools/pose-fixtures/clips.json', import.meta.url);
const spec: Record<number, Partial<Clip>> = fs.existsSync(expected)
  ? Object.fromEntries((JSON.parse(fs.readFileSync(expected, 'utf8')).clips as Clip[]).map((c) => [c.id, c]))
  : {};
const clips: Clip[] = fs.existsSync(file)
  ? (JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString()).clips as Clip[]).map((c) => ({ ...c, ...spec[c.id] }))
  : [];

function replay(clip: Clip, exercise: ExerciseId): number {
  const page = new Function(`${STEADY_JS}; return { steady, reset: () => { F.length = 0; } };`)() as {
    steady: (lm: Landmark[] | null, now: number) => Landmark[] | null;
  };
  const counter = new RepCounter(exercise);
  const ar = clip.h / clip.w;
  clip.frames.forEach((f, i) => {
    const t = Math.round((i * 1000) / clip.fps);
    let raw: Landmark[] | null = null;
    if (f) {
      // Joints that weren't recorded are unseen.
      raw = Array.from({ length: 33 }, () => ({ x: 0.5, y: 0.5, visibility: 0 }));
      clip.keep.forEach((k, j) => (raw![k] = { x: f[3 * j], y: f[3 * j + 1], visibility: f[3 * j + 2] }));
    }
    const lm = page.steady(raw, t);
    counter.update(lm?.map((p) => ({ x: p.x, y: p.y * ar, visibility: p.visibility })), t);
  });
  return counter.reps;
}

describe.skipIf(clips.length === 0)('real footage', () => {
  for (const clip of clips) {
    const exercise = clip.exercise ?? 'pushup';
    it(`${exercise} ${clip.id} (${clip.view}): ${clip.min === clip.max ? clip.min : `${clip.min}-${clip.max}`} reps${clip.note ? `, ${clip.note}` : ''}`, () => {
      const reps = replay(clip, exercise);
      expect(reps).toBeGreaterThanOrEqual(clip.min);
      expect(reps).toBeLessThanOrEqual(clip.max);
    });
    // Counting the wrong exercise finds nothing: a squat is no push-up and the other way round.
    if (clip.min > 0) {
      const other: ExerciseId = exercise === 'pushup' ? 'squat' : 'pushup';
      it(`${other} mode on ${exercise} ${clip.id}: 0 reps`, () => {
        expect(replay(clip, other)).toBe(0);
      });
    }
  }
});
