// Builds mobile/src/core/__tests__/fixtures/pose-clips.json.gz: MediaPipe pose landmarks (the
// same model and settings as the app, 18 frames/s) for free workout clips with known rep counts.
// Run by .github/workflows/pose-fixtures.yml. Needs ffmpeg, Playwright Chromium and internet.
// Clips already in the file are kept as they are; only new ones are recorded (FORCE=1 redoes all).
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const here = path.dirname(new URL(import.meta.url).pathname);
const work = path.join(here, 'work');
const out = path.join(here, '../../mobile/src/core/__tests__/fixtures/pose-clips.json.gz');
const FPS = 18;
// Joints the counter reads; the rest are left out to keep the file small.
const KEEP = [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28];
const spec = JSON.parse(fs.readFileSync(path.join(here, 'clips.json'), 'utf8'));

const PAGE = `<!doctype html><html><body><script type="module">
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';
window.extract = async (dir, n, fps) => {
  const vision = await import(MP + '/vision_bundle.mjs');
  const files = await vision.FilesetResolver.forVisionTasks(MP + '/wasm');
  const lmk = await vision.PoseLandmarker.createFromOptions(files, { baseOptions: { modelAssetPath: MODEL, delegate: 'CPU' }, runningMode: 'VIDEO', numPoses: 1 });
  const frames = [];
  let w = 0, h = 0;
  for (let i = 1; i <= n; i++) {
    const bmp = await createImageBitmap(await (await fetch('http://local.test/' + dir + '/' + String(i).padStart(4, '0') + '.jpg')).blob());
    w = bmp.width; h = bmp.height;
    const lm = lmk.detectForVideo(bmp, Math.round(((i - 1) * 1000) / fps) + 1).landmarks[0];
    frames.push(lm ? lm.map((p) => [p.x, p.y, p.visibility || 0]) : null);
    bmp.close();
  }
  lmk.close();
  return { w, h, frames };
};
window.ready = true;
</script></body></html>`;

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const recorded = new Map(
  (!process.env.FORCE && fs.existsSync(out) ? JSON.parse(zlib.gunzipSync(fs.readFileSync(out)).toString()).clips : [])
    .filter((c) => c.fps === FPS && same(c.keep, KEEP))
    .map((c) => [c.id, c]),
);

let page = null;
let browser = null;
async function openPage() {
  fs.mkdirSync(work, { recursive: true });
  fs.writeFileSync(path.join(work, 'page.html'), PAGE);
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.route('http://local.test/**', (route) => {
    const f = route.request().url().replace('http://local.test/', '');
    route.fulfill({ path: path.join(work, f), contentType: f.endsWith('.jpg') ? 'image/jpeg' : 'text/html' });
  });
  await page.goto('http://local.test/page.html');
  await page.waitForFunction('window.ready === true');
}

const clips = [];
let added = 0;
for (const c of spec.clips) {
  const old = recorded.get(c.id);
  if (old) {
    clips.push({ ...c, url: `https://mixkit.co/free-stock-video/${c.id}/`, w: old.w, h: old.h, fps: FPS, keep: KEEP, frames: old.frames });
    continue;
  }
  if (!page) await openPage();
  added++;
  const video = path.join(work, `v${c.id}.mp4`);
  if (!fs.existsSync(video)) execSync(`curl -sfL -o ${video} https://assets.mixkit.co/videos/${c.id}/${c.id}-360.mp4`);
  const dir = `f${c.id}`;
  fs.rmSync(path.join(work, dir), { recursive: true, force: true });
  fs.mkdirSync(path.join(work, dir));
  execSync(`ffmpeg -loglevel error -i ${video} -vf fps=${FPS} -q:v 3 ${path.join(work, dir)}/%04d.jpg`);
  const n = fs.readdirSync(path.join(work, dir)).length;
  const r = await page.evaluate(([d, n, fps]) => window.extract(d, n, fps), [dir, n, FPS]);
  const frames = r.frames.map((lm) => (lm ? KEEP.flatMap((k) => [+lm[k][0].toFixed(4), +lm[k][1].toFixed(4), +lm[k][2].toFixed(3)]) : null));
  clips.push({ ...c, url: `https://mixkit.co/free-stock-video/${c.id}/`, w: r.w, h: r.h, fps: FPS, keep: KEEP, frames });
  console.log(c.id, n, 'frames', r.frames.filter(Boolean).length, 'with a body');
}
if (browser) await browser.close();
console.log(added, 'clips recorded,', clips.length - added, 'kept');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, zlib.gzipSync(JSON.stringify({ source: spec.source, clips }), { level: 9 }));
console.log('wrote', out, fs.statSync(out).size, 'bytes');
