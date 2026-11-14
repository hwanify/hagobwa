# 실제 앱 잠금 구현 계획 (네이티브)

웹/Expo Go 에서는 `mobile/src/platform/blocker.ts` 의 시뮬레이션 잠금을 씁니다.
실제로 유튜브·인스타를 잠그려면 아래 네이티브 모듈을 Expo Module 로 만들어 같은 `AppBlocker` 인터페이스에 연결합니다.

```ts
interface AppBlocker {
  requestAuthorization(): Promise<boolean>;
  lock(apps: AppId[]): Promise<void>;          // 잔고 0 → 잠금
  unlockFor(apps: AppId[], seconds: number): Promise<void>; // 충전 시간만큼 해제 후 자동 재잠금
}
```

## iOS: Screen Time API

| 구성 | 역할 |
|---|---|
| FamilyControls | `AuthorizationCenter.shared.requestAuthorization(for: .individual)` 권한, `FamilyActivityPicker` 로 잠글 앱 선택 (번들 ID 대신 토큰) |
| ManagedSettings | `ManagedSettingsStore().shield.applications = tokens` 로 잠금 |
| DeviceActivity (확장) | 해제 시간 스케줄. 끝나면 `intervalDidEnd` 에서 다시 잠금 |
| ShieldConfiguration (확장) | 차단 화면 문구 "푸시업 10개면 10분" 커스텀 |
| ShieldAction (확장) | 차단 화면 버튼. 앱을 직접 열 수 없어서 로컬 알림으로 하고봐를 열게 유도 |

- **가장 먼저 할 일:** Apple Developer 에서 Family Controls (Distribution) entitlement 신청. 승인 전에는 TestFlight/스토어 배포 불가.
- 앱과 확장 사이 공유: App Group (`group.com.hagobwa.app`) 의 UserDefaults 에 잔고/선택 토큰 저장.
- Expo 에서는 config plugin 으로 확장 타깃을 추가합니다 (`ios/` 는 직접 수정하지 않음).

## Android

| 방법 | 장단점 |
|---|---|
| UsageStatsManager 폴링 + 오버레이(SYSTEM_ALERT_WINDOW) | 정책상 안전한 편. 감지가 1초 정도 늦음 |
| AccessibilityService | 즉시 감지. Google Play 접근성 정책 신고와 앱 내 고지 필수 |

- 1차는 UsageStats + 포그라운드 서비스 + 오버레이로 시작.
- 삼성 배터리 최적화가 서비스를 죽이므로 온보딩에 "배터리 최적화 제외" 안내 화면 추가.
- 앱 식별은 `mobile/src/core/apps.ts` 의 `androidPackage` 사용.

## 폰 카메라 자동 세기

- `react-native-vision-camera` + 포즈 모델 (MediaPipe Pose 또는 ML Kit Pose) frame processor.
- 관절 좌표만 `RepCounter` (`mobile/src/core/repCounter.ts`) 에 넣으면 웹과 같은 세기 로직이 그대로 동작.

## 테스트 순서 (폰 없이 할 수 있는 것 먼저)

1. 웹에서 전체 흐름 확인 (지금 가능)
2. EAS 클라우드 빌드로 안드로이드 개발 빌드 생성 (`npx eas-cli build --profile development --platform android`)
3. 휴가/외출 때 실제 폰에 설치해서 잠금·배터리 이슈 확인
