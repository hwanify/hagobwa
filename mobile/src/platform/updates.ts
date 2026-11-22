import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

/**
 * Over-the-air updates without interrupting anyone.
 *
 * The update downloads as soon as the app opens, but the app only restarts into it once the
 * user leaves 하고봐 (goes home or to another app) and no workout is open. Restarting on the
 * spot could throw away a set that was being counted. If the app is closed before that, the
 * downloaded update starts on the next launch anyway.
 */
let pending = false;
let busy = 0;

function applyIfIdle(): void {
  if (!pending || busy > 0) return;
  pending = false;
  Updates.reloadAsync().catch(() => {
    // Couldn't restart now: the update still starts on the next launch.
  });
}

/** Keep updates from restarting the app while this screen (e.g. a workout) is open. */
export function useHoldUpdates(): void {
  useEffect(() => {
    busy += 1;
    return () => {
      busy -= 1;
    };
  }, []);
}

export function useApplyOtaUpdate(): void {
  useEffect(() => {
    if (__DEV__ || Platform.OS === 'web' || !Updates.isEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable || cancelled) return;
        const fetched = await Updates.fetchUpdateAsync();
        if (fetched.isNew && !cancelled) pending = true;
      } catch {
        // Offline or no update channel: keep the current bundle.
      }
    })();
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'background') applyIfIdle();
    });
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, []);
}
