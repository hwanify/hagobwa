import { Asset } from 'expo-asset';
import * as Updates from 'expo-updates';
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
  /** Shield or unshield to match the balance. `reps10` = push-ups that earn 10 minutes. */
  apply(balanceSec: number, reps10?: number): Promise<void>;
  /** One-line status for bug reports (empty when simulated). */
  diagnose(): string;
}

/** familyActivitySelectionId shared with the picker views. */
export const SELECTION_ID = 'hagobwa.locked';
const ACTIVITY = 'hagobwa.usage';
/** No underscores: the library splits stored event keys on '_'. */
const EVENT_PREFIX = 'm';
/** iOS sometimes fires usage events right after monitoring starts; ignore anything that early. */
const EARLY_MS = 30_000;

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
  diagnose: () => '',
};

// 하고봐 palette (src/theme): paper background, ink text, red accent.
const RED = { red: 224, green: 69, blue: 74 };
const PAPER = { red: 247, green: 247, blue: 243 };
const INK = { red: 28, green: 28, blue: 26 };
const MUTE = { red: 112, green: 112, blue: 106 };
const WHITE = { red: 255, green: 255, blue: 255 };
const ICON_FILE = 'hagobwa-shield-zero.png';

function selection() {
  return { activitySelectionId: SELECTION_ID } as const;
}

/** Copy the app icon into the shared App Group folder so the shield extension can show it. */
async function prepareShieldIcon(): Promise<boolean> {
  try {
    const asset = Asset.fromModule(require('../../assets/images/shield-zero.png'));
    await asset.downloadAsync();
    const dir = ScreenTime.getAppGroupFileDirectory();
    if (!asset.localUri || !dir) return false;
    ScreenTime.copyFile(asset.localUri, `${dir.replace(/\/?$/, '/')}${ICON_FILE}`, true);
    return true;
  } catch {
    return false;
  }
}

let shieldReps = -1;
/** L-4 lock screen: paper background, a big red "0분", and a pointer to the home screen widget. */
async function ensureShield(reps10: number) {
  if (shieldReps === reps10) return;
  shieldReps = reps10;
  const hasIcon = await prepareShieldIcon();
  ScreenTime.updateShield(
    {
      // Opaque paper with a light blur so no coloured edge shows in the app switcher.
      backgroundColor: PAPER,
      backgroundBlurStyle: ScreenTime.UIBlurEffectStyle.extraLight,
      // iOS fills in the app name at display time, so keep it away from Korean particles.
      title: '지금은 잠겨 있어요',
      titleColor: INK,
      subtitle: `{applicationOrDomainDisplayName} · 푸시업 ${reps10}개면 10분 열려요.\n홈 화면 하고봐 위젯을 눌러 주세요.`,
      subtitleColor: MUTE,
      ...(hasIcon ? { iconAppGroupRelativePath: ICON_FILE } : { iconSystemName: 'lock.fill', iconTint: RED }),
      primaryButtonLabel: '확인',
      primaryButtonLabelColor: WHITE,
      primaryButtonBackgroundColor: INK,
    },
    { primary: { behavior: 'close' } },
  );
}

const screenTime: AppBlocker = {
  kind: 'ios-screentime',
  diagnose: () => '',
  description: '스크린타임으로 고른 앱을 잠가요. 충전한 시간만큼 열리고, 다 쓰면 하고봐를 닫아 둬도 다시 잠겨요.',

  async requestAuthorization() {
    try {
      if (ScreenTime.getAuthorizationStatus() === ScreenTime.AuthorizationStatus.approved) {
        return true;
      }
      await ScreenTime.requestAuthorization('individual');
      const ok = ScreenTime.getAuthorizationStatus() === ScreenTime.AuthorizationStatus.approved;
      return ok;
    } catch {
      return false;
    }
  },

  hasSelection() {
    const token = ScreenTime.getFamilyActivitySelectionId(SELECTION_ID);
    if (!token) return false;
    const meta = ScreenTime.activitySelectionMetadata({ activitySelectionToken: token });
    return !!meta && (meta.applicationCount ?? 0) + (meta.categoryCount ?? 0) + (meta.webDomainCount ?? 0) > 0;
  },

  usedSecondsSince(since) {
    let maxMin = 0;
    for (const e of ScreenTime.getEvents(ACTIVITY)) {
      if (e.callbackName !== 'eventDidReachThreshold' || !e.eventName?.startsWith(EVENT_PREFIX)) continue;
      const min = Number(e.eventName.slice(EVENT_PREFIX.length)) || 0;
      // N minutes of use can't be reached sooner than N minutes after the monitor started.
      if (new Date(e.lastCalledAt).getTime() < since + min * 60_000 - EARLY_MS) continue;
      maxMin = Math.max(maxMin, min);
    }
    return maxMin * 60;
  },

  async apply(balanceSec, reps10 = 10) {
    if (ScreenTime.getAuthorizationStatus() !== ScreenTime.AuthorizationStatus.approved) return;
    const token = ScreenTime.getFamilyActivitySelectionId(SELECTION_ID);
    await ensureShield(reps10);
    ScreenTime.stopMonitoring([ACTIVITY]);
    ScreenTime.cleanUpAfterActivity(ACTIVITY);
    // Start from a clean slate so apps removed from the selection don't stay shielded.
    ScreenTime.resetBlocks('hagobwa:sync');
    if (!token || !this.hasSelection()) return;

    const marks = usageCheckpoints(balanceSec);
    if (marks.length === 0) {
      ScreenTime.blockSelection(selection(), 'hagobwa:empty');
      return;
    }

    const now = Date.now();
    const last = marks[marks.length - 1];
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    ScreenTime.configureActions({
      activityName: ACTIVITY,
      callbackName: 'eventDidReachThreshold',
      eventName: `${EVENT_PREFIX}${last}`,
      actions: [
        {
          type: 'blockSelection',
          familyActivitySelectionId: SELECTION_ID,
          neverTriggerBefore: new Date(now + last * 60_000 - EARLY_MS),
        },
      ],
    });
    // stopMonitoring() above also reports intervalDidEnd, so only honour the real one at midnight.
    ScreenTime.configureActions({
      activityName: ACTIVITY,
      callbackName: 'intervalDidEnd',
      actions: [
        {
          type: 'blockSelection',
          familyActivitySelectionId: SELECTION_ID,
          neverTriggerBefore: new Date(midnight.getTime() - 120_000),
        },
      ],
    });

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

function safe<T>(f: () => T, fallback: T): T {
  try {
    return f();
  } catch {
    return fallback;
  }
}

screenTime.diagnose = () => {
  const auth = safe(() => ScreenTime.getAuthorizationStatus(), -1);
  const token = safe(() => ScreenTime.getFamilyActivitySelectionId(SELECTION_ID), undefined);
  const meta = safe(() => ScreenTime.activitySelectionMetadata({ activitySelectionId: SELECTION_ID }), undefined);
  const picked = `${meta ? `${meta.applicationCount}/${meta.categoryCount}/${meta.webDomainCount}` : '?'} 토큰${token ? token.length : '없음'}`;
  const shield = safe(() => (ScreenTime.isShieldActive() ? '켜짐' : '꺼짐'), '?');
  const monitors = safe(() => ScreenTime.getActivities().length, -1);
  const last = safe(
    () => ScreenTime.userDefaultsGet<{ triggeredBy?: string; blockedAt?: string; blocklistAppCount?: number }>('lastBlockUpdate'),
    undefined,
  );
  const lastText = last
    ? `${(last.triggeredBy ?? '?').replace('actions_for_', '확장:').replace('hagobwa.usage_', '')} ${last.blocklistAppCount ?? '?'}개 ${(last.blockedAt ?? '').slice(11, 19)}`
    : '없음';
  const ota = safe(() => (Updates.updateId ?? 'embedded').slice(0, 6), '?');
  return `권한 ${auth === 2 ? 'O' : auth} · 선택 ${picked} · 잠금 ${shield} · 모니터 ${monitors} · 마지막잠금변경 ${lastText} · v${ota}`;
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
