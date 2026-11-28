import { useCallback, useEffect, useRef, useState, type ComponentType, type Ref } from 'react';
import { PermissionsAndroid, Platform, Pressable, StyleSheet, View } from 'react-native';
import { WebView, type WebViewMessageEvent, type WebViewProps } from 'react-native-webview';

import { T } from '@/components/ui';
import { HINT_TEXT, RepCounter, type Landmark } from '@/core/repCounter';
import { tapFeedback } from '@/platform/feedback';
import { colors, font } from '@/theme';

import { POSE_HTML } from './pose-html';
import type { CameraStatus, PoseCameraProps } from './types';

type Status = CameraStatus;

const GUIDE: Record<PoseCameraProps['exercise'], string> = {
  pushup:
    '폰을 손 앞 바닥에 세워 두고, 엎드렸을 때 머리와 양손이 다 보이게 해주세요 (옆에서 찍어도 돼요). 팔을 펴고 잠깐 멈추면 세기 시작해요. 무리하지 말고, 아프면 멈추세요. 영상은 저장하지 않아요.',
  squat:
    '폰을 두세 걸음 앞에 세워 두고, 머리부터 발끝까지 다 보이게 서 주세요 (옆이나 비스듬히 찍어도 돼요). 바로 서서 잠깐 멈추면 세기 시작해요. 무리하지 말고, 아프면 멈추세요. 영상은 저장하지 않아요.',
};

// react-native-webview's class typings resolve to `never` props under React 19 types; give it explicit ones.
const CameraWebView = WebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebView> }>;

type Msg =
  | { t: 'ready' }
  | { t: 'status'; s: 'loading' | 'running' }
  | { t: 'error'; name: string; msg: string }
  | { t: 'lm'; ts: number; lm: [number, number, number][] | null };

/**
 * Phone rep counter.
 *
 * Camera + MediaPipe Pose run inside a WebView (the same model the web build uses);
 * it posts joint positions back here and the shared, unit-tested RepCounter counts reps.
 * Video stays on the device. The model (~6 MB) downloads once and is then cached.
 */
export default function PoseCamera({ exercise, onRep, autoStart = false, onStatus, fill = false }: PoseCameraProps & { fill?: boolean }) {
  const webRef = useRef<WebView>(null);
  const counterRef = useRef(new RepCounter(exercise));
  const onRepRef = useRef(onRep);
  const exerciseRef = useRef(exercise);
  exerciseRef.current = exercise;
  const readyRef = useRef(false);
  const pendingStartRef = useRef(false);
  const lastUiRef = useRef(0);
  const setReadyRef = useRef(false);
  const [status, setStatus] = useState<Status>('idle');
  const [hint, setHint] = useState('');
  const [angle, setAngle] = useState<number | null>(null);

  useEffect(() => {
    onRepRef.current = onRep;
  }, [onRep]);
  useEffect(() => {
    counterRef.current.setExercise(exercise);
    inject(`window.hagoSetExercise && window.hagoSetExercise('${exercise}')`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exercise]);

  const inject = (js: string) => webRef.current?.injectJavaScript(`${js};true;`);

  useEffect(() => () => inject('window.hagoStop && window.hagoStop()'), []);

  const start = async () => {
    if (status === 'loading' || status === 'running') return;
    if (Platform.OS === 'android') {
      const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.CAMERA);
      if (res !== PermissionsAndroid.RESULTS.GRANTED) {
        setStatus('error');
        setHint('카메라 권한이 필요해요. 아래 탭 버튼으로 세어도 돼요.');
        return;
      }
    }
    counterRef.current.reset();
    setReadyRef.current = false;
    inject('window.hagoSetReady && window.hagoSetReady(false)');
    setStatus('loading');
    setHint('카메라와 자세 인식 모델을 불러오는 중');
    if (readyRef.current) inject('window.hagoStart()');
    else pendingStartRef.current = true;
  };

  useEffect(() => {
    onStatus?.(status);
  }, [onStatus, status]);
  useEffect(() => {
    // The page may still be loading: start() then waits for its 'ready' message.
    if (autoStart) void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stop = () => {
    inject('window.hagoStop()');
    setStatus('idle');
    setHint('');
    setAngle(null);
  };

  const onMessage = useCallback((e: WebViewMessageEvent) => {
    let msg: Msg;
    try {
      msg = JSON.parse(e.nativeEvent.data) as Msg;
    } catch {
      return;
    }
    switch (msg.t) {
      case 'ready':
        readyRef.current = true;
        webRef.current?.injectJavaScript(`window.hagoSetExercise('${exerciseRef.current}');true;`);
        if (pendingStartRef.current) {
          pendingStartRef.current = false;
          webRef.current?.injectJavaScript('window.hagoStart();true;');
        }
        return;
      case 'status':
        setStatus(msg.s);
        if (msg.s === 'running') setHint('');
        return;
      case 'error':
        setStatus('error');
        setHint(
          msg.name === 'NotAllowedError'
            ? '카메라 권한이 꺼져 있어요. 설정 > 하고봐 > 카메라를 켜주세요.'
            : msg.name === 'NotFoundError'
              ? '카메라를 찾을 수 없어요. 탭 버튼으로 세어 주세요.'
              : '자세 인식을 시작하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.',
        );
        return;
      case 'lm': {
        // Counting waits for the start position (plank / standing), see RepCounter.
        const lm: Landmark[] | undefined = msg.lm?.map(([x, y, visibility]) => ({ x, y, visibility }));
        const u = counterRef.current.update(lm, msg.ts);
        if (u.ready !== setReadyRef.current) {
          // Counting starts (or pauses): the lines turn red (or white), and a tap says "go".
          setReadyRef.current = u.ready;
          webRef.current?.injectJavaScript(`window.hagoSetReady && window.hagoSetReady(${u.ready});true;`);
          if (u.ready) tapFeedback();
        }
        if (u.repCompleted) {
          onRepRef.current();
          webRef.current?.injectJavaScript('window.hagoFlash && window.hagoFlash();true;');
        }
        if (msg.ts - lastUiRef.current > 150) {
          lastUiRef.current = msg.ts;
          setAngle(u.angle === null ? null : Math.round(u.angle));
          setHint(HINT_TEXT[u.hint] || (u.phase === 'down' ? '좋아요, 올라오세요' : '천천히 내려가세요'));
        }
        return;
      }
    }
  }, []);

  return (
    <View style={[styles.frame, fill && styles.fill]}>
      <CameraWebView
        ref={webRef}
        source={{ html: POSE_HTML, baseUrl: 'https://hagobwa.app/' }}
        originWhitelist={['*']}
        onMessage={onMessage}
        javaScriptEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        mediaCapturePermissionGrantType="grant"
        scrollEnabled={false}
        bounces={false}
        style={styles.web}
        containerStyle={styles.web}
      />
      {status !== 'running' ? (
        <View style={styles.overlay}>
          <Pressable accessibilityRole="button" onPress={start} disabled={status === 'loading'} style={styles.startBtn}>
            <T style={styles.startText}>{status === 'loading' ? '준비 중...' : '카메라로 세기'}</T>
          </Pressable>
          <T style={styles.overlayNote}>{hint || GUIDE[exercise]}</T>
        </View>
      ) : (
        <View style={styles.bar}>
          <T style={styles.barText} numberOfLines={1}>
            {hint}
          </T>
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

const styles = StyleSheet.create({
  frame: { width: '100%', aspectRatio: 3 / 4, borderRadius: 18, overflow: 'hidden', backgroundColor: colors.ink },
  /** Take the height the parent gives instead of a fixed aspect ratio. */
  fill: { flex: 1, aspectRatio: undefined, minHeight: 200 },
  web: { flex: 1, backgroundColor: colors.ink },
  overlay: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 20, backgroundColor: 'rgba(22,24,27,0.55)' },
  startBtn: { backgroundColor: colors.paper, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 10 },
  startText: { fontWeight: '700', fontSize: 14 },
  overlayNote: { color: 'rgba(247,247,243,0.8)', fontSize: 12, textAlign: 'center', lineHeight: 18 },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(22,24,27,0.75)',
  },
  barText: { color: colors.paper, fontSize: 12, fontWeight: '600', flex: 1 },
  angle: { color: 'rgba(247,247,243,0.7)', fontSize: 11, fontFamily: font.mono },
  offBtn: { backgroundColor: 'rgba(247,247,243,0.15)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  offText: { color: colors.paper, fontSize: 11, fontWeight: '700' },
});
