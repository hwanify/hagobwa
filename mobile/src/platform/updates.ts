import * as Updates from 'expo-updates';
import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Apply an over-the-air update as soon as the app opens, instead of waiting for the next launch.
 * Skipped in development and on web. Failures are ignored: the app keeps running the current bundle.
 */
export function useApplyOtaUpdate(): void {
  useEffect(() => {
    if (__DEV__ || Platform.OS === 'web' || !Updates.isEnabled) return;
    let cancelled = false;
    (async () => {
      try {
        const check = await Updates.checkForUpdateAsync();
        if (!check.isAvailable || cancelled) return;
        const fetched = await Updates.fetchUpdateAsync();
        if (fetched.isNew && !cancelled) await Updates.reloadAsync();
      } catch {
        // Offline or no update channel: keep the current bundle.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}
