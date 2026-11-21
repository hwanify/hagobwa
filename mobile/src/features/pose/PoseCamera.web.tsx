import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { T } from '@/components/ui';
import { HINT_TEXT, RepCounter, type Landmark } from '@/core/repCounter';
import { colors, font } from '@/theme';

import type { PoseCameraProps } from './types';

const MP_VERSION = '0.10.14';
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

const LINKS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24],
  [23, 24], [23, 25], [25, 27], [24, 26], [26, 28],
];

type Status = 'idle' | 'loading' | 'running' | 'error';

interface Landmarker {
  detectForVideo(video: HTMLVideoElement, ts: number): { landmarks: Landmark[][] };
  close(): void;
}

/**
 * Browser rep counter: webcam + MediaPipe Pose Landmarker, all on-device.
 * Frames never leave the browser.
 */
export default function PoseCamera({ exercise, onRep, fill = false }: PoseCameraProps & { fill?: boolean }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const counterRef = useRef(new RepCounter(exercise));
  const onRepRef = useRef(onRep);
  const [status, setStatus] = useState<Status>('idle');
  const [hint, setHint] = useState('');
  const [angle, setAngle] = useState<number | null>(null);

  useEffect(() => {
    onRepRef.current = onRep;
  }, [onRep]);
  useEffect(() => {
    counterRef.current.setExercise(exercise);
  }, [exercise]);
  useEffect(() => () => stopRef.current?.(), []);

  async function start() {
    if (status === 'loading' || status === 'running') return;
    setStatus('loading');
    setHint('카메라와 자세 인식 모델을 불러오는 중');
    let stream: MediaStream | null = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) throw new Error('video element missing');
      video.srcObject = stream;
      await video.play();

      const vision = await import('@mediapipe/tasks-vision');
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_BASE);
      const make = (delegate: 'GPU' | 'CPU') =>
        vision.PoseLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: MODEL_URL, delegate },
          runningMode: 'VIDEO',
          numPoses: 1,
        }) as unknown as Promise<Landmarker>;
      let landmarker: Landmarker;
      try {
        landmarker = await make('GPU');
      } catch {
        landmarker = await make('CPU');
      }

      const ctx = canvas.getContext('2d');
      counterRef.current.reset();
      let raf = 0;
      let lastVideoTime = -1;
      let lastUi = 0;
      let lastDetect = 0;

      const loop = () => {
        raf = requestAnimationFrame(loop);
        if (video.readyState < 2 || video.currentTime === lastVideoTime) return;
        const now = performance.now();
        if (now - lastDetect < 55) return; // ~18 fps is plenty and keeps it light
        lastDetect = now;
        lastVideoTime = video.currentTime;
        const lm = landmarker.detectForVideo(video, now).landmarks[0];
        if (ctx) draw(ctx, canvas, video, lm);
        const u = counterRef.current.update(lm, now);
        if (u.repCompleted) onRepRef.current();
        if (now - lastUi > 150) {
          lastUi = now;
          setAngle(u.angle === null ? null : Math.round(u.angle));
          setHint(HINT_TEXT[u.hint] || (u.phase === 'down' ? '좋아요, 올라오세요' : '천천히 내려가세요'));
        }
      };
      raf = requestAnimationFrame(loop);

      const s = stream;
      stopRef.current = () => {
        cancelAnimationFrame(raf);
        s.getTracks().forEach((t) => t.stop());
        landmarker.close();
        video.srcObject = null;
        stopRef.current = null;
      };
      setStatus('running');
    } catch (err) {
      stream?.getTracks().forEach((t) => t.stop());
      setStatus('error');
      const name = err instanceof DOMException ? err.name : '';
      setHint(
        name === 'NotAllowedError'
          ? '카메라 권한이 거절됐어요. 아래 탭 버튼으로 세어도 돼요.'
          : '이 기기에서는 카메라 인식을 쓸 수 없어요. 탭 버튼으로 세어 주세요.',
      );
    }
  }

  function stop() {
    stopRef.current?.();
    setStatus('idle');
    setHint('');
    setAngle(null);
  }

  return (
    <View style={[styles.frame, fill && styles.fill]}>
      <video ref={videoRef} playsInline muted style={mediaStyle} />
      <canvas ref={canvasRef} style={mediaStyle} />
      {status !== 'running' ? (
        <View style={styles.overlay}>
          <Pressable accessibilityRole="button" onPress={start} disabled={status === 'loading'} style={styles.startBtn}>
            <T style={styles.startText}>{status === 'loading' ? '준비 중...' : '카메라로 세기'}</T>
          </Pressable>
          <T style={styles.overlayNote}>{hint || '영상은 저장도 전송도 하지 않아요.'}</T>
        </View>
      ) : (
        <View style={styles.bar}>
          <T style={styles.barText} numberOfLines={1}>{hint}</T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {angle !== null && <T style={styles.angle}>{angle}°</T>}
            <Pressable accessibilityRole="button" onPress={stop} style={styles.offBtn}>
              <T style={styles.offText}>끄기</T>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

/** Minimal stick figure: just enough to see that a person is detected. */
function draw(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, video: HTMLVideoElement, lm?: Landmark[]) {
  if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
  if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!lm) return;
  const W = canvas.width;
  const H = canvas.height;
  const ok = (i: number) => (lm[i]?.visibility ?? 0) >= 0.4;
  const P = (i: number): [number, number] => [lm[i].x * W, lm[i].y * H];
  const line = (p: [number, number], q: [number, number]) => {
    ctx.beginPath();
    ctx.moveTo(p[0], p[1]);
    ctx.lineTo(q[0], q[1]);
    ctx.stroke();
  };
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(224,69,74,0.9)';
  for (const [a, b] of LINKS) if (ok(a) && ok(b)) line(P(a), P(b));
  if (ok(0) && ok(11) && ok(12)) {
    const r = Math.hypot((lm[11].x - lm[12].x) * W, (lm[11].y - lm[12].y) * H) * 0.3;
    ctx.beginPath();
    ctx.arc(lm[0].x * W, lm[0].y * H, Math.max(10, r), 0, Math.PI * 2);
    ctx.stroke();
    line([((lm[11].x + lm[12].x) / 2) * W, ((lm[11].y + lm[12].y) / 2) * H], P(0));
  }
}

const mediaStyle: React.CSSProperties = {
  position: 'absolute',
  inset: 0,
  width: '100%',
  height: '100%',
  objectFit: 'cover',
  transform: 'scaleX(-1)',
};

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 4 / 3, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.ink },
  /** Take the height the parent gives instead of a fixed aspect ratio. */
  fill: { flex: 1, aspectRatio: undefined, minHeight: 200 },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20 },
  startBtn: { backgroundColor: colors.paper, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  startText: { fontWeight: '700', fontSize: 14 },
  overlayNote: { color: 'rgba(247,247,243,0.7)', fontSize: 12, textAlign: 'center' },
  bar: {
    position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: 'rgba(22,24,27,0.75)',
  },
  barText: { color: colors.paper, fontSize: 12, fontWeight: '600', flex: 1 },
  angle: { color: 'rgba(247,247,243,0.7)', fontSize: 11, fontFamily: font.mono },
  offBtn: { backgroundColor: 'rgba(247,247,243,0.15)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  offText: { color: colors.paper, fontSize: 11, fontWeight: '700' },
});

