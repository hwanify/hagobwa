import { useCallback, useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';
import { activitySelectionMetadata, DeviceActivitySelectionSheetViewPersisted, getFamilyActivitySelectionId } from 'react-native-device-activity';

import { blocker, SELECTION_ID } from '@/platform/blocker';

/** How many apps / categories / sites the user picked in Apple's Screen Time picker. */
function pickedCount(): number {
  if (blocker.kind !== 'ios-screentime') return 0;
  const total = (m?: { applicationCount: number; categoryCount: number; webDomainCount: number }) =>
    m ? m.applicationCount + m.categoryCount + m.webDomainCount : 0;
  try {
    // Let the native side look the selection up by id first; fall back to the stored token.
    const byId = total(activitySelectionMetadata({ activitySelectionId: SELECTION_ID }));
    if (byId > 0) return byId;
    const token = getFamilyActivitySelectionId(SELECTION_ID);
    return token ? total(activitySelectionMetadata({ activitySelectionToken: token })) : 0;
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
  /** Last thing the native picker reported, shown in the diagnostics line. */
  const [lastEvent, setLastEvent] = useState('없음');
  /** True once the picker was opened and closed at least once. */
  const [closedOnce, setClosedOnce] = useState(false);

  const open = useCallback(async () => {
    const ok = await blocker.requestAuthorization();
    if (ok) setVisible(true);
    return ok;
  }, []);

  const close = useCallback(() => {
    // Keep the (invisible) native view mounted for a moment: it saves the selection on a short
    // debounce after Apple's sheet closes, and unmounting right away drops that save.
    setLastEvent((e) => `${e} · 닫힘`);
    setTimeout(() => {
      setVisible(false);
      setClosedOnce(true);
      const n = pickedCount();
      if (n > 0) setCount(n);
      onPicked?.(n);
    }, 1200);
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
        setLastEvent(`앱${m.applicationCount ?? '?'}/분류${m.categoryCount ?? '?'}/웹${m.webDomainCount ?? '?'}`);
        const n = (m.applicationCount ?? 0) + (m.categoryCount ?? 0) + (m.webDomainCount ?? 0);
        setCount(Math.max(n, pickedCount()));
      }}
      onDismissRequest={close}
    />
  ) : null;

  return { count, open, element, lastEvent, closedOnce };
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', width: 1, height: 1 },
});
