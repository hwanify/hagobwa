import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { activitySelectionMetadata, DeviceActivitySelectionSheetViewPersisted, getFamilyActivitySelectionId } from 'react-native-device-activity';

import { blocker, SELECTION_ID } from '@/platform/blocker';

/** How many apps / categories / sites the user picked in Apple's Screen Time picker. */
function pickedCount(): number {
  if (blocker.kind !== 'ios-screentime') return 0;
  try {
    const token = getFamilyActivitySelectionId(SELECTION_ID);
    if (!token) return 0;
    const m = activitySelectionMetadata({ activitySelectionToken: token });
    return m ? m.applicationCount + m.categoryCount + m.webDomainCount : 0;
  } catch {
    return 0;
  }
}

/**
 * Apple's app picker (iOS Screen Time). The selection is stored natively under SELECTION_ID,
 * so it survives restarts and the blocker extensions can read it. Needs authorization first.
 */
export function useLockPicker(onPicked?: (count: number) => void) {
  const [visible, setVisible] = useState(false);
  const [count, setCount] = useState(pickedCount);

  const open = useCallback(async () => {
    const ok = await blocker.requestAuthorization();
    if (ok) setVisible(true);
    return ok;
  }, []);

  const close = useCallback(() => {
    setVisible(false);
    // The native side may save the selection just after dismissing; read it again shortly.
    const read = () => {
      const n = pickedCount();
      if (n > 0) setCount(n);
      return n;
    };
    read();
    setTimeout(() => {
      read();
      onPicked?.(pickedCount());
    }, 500);
  }, [onPicked]);

  // Re-read when a screen mounts again (another screen may have changed the selection).
  useEffect(() => {
    const id = setInterval(() => {
      const n = pickedCount();
      if (n > 0) setCount((c) => (c === n ? c : n));
    }, 3000);
    return () => clearInterval(id);
  }, []);

  const element = visible ? (
    <DeviceActivitySelectionSheetViewPersisted
      style={styles.anchor}
      familyActivitySelectionId={SELECTION_ID}
      onSelectionChange={(e) => {
        const m = e.nativeEvent;
        const n = (m.applicationCount ?? 0) + (m.categoryCount ?? 0) + (m.webDomainCount ?? 0);
        setCount(Math.max(n, pickedCount()));
      }}
      onDismissRequest={close}
    />
  ) : null;

  return { count, open, element };
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', width: 1, height: 1 },
});
