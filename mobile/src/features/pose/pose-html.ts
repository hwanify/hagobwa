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
  let stream = null, landmarker = null, raf = 0, lastVideoTime = -1, lastPost = 0, running = false;

  async function loadModel() {
    if (landmarker) return landmarker;
    const vision = await import('${MP}/vision_bundle.mjs');
    const files = await vision.FilesetResolver.forVisionTasks('${MP}/wasm');
    const opts = (delegate) => ({ baseOptions: { modelAssetPath: '${MODEL}', delegate }, runningMode: 'VIDEO', numPoses: 1 });
    try { landmarker = await vision.PoseLandmarker.createFromOptions(files, opts('GPU')); }
    catch (e) { landmarker = await vision.PoseLandmarker.createFromOptions(files, opts('CPU')); }
    return landmarker;
  }

  function draw(lm) {
    if (c.width !== v.videoWidth) c.width = v.videoWidth;
    if (c.height !== v.videoHeight) c.height = v.videoHeight;
    ctx.clearRect(0, 0, c.width, c.height);
    if (!lm) return;
    const vis = (i) => (lm[i] && lm[i].visibility) || 0;
    ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.strokeStyle = '#E0454A';
    for (const [a, b] of LINKS) {
      if (vis(a) < 0.4 || vis(b) < 0.4) continue;
      ctx.beginPath();
      ctx.moveTo(lm[a].x * c.width, lm[a].y * c.height);
      ctx.lineTo(lm[b].x * c.width, lm[b].y * c.height);
      ctx.stroke();
    }
    ctx.fillStyle = '#F7F7F3';
    for (let i = 11; i <= 28; i++) {
      if (vis(i) < 0.4) continue;
      ctx.beginPath(); ctx.arc(lm[i].x * c.width, lm[i].y * c.height, 6, 0, Math.PI * 2); ctx.fill();
    }
  }

  function loop() {
    if (!running) return;
    raf = requestAnimationFrame(loop);
    if (v.readyState < 2 || v.currentTime === lastVideoTime) return;
    lastVideoTime = v.currentTime;
    const now = performance.now();
    const lm = landmarker.detectForVideo(v, now).landmarks[0];
    draw(lm);
    if (now - lastPost < 45) return;
    lastPost = now;
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
