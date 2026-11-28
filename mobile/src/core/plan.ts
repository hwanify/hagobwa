/**
 * 하고봐 플러스: groundwork only. Nothing is sold and nothing is locked; see docs/MONETIZATION.md.
 *
 * Rules for when paid plans start:
 * - What the app does today stays free for everyone: locking apps, counting push-ups and squats
 *   on camera or by tap, earning time, the emergency 5 minutes, records and streaks, the voice
 *   count. Plus only adds new things (PLUS_FEATURES).
 * - Early bird: whoever installed before paid plans start gets Plus for life, decided on the
 *   phone (isEarlyBird), mainly from Apple's own record of the first install:
 *   StoreKit AppTransaction.originalAppVersion = the build number (CFBundleVersion) first
 *   installed (iOS 16+; the app needs iOS 18). Build numbers only ever go up (EAS autoIncrement,
 *   remote), so "first build < first paid build" means installed before. TestFlight and the
 *   sandbox always report "1.0", so test the paid path in the sandbox.
 * - Backup when Apple's record can't be read: firstOpenedAt (kept on the phone only, never sent
 *   anywhere; see firstOpenedAtFor) and the dates of workout records.
 */

/** Plus candidates: all new, none of them exist yet. */
export type PlusFeature = 'exercises' | 'schedule' | 'app-rates' | 'report' | 'widget' | 'voices';

export const PLUS_FEATURES: Record<PlusFeature, string> = {
  exercises: '운동 추가 (런지, 플랭크, 버피)',
  schedule: '잠금 시간표 (밤에는 충전해도 안 열리게)',
  'app-rates': '앱마다 다른 충전 비율 (쇼츠는 더 비싸게)',
  report: '주간 리포트와 자세한 기록',
  widget: '홈·잠금 화면 위젯 (남은 시간)',
  voices: '구령 목소리 고르기',
};

/** Plus for everyone until paid plans exist. */
export function isPlus(): boolean {
  return true;
}

export function hasPlusFeature(_feature: PlusFeature): boolean {
  return isPlus();
}

/** When paid plans start. null = not yet: everyone counts as an early bird. */
export interface PaidLaunch {
  /** First build number (CFBundleVersion) that sells Plus. */
  firstPaidBuild: number;
  /** When that build went live (ms), for the backup evidence. */
  at: number;
}

export const PAID_LAUNCH: PaidLaunch | null = null;

export interface EarlyBirdEvidence {
  /** AppTransaction.originalAppVersion ("18", or "1.0" in TestFlight/sandbox). Null if it couldn't be read. */
  originalAppVersion: string | null;
  /** First time this phone opened the app (ms, 0 = unknown). */
  firstOpenedAt: number;
  /** Times of the workout records still on the phone (ms). */
  workoutTimes?: number[];
}

/**
 * Installed before paid plans started? Apple's record decides when it's there; otherwise the
 * phone's own dates. Once paid plans exist, the answer should be stored and not asked again.
 */
export function isEarlyBird(e: EarlyBirdEvidence, launch: PaidLaunch | null = PAID_LAUNCH): boolean {
  if (!launch) return true;
  const build = e.originalAppVersion === null ? NaN : Number.parseInt(e.originalAppVersion, 10);
  if (Number.isFinite(build)) return build < launch.firstPaidBuild;
  const earliest = Math.min(...[e.firstOpenedAt, ...(e.workoutTimes ?? [])].filter(validTime), Infinity);
  return earliest < launch.at;
}

const validTime = (t: unknown): t is number => typeof t === 'number' && Number.isFinite(t) && t > 0;

/**
 * When this phone first opened the app, for the early-bird backup. Once saved it never moves.
 * Phones that used the app before it was recorded get their oldest workout if that's earlier
 * than now.
 */
export function firstOpenedAtFor(saved: unknown, workoutTimes: readonly unknown[], now: number): number {
  if (validTime(saved)) return saved;
  return workoutTimes.reduce<number>((min, t) => (validTime(t) && t < min ? t : min), now);
}
