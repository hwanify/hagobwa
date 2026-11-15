import { useCallback, useState } from 'react';
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
    const n = pickedCount();
    setCount(n);
    onPicked?.(n);
  }, [onPicked]);

  const element = visible ? (
    <DeviceActivitySelectionSheetViewPersisted
      style={styles.anchor}
      familyActivitySelectionId={SELECTION_ID}
      onSelectionChange={() => setCount(pickedCount())}
      onDismissRequest={close}
    />
  ) : null;

  return { count, open, element };
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', width: 1, height: 1 },
});
