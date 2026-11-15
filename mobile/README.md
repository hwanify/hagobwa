# 하고봐 앱 (Expo)

운동한 만큼 폰 시간이 충전되는 스크린타임 앱. Expo SDK 58 + Expo Router + TypeScript.

## 실행

```bash
npm install
npm run web          # 브라우저에서 바로 실행 (웹캠 자동 세기 포함)
npm start            # Expo Go / 개발 빌드용 개발 서버
npm test             # 핵심 로직 테스트 (vitest)
npm run typecheck
npm run export:web   # dist/ 에 정적 웹 빌드
```

## 구조

```
src/
  app/                  화면 (Expo Router, 파일 = 화면)
    (tabs)/             홈 · 크루 · 기록 · 설정 (+ 가운데 운동 버튼)
    onboarding.tsx      목표 시간 → 잠글 앱 → 권한 → 첫 충전
    workout.tsx         운동 (카메라 자동 세기 / 탭 세기, 한국어 구령)
    done.tsx            충전 완료 + 인증 카드 공유
    blocked.tsx         차단 화면 (운동하고 보기 / 비상 해제)
    session.tsx         잠긴 앱 사용 중 (잔고 차감)
  core/                 화면과 무관한 순수 로직 (테스트 대상)
    rates.ts            운동 → 시간 환율, 난이도
    timebank.ts         잔고, 사용 차감, 비상 해제, 연속 기록, 주간 통계
    repCounter.ts       포즈 관절 각도로 횟수 세기 (부정행위 방지 포함)
    voice.ts            구령 (기본 / 조교 / PT쌤 / 엄마)
  features/pose/        PoseCamera.web.tsx (MediaPipe 웹캠), PoseCamera.tsx (네이티브 자리)
  platform/             blocker.ts (OS 앱 잠금 인터페이스), feedback.ts (음성, 진동)
  store/app-store.ts    zustand + AsyncStorage 저장
```

## 지금 되는 것 / 아직 안 되는 것

| 기능 | 상태 |
|---|---|
| 온보딩, 잔고, 충전, 차단 화면, 비상 해제, 기록, 설정 | 완료 (웹/앱 공통) |
| 웹캠 자동 횟수 세기 (푸시업, 스쿼트) | 웹 완료 |
| 한국어 음성 구령, 진동 | 완료 |
| 실제 다른 앱 잠그기 (iOS 스크린타임, 안드로이드) | 네이티브 모듈 필요. `../docs/NATIVE_BLOCKING.md` |
| 폰 카메라 자동 세기 | WebView + MediaPipe (첫 실행 때 모델 다운로드, 실기기 확인 필요) |
| 크루 (친구 랭킹) | 서버 필요, 지금은 예시 데이터 |
