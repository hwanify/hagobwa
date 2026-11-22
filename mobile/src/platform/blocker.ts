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
  /**
   * Shield or unshield to match the balance. `reps10` = push-ups that earn 10 minutes.
   * Returns when the usage window ends (0 = no window running).
   */
  apply(balanceSec: number, reps10?: number): Promise<number>;
  /** One-line status for bug reports (empty when simulated). */
  diagnose(): string;
  /** Usage events iOS has reported for the current window (diagnostics). */
  eventCount(): number;
}

/** familyActivitySelectionId shared with the picker views. */
export const SELECTION_ID = 'hagobwa.locked';
const ACTIVITY = 'hagobwa.usage';
/**
 * Usage window length. Within one window iOS keeps counting across midnight; every charge
 * starts a new one. Kept just under a week, the longest window iOS is documented to allow.
 */
const WINDOW_MS = 7 * 24 * 3600_000 - 10 * 60_000;
const USE_WEEK_WINDOW = true;
let monitorUntil = 0;
let monitorMode: 'none' | 'week' | 'day' = 'none';

/** When the current usage window ends (0 if none). The app re-syncs before that. */
export function monitorEndsAt(): number {
  return monitorUntil;
}

/** Saved in the App Group so diagnostics survive app restarts and OTA reloads. */
function rememberMode(mode: typeof monitorMode, until: number) {
  try {
    ScreenTime.userDefaultsSet('hagobwaMonitor', { mode, until, at: Date.now() });
  } catch {
    // diagnostics only
  }
}

function dateParts(d: Date) {
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    hour: d.getHours(),
    minute: d.getMinutes(),
    second: d.getSeconds(),
  };
}

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
  async apply() {
    return 0;
  },
  diagnose: () => '',
  eventCount: () => 0,
};

// 하고봐 palette (src/theme): paper background, ink text, red accent.
const RED = { red: 224, green: 69, blue: 74 };
const PAPER = { red: 247, green: 247, blue: 243 };
const INK = { red: 22, green: 24, blue: 27 };
const MUTE = { red: 92, green: 95, blue: 102 };
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

let shieldKey = '';
/** Usage window for an emergency unlock started from the lock screen. */
export const EMERGENCY_ACTIVITY = 'hagobwaEmergency';
const EMERGENCY_MIN = 5;

/**
 * L-4 lock screen: paper background and a big red "0분", plus an emergency button that opens
 * the apps right there for 5 minutes of use, once a day (the daily limit lives in our patch of
 * the ShieldAction extension: patches/react-native-device-activity+*.patch).
 */
async function ensureShield(reps10: number, token: string) {
  const key = `${reps10}|${token}`;
  if (shieldKey === key) return;
  shieldKey = key;
  const hasIcon = await prepareShieldIcon();
  const emergency = {
    behavior: 'defer' as const,
    hagobwaEmergency: true,
    // Re-locking after 5 minutes of use comes from the guard monitor started while locked
    // (see apply), which uses the same reliable window as normal charging.
    actions: [{ type: 'unblockSelection' as const, familyActivitySelectionId: SELECTION_ID }],
  };
  ScreenTime.updateShield(
    {
      // Opaque paper with a light blur so no coloured edge shows in the app switcher.
      backgroundColor: PAPER,
      backgroundBlurStyle: ScreenTime.UIBlurEffectStyle.extraLight,
      // iOS fills in the app name at display time, so keep it away from Korean particles.
      title: '지금은 잠겨 있어요',
      titleColor: INK,
      subtitle: `{applicationOrDomainDisplayName} · 푸시업 ${reps10}개면 10분 열려요.\n하고봐에서 운동하고 충전하세요.`,
      subtitleColor: MUTE,
      ...(hasIcon ? { iconAppGroupRelativePath: ICON_FILE } : { iconSystemName: 'lock.fill', iconTint: RED }),
      primaryButtonLabel: '확인',
      primaryButtonLabelColor: WHITE,
      primaryButtonBackgroundColor: INK,
      // Short enough for one line; hidden by our ShieldConfiguration patch once used today.
      secondaryButtonLabel: `비상 ${EMERGENCY_MIN}분 열기`,
      secondaryButtonLabelColor: MUTE,
      hagobwaEmergencyButton: true,
    } as unknown as ScreenTime.ShieldConfiguration,
    // `hagobwaEmergency` is read by our ShieldAction patch; the library's type doesn't know it.
    { primary: { behavior: 'close' }, secondary: emergency as unknown as ScreenTime.ShieldAction },
  );
}

/**
 * While locked, keep a usage monitor running whose checkpoints re-lock the apps every 5 minutes
 * of use. Locked apps aren't used, so it only matters after an emergency unlock from the lock
 * screen: then it locks again within 5 minutes of use. Names start with 'e' so they are never
 * charged as balance usage (those start with 'm').
 */
async function startGuard(token: string): Promise<number> {
  const now = Date.now();
  const marks: number[] = [];
  for (let m = EMERGENCY_MIN; m <= 120; m += EMERGENCY_MIN) marks.push(m);
  for (let m = 150; m <= 24 * 60; m += 30) marks.push(m);
  for (const m of marks) {
    ScreenTime.configureActions({
      activityName: ACTIVITY,
      callbackName: 'eventDidReachThreshold',
      eventName: `e${m}`,
      actions: [{ type: 'blockSelection', familyActivitySelectionId: SELECTION_ID }],
    });
  }
  const end = now + WINDOW_MS;
  try {
    await ScreenTime.startMonitoring(
      ACTIVITY,
      { intervalStart: dateParts(new Date(now)), intervalEnd: dateParts(new Date(end)), repeats: false },
      marks.map((m) => ({
        eventName: `e${m}`,
        familyActivitySelection: token,
        threshold: { hour: Math.floor(m / 60), minute: m % 60 },
        includesPastActivity: false,
      })),
    );
  } catch {
    return 0;
  }
  monitorUntil = end;
  monitorMode = 'week';
  rememberMode('week', end);
  return end;
}

/** Day key of the last emergency unlock (lock screen or app), shared with the extension. */
export function emergencyDayUsed(): string | undefined {
  try {
    return ScreenTime.userDefaultsGet<string>('hagobwaEmergencyDay');
  } catch {
    return undefined;
  }
}

export function markEmergencyDay(day: string): void {
  try {
    ScreenTime.userDefaultsSet('hagobwaEmergencyDay', day);
  } catch {
    // simulated / unavailable
  }
}

const screenTime: AppBlocker = {
  kind: 'ios-screentime',
  diagnose: () => '',
  eventCount(): number {
    try {
      return ScreenTime.getEvents(ACTIVITY).filter((e) => e.callbackName === 'eventDidReachThreshold').length;
    } catch {
      return -1;
    }
  },
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
    if (ScreenTime.getAuthorizationStatus() !== ScreenTime.AuthorizationStatus.approved) return 0;
    const token = ScreenTime.getFamilyActivitySelectionId(SELECTION_ID);
    if (token) await ensureShield(reps10, token);
    // A new sync replaces any emergency window started from the lock screen.
    ScreenTime.stopMonitoring([ACTIVITY, EMERGENCY_ACTIVITY]);
    ScreenTime.cleanUpAfterActivity(ACTIVITY);
    // Start from a clean slate so apps removed from the selection don't stay shielded.
    ScreenTime.resetBlocks('hagobwa:sync');
    monitorUntil = 0;
    monitorMode = 'none';
    rememberMode('none', 0);
    if (!token || !this.hasSelection()) return 0;

    const marks = usageCheckpoints(balanceSec);
    if (marks.length === 0) {
      ScreenTime.blockSelection(selection(), 'hagobwa:empty');
      return startGuard(token);
    }

    const now = Date.now();
    const last = marks[marks.length - 1];
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
    const events = marks.map((m) => ({
      eventName: `${EVENT_PREFIX}${m}`,
      familyActivitySelection: token,
      threshold: { hour: Math.floor(m / 60), minute: m % 60 },
      includesPastActivity: false,
    }));
    // When the window really ends, shield again (stopMonitoring above also reports
    // intervalDidEnd, so only honour it near the real end).
    const relockAt = (end: number) =>
      ScreenTime.configureActions({
        activityName: ACTIVITY,
        callbackName: 'intervalDidEnd',
        actions: [{ type: 'blockSelection', familyActivitySelectionId: SELECTION_ID, neverTriggerBefore: new Date(end - 120_000) }],
      });

    // One window from now that doesn't reset at midnight, so usage carries across days.
    const end = now + WINDOW_MS;
    if (USE_WEEK_WINDOW) relockAt(end);
    if (USE_WEEK_WINDOW) try {
      await ScreenTime.startMonitoring(
        ACTIVITY,
        { intervalStart: dateParts(new Date(now)), intervalEnd: dateParts(new Date(end)), repeats: false },
        events,
      );
      monitorUntil = end;
      monitorMode = 'week';
      rememberMode('week', end);
      return end;
    } catch {
      // iOS refused the long window: fall back to a daily window (re-locks at midnight).
    }
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0);
    relockAt(midnight.getTime());
    await ScreenTime.startMonitoring(
      ACTIVITY,
      { intervalStart: { hour: 0, minute: 0, second: 0 }, intervalEnd: { hour: 23, minute: 59, second: 59 }, repeats: true },
      events,
    );
    monitorUntil = midnight.getTime();
    monitorMode = 'day';
    rememberMode('day', monitorUntil);
    return monitorUntil;
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
  const mon = safe(() => ScreenTime.userDefaultsGet<{ mode?: string; until?: number }>('hagobwaMonitor'), undefined);
  const monText = mon?.mode
    ? `${mon.mode}${mon.until ? ` ~${new Date(mon.until).getMonth() + 1}/${new Date(mon.until).getDate()} ${String(new Date(mon.until).getHours()).padStart(2, '0')}:${String(new Date(mon.until).getMinutes()).padStart(2, '0')}` : ''}`
    : '기록없음';
  const ota = safe(() => (Updates.updateId ?? 'embedded').slice(0, 6), '?');
  return `권한 ${auth === 2 ? 'O' : auth} · 선택 ${picked} · 잠금 ${shield} · 모니터 ${monitors}(${monText}) · 마지막잠금변경 ${lastText} · v${ota}`;
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
