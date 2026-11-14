import { Platform } from 'react-native';

import type { AppId } from '@/core/apps';

/**
 * The OS-level app blocker.
 *
 * Real blocking needs native code that Expo Go cannot load:
 *  - iOS: Screen Time API (FamilyControls + ManagedSettings + DeviceActivity extensions).
 *    Requires the Family Controls (Distribution) entitlement from Apple.
 *  - Android: UsageStatsManager / AccessibilityService + overlay window.
 *
 * Until that native module exists (see docs/NATIVE_BLOCKING.md), every platform uses the
 * simulated blocker below: the app keeps the balance and shows its own block screen, which is
 * exactly what the web build needs anyway.
 */
export interface AppBlocker {
  readonly kind: 'simulated' | 'ios-screentime' | 'android-usage';
  /** Short Korean explanation for the settings screen. */
  readonly description: string;
  requestAuthorization(): Promise<boolean>;
  /** Shield the given apps (balance is zero). */
  lock(apps: AppId[]): Promise<void>;
  /** Lift the shield for `seconds`, then re-lock. */
  unlockFor(apps: AppId[], seconds: number): Promise<void>;
}

const simulated: AppBlocker = {
  kind: 'simulated',
  description:
    Platform.OS === 'web'
      ? '웹 체험판이라 실제 앱은 잠그지 않아요. 잠긴 앱을 누르면 하고봐 안에서 차단 화면과 사용 시간을 보여줘요.'
      : '아직 실제 앱 잠금 모듈이 연결되지 않았어요. 개발 빌드에서 iOS 스크린타임과 안드로이드 사용 기록 권한으로 연결할 예정이에요.',
  async requestAuthorization() {
    return true;
  },
  async lock() {},
  async unlockFor() {},
};

export const blocker: AppBlocker = simulated;
