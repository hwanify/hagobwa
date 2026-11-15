/**
 * Page loaded inside the native WebView: front camera + MediaPipe Pose Landmarker.
 * It only detects joints and draws the skeleton; counting happens in React Native
 * (RepCounter), so web and phone share one tested implementation.
 *
 * Protocol (postMessage JSON):
 *   page -> app: {t:'ready'} | {t:'status', s} | {t:'error', name, msg} | {t:'lm', ts, lm: [[x,y,vis]x33] | null}
 *   app -> page: window.hagoStart(), window.hagoStop()
 */
const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

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
  const LINKS = [[11,12],[11,13],[13,15],[12,14],[14,16],[11,23],[12,24],[23,24],[23,25],[25,27],[24,26],[26,28]];
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

  // Minimal stick figure: just enough to see that a person is detected.
  function draw(lm) {
    if (c.width !== v.videoWidth) c.width = v.videoWidth;
    if (c.height !== v.videoHeight) c.height = v.videoHeight;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!lm) return;
    const ok = (i) => ((lm[i] && lm[i].visibility) || 0) >= 0.4;
    const P = (i) => [lm[i].x * c.width, lm[i].y * c.height];
    const mid = (a, b) => [(lm[a].x + lm[b].x) / 2 * c.width, (lm[a].y + lm[b].y) / 2 * c.height];
    const line = (p, q) => { ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke(); };
    ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = 'rgba(224,69,74,0.9)';
    for (const [a, b] of LINKS) if (ok(a) && ok(b)) line(P(a), P(b));
    if (ok(0) && ok(11) && ok(12)) {
      const r = Math.hypot((lm[11].x - lm[12].x) * c.width, (lm[11].y - lm[12].y) * c.height) * 0.3;
      ctx.beginPath(); ctx.arc(lm[0].x * c.width, lm[0].y * c.height, Math.max(10, r), 0, Math.PI * 2); ctx.stroke();
      line(mid(11, 12), P(0));
    }
  }

  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (v.readyState < 2 || v.currentTime === lastVideoTime) return;
    const now = performance.now();
    if (now - lastDetect < DETECT_MS) return;
    lastDetect = now;
    lastVideoTime = v.currentTime;
    const lm = landmarker.detectForVideo(v, now).landmarks[0];
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
    if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; }
    v.srcObject = null;
    ctx.clearRect(0, 0, c.width, c.height);
  };

  post({ t: 'ready' });
</script>
</body>
</html>`;
