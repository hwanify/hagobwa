import { Platform } from 'react-native';
import * as ScreenTime from 'react-native-device-activity';

import { startOfDay } from '@/core/dates';
import { repsNeeded } from '@/core/rates';
import { capFor, exerciseTotals, streakDays } from '@/core/timebank';
import type { AppState } from '@/store/app-store';

import { reloadWidgets } from '../../modules/locked-apps';

let last = '';

/** Share what the home screen widget shows (targets/Widget) through the App Group. */
export function updateWidget(s: Pick<AppState, 'bank' | 'difficulty' | 'goalHours'>): void {
  if (Platform.OS !== 'ios') return;
  const now = Date.now();
  const dayStart = startOfDay(now);
  const totals = exerciseTotals(s.bank, dayStart, now + 1);
  const data = {
    balanceSec: Math.max(0, Math.floor(s.bank.balanceSec)),
    capSec: capFor(s.goalHours),
    pushups: totals.pushup.reps,
    squats: totals.squat.reps,
    streak: streakDays(s.bank, now),
    reps10: repsNeeded(600, 'pushup', s.difficulty),
    dayStart,
  };
  const key = JSON.stringify(data);
  if (key === last) return;
  last = key;
  try {
    ScreenTime.userDefaultsSet('hagobwaWidget', data);
    reloadWidgets();
  } catch {
    // Screen Time module unavailable (e.g. simulator): nothing to share.
  }
}
