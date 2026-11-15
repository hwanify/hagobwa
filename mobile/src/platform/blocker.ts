import { Platform } from 'react-native';
import * as ScreenTime from 'react-native-device-activity';

import { usageCheckpoints } from '@/core/timebank';

/**
 * The OS-level app blocker.
 *
 *  - iOS: Screen Time API (FamilyControls + ManagedSettings + DeviceActivity extensions) through
 *    react-native-device-activity. The user picks apps in Apple's picker; we only ever hold opaque
 *    tokens, so the app never learns which apps were chosen.
 *  - Web / Android (for now): simulated. The app keeps the balance and shows its own block screen.
 *
 * How iOS blocking follows the balance:
 *  - balance < 1 min  -> shield the picked apps.
 *  - balance > 0      -> lift the shield and start a usage monitor with checkpoints
 *                        (1, 2, 3 ... min). The last checkpoint re-shields the apps by itself,
 *                        even while 하고봐 is closed. The app reads the checkpoints that fired to
 *                        charge used minutes against the balance (see usedSecondsSince).
 *  - midnight         -> iOS resets usage counters, so the apps are shielded again until the
 *                        app is opened and re-syncs the remaining balance.
 */
export interface AppBlocker {
  readonly kind: 'simulated' | 'ios-screentime';
  /** Short Korean explanation for the settings screen. */
  readonly description: string;
  requestAuthorization(): Promise<boolean>;
  /** Whether the user already picked apps in the OS picker (always true when simulated). */
  hasSelection(): boolean;
  /** Seconds of usage the OS reported since `since` (0 when simulated). */
  usedSecondsSince(since: number): number;
  /** Shield or unshield to match the balance. */
  apply(balanceSec: number): Promise<void>;
}

/** familyActivitySelectionId shared with the picker views. */
export const SELECTION_ID = 'hagobwa.locked';
const ACTIVITY = 'hagobwa.usage';
const EVENT_PREFIX = 'used_';

const simulated: AppBlocker = {
  kind: 'simulated',
  description:
    Platform.OS === 'web'
      ? '웹 체험판이라 실제 앱은 잠그지 않아요. 잠긴 앱을 누르면 하고봐 안에서 차단 화면과 사용 시간을 보여줘요.'
      : '이 기기에서는 아직 실제 앱 잠금이 연결되지 않았어요. 하고봐 안에서 차단 화면과 사용 시간을 보여줘요.',
  async requestAuthorization() {
    return true;
  },
  hasSelection: () => true,
  usedSecondsSince: () => 0,
  async apply() {},
};

const RED = { red: 224, green: 69, blue: 74 };
const WHITE = { red: 255, green: 255, blue: 255 };

function selection() {
  return { activitySelectionId: SELECTION_ID } as const;
}

let shieldReady = false;
function ensureShield() {
  if (shieldReady) return;
  ScreenTime.updateShield(
    {
      backgroundColor: RED,
      backgroundBlurStyle: undefined,
      title: '지금은 잠겨 있어요',
      titleColor: WHITE,
      subtitle: '하고봐에서 푸시업이나 스쿼트로\n시간을 충전하면 열려요.',
      subtitleColor: { ...WHITE, alpha: 0.85 },
      iconSystemName: 'lock.fill',
      iconTint: WHITE,
      primaryButtonLabel: '닫기',
      primaryButtonLabelColor: RED,
      primaryButtonBackgroundColor: WHITE,
    },
    { primary: { behavior: 'close' } },
  );
  shieldReady = true;
}

const screenTime: AppBlocker = {
  kind: 'ios-screentime',
  description: '스크린타임으로 고른 앱을 잠가요. 충전한 시간만큼 열리고, 다 쓰면 하고봐를 닫아 둬도 다시 잠겨요.',

  async requestAuthorization() {
    try {
      if (ScreenTime.getAuthorizationStatus() === ScreenTime.AuthorizationStatus.approved) return true;
      await ScreenTime.requestAuthorization('individual');
      return ScreenTime.getAuthorizationStatus() === ScreenTime.AuthorizationStatus.approved;
    } catch {
      return false;
    }
  },

  hasSelection() {
    const token = ScreenTime.getFamilyActivitySelectionId(SELECTION_ID);
    if (!token) return false;
    const meta = ScreenTime.activitySelectionMetadata({ activitySelectionToken: token });
    return !!meta && meta.applicationCount + meta.categoryCount + meta.webDomainCount > 0;
  },

  usedSecondsSince(since) {
    let maxMin = 0;
    for (const e of ScreenTime.getEvents(ACTIVITY)) {
      if (e.callbackName !== 'eventDidReachThreshold' || !e.eventName?.startsWith(EVENT_PREFIX)) continue;
      if (new Date(e.lastCalledAt).getTime() < since) continue;
      maxMin = Math.max(maxMin, Number(e.eventName.slice(EVENT_PREFIX.length)) || 0);
    }
    return maxMin * 60;
  },

  async apply(balanceSec) {
    const token = ScreenTime.getFamilyActivitySelectionId(SELECTION_ID);
    if (!token || ScreenTime.getAuthorizationStatus() !== ScreenTime.AuthorizationStatus.approved) return;
    ensureShield();
    ScreenTime.stopMonitoring([ACTIVITY]);
    ScreenTime.cleanUpAfterActivity(ACTIVITY);

    const marks = usageCheckpoints(balanceSec);
    if (marks.length === 0) {
      ScreenTime.blockSelection(selection(), 'hagobwa:empty');
      return;
    }

    const last = marks[marks.length - 1];
    ScreenTime.configureActions({
      activityName: ACTIVITY,
      callbackName: 'eventDidReachThreshold',
      eventName: `${EVENT_PREFIX}${last}`,
      actions: [{ type: 'blockSelection', familyActivitySelectionId: SELECTION_ID }],
    });
    ScreenTime.configureActions({
      activityName: ACTIVITY,
      callbackName: 'intervalDidEnd',
      actions: [{ type: 'blockSelection', familyActivitySelectionId: SELECTION_ID }],
    });

    ScreenTime.unblockSelection(selection(), 'hagobwa:charged');
    await ScreenTime.startMonitoring(
      ACTIVITY,
      { intervalStart: { hour: 0, minute: 0, second: 0 }, intervalEnd: { hour: 23, minute: 59, second: 59 }, repeats: true },
      marks.map((m) => ({
        eventName: `${EVENT_PREFIX}${m}`,
        familyActivitySelection: token,
        threshold: { hour: Math.floor(m / 60), minute: m % 60 },
        includesPastActivity: false,
      })),
    );
  },
};

function pick(): AppBlocker {
  if (Platform.OS !== 'ios') return simulated;
  try {
    return ScreenTime.isAvailable() ? screenTime : simulated;
  } catch {
    return simulated;
  }
}

export const blocker: AppBlocker = pick();
