/**
 * Page loaded inside the native WebView: front camera + MediaPipe Pose Landmarker.
 * It only detects joints and draws the skeleton; counting happens in React Native
 * (RepCounter), so web and phone share one tested implementation.
 *
 * Protocol (postMessage JSON):
 *   page -> app: {t:'ready'} | {t:'status', s} | {t:'error', name, msg} | {t:'lm', ts, lm: [[x,y,vis]x33] | null}
 *   app -> page: window.hagoStart(), window.hagoStop(), window.hagoSetExercise(e), window.hagoFlash()
 */
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task';

export const POSE_HTML = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
  html,body{margin:0;height:100%;background:#16181B;overflow:hidden}
  video,canvas{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;transform:scaleX(-1)}
</style>
</head>
<body>
<video id="v" playsinline muted autoplay></video>
<canvas id="c"></canvas>
<script type="module">
  const post = (m) => window.ReactNativeWebView && window.ReactNativeWebView.postMessage(JSON.stringify(m));
  const v = document.getElementById('v');
  const c = document.getElementById('c');
  const ctx = c.getContext('2d');
  let stream = null, landmarker = null, raf = 0, lastVideoTime = -1, lastDetect = 0, running = false;
  // ~18 detections per second is plenty for a 1-2 s rep and saves battery and heat.
  const DETECT_MS = 55;

  async function loadModel() {
    if (landmarker) return landmarker;
    const vision = await import('${MP}/vision_bundle.mjs');
    const files = await vision.FilesetResolver.forVisionTasks('${MP}/wasm');
    const opts = (delegate) => ({ baseOptions: { modelAssetPath: '${MODEL}', delegate }, runningMode: 'VIDEO', numPoses: 1 });
    try { landmarker = await vision.PoseLandmarker.createFromOptions(files, opts('GPU')); }
    catch (e) { landmarker = await vision.PoseLandmarker.createFromOptions(files, opts('CPU')); }
    return landmarker;
  }

  // Steady the joints before drawing or counting. Joints outside the picture are guesses:
  // their visibility is cut so nothing trusts them. Each coordinate goes through a One Euro
  // filter (still = smooth, moving = responsive), and a low-confidence joint that jumps far
  // in one frame keeps its last place.
  const F = [];
  function euro(minCutoff, beta) {
    let x = null, dx = 0, t = 0;
    return (v, now) => {
      if (x === null) { x = v; t = now; return v; }
      const dt = Math.max(1e-3, (now - t) / 1000); t = now;
      const a = (fc) => 1 / (1 + 1 / (2 * Math.PI * fc * dt));
      dx += a(1) * ((v - x) / dt - dx);
      x += a(minCutoff + beta * Math.abs(dx)) * (v - x);
      return x;
    };
  }
  function steady(lm, now) {
    if (!lm) { F.length = 0; return null; }
    return lm.map((p, i) => {
      const inside = p.x > 0.01 && p.x < 0.99 && p.y > 0.01 && p.y < 0.99;
      const vis = (p.visibility || 0) * (inside ? 1 : 0.3);
      let f = F[i];
      if (!f) f = F[i] = { fx: euro(1.2, 6), fy: euro(1.2, 6), x: p.x, y: p.y };
      const jump = Math.hypot(p.x - f.x, p.y - f.y);
      if (!(vis < 0.6 && jump > 0.12)) { f.x = f.fx(p.x, now); f.y = f.fy(p.y, now); }
      return { x: f.x, y: f.y, visibility: vis };
    });
  }

  // Body in faint white, the working limb (arm for push-ups, leg for squats) in glowing red.
  // A counted rep makes the limb flash brighter for a moment.
  let exercise = 'pushup', flashUntil = 0;
  const limbOn = {};
  const BODY = [[11,12],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28],[11,13],[13,15],[12,14],[14,16]];
  const LIMB = { pushup: { left: [11,13,15], right: [12,14,16] }, squat: { left: [23,25,27], right: [24,26,28] } };
  function draw(lm) {
    if (c.width !== v.videoWidth) c.width = v.videoWidth;
    if (c.height !== v.videoHeight) c.height = v.videoHeight;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!lm) return;
    const vis = (i) => (lm[i] && lm[i].visibility) || 0;
    const ok = (i) => vis(i) >= 0.55;
    const P = (i) => [lm[i].x * c.width, lm[i].y * c.height];
    const u = Math.max(c.width, c.height) / 640;
    const sideScore = (ids) => ids.reduce((n, i) => n + vis(i), 0);
    const sides = LIMB[exercise] || LIMB.pushup;
    // From in front of the head both arms are in view: light up both.
    const d = (a, b) => Math.hypot((lm[a].x - lm[b].x) * c.width, (lm[a].y - lm[b].y) * c.height);
    // Same front-view test as the counter: face between the shoulders, or shoulders wide.
    const lo = Math.min(lm[11].x, lm[12].x), hi = Math.max(lm[11].x, lm[12].x), inset = 0.15 * (hi - lo);
    const faceOn = vis(0) >= 0.5 && lm[0].x > lo + inset && lm[0].x < hi - inset;
    const front = exercise === 'pushup' && ok(11) && ok(12) && (faceOn || d(11, 12) >= 0.7 * Math.max(d(11, 13), d(12, 14)));
    // From the front reps are counted on the shoulders, so they glow too; arms only when clearly seen.
    const limbs = front ? [[11, 12], sides.left, sides.right] : [sideScore(sides.left) >= sideScore(sides.right) ? sides.left : sides.right];
    const inLimb = (a, b) => limbs.some((l) => l.includes(a) && l.includes(b));
    // A limb appears once clearly seen and stays until clearly lost, so it doesn't flicker.
    const shown = (limb) => {
      const key = limb.join(','), lo = Math.min(...limb.map(vis));
      limbOn[key] = limbOn[key] ? lo >= 0.45 : lo >= 0.65;
      return limbOn[key];
    };
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 3 * u;
    for (const [a, b] of BODY) {
      if (inLimb(a, b) || !ok(a) || !ok(b)) continue;
      ctx.beginPath(); ctx.moveTo(...P(a)); ctx.lineTo(...P(b)); ctx.stroke();
    }
    const flash = performance.now() < flashUntil;
    for (const limb of limbs) {
      if (!shown(limb)) continue;
      ctx.shadowColor = 'rgba(224,69,74,0.95)'; ctx.shadowBlur = (flash ? 34 : 18) * u;
      ctx.strokeStyle = flash ? '#FF8A8D' : '#FF5A5F'; ctx.lineWidth = (flash ? 9 : 7) * u;
      ctx.beginPath(); ctx.moveTo(...P(limb[0])); for (const i of limb.slice(1)) ctx.lineTo(...P(i)); ctx.stroke();
      ctx.shadowBlur = 0; ctx.fillStyle = '#fff';
      for (const i of limb) { const [x, y] = P(i); ctx.beginPath(); ctx.arc(x, y, 5 * u, 0, Math.PI * 2); ctx.fill(); }
    }
  }
  window.hagoSetExercise = (e) => { exercise = e; };
  window.hagoFlash = () => { flashUntil = performance.now() + 260; };

  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (v.readyState < 2 || v.currentTime === lastVideoTime) return;
    const now = performance.now();
    if (now - lastDetect < DETECT_MS) return;
    lastDetect = now;
    lastVideoTime = v.currentTime;
    const lm = steady(landmarker.detectForVideo(v, now).landmarks[0], now);
    draw(lm);
    post({ t: 'lm', ts: now, lm: lm ? lm.map((p) => [+p.x.toFixed(4), +p.y.toFixed(4), +((p.visibility || 0).toFixed(3))]) : null });
  }

  window.hagoStart = async () => {
    if (running) return;
    try {
      post({ t: 'status', s: 'loading' });
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      v.srcObject = stream;
      await v.play();
      await loadModel();
      running = true;
      post({ t: 'status', s: 'running' });
      loop();
    } catch (e) {
      window.hagoStop();
      post({ t: 'error', name: (e && e.name) || '', msg: String((e && e.message) || e) });
    }
  };

  window.hagoStop = () => {
    running = false;
    cancelAnimationFrame(raf);
    F.length = 0;
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    v.srcObject = null;
    ctx.clearRect(0, 0, c.width, c.height);
  };

  post({ t: 'ready' });
</script>
</body>
</html>`;
