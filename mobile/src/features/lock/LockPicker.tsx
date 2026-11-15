import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet } from 'react-native';
import * as ScreenTime from 'react-native-device-activity';
import { DeviceActivitySelectionSheetViewPersisted } from 'react-native-device-activity';
import { create } from 'zustand';

import { blocker, SELECTION_ID } from '@/platform/blocker';
import { useAppStore } from '@/store/app-store';

import { splitSelection, type PickedItem } from '../../../modules/locked-apps';

/**
 * One shared revision number for the Screen Time selection. Every screen that shows the
 * picked apps re-reads them when it changes, so home and settings never disagree.
 */
const useSelectionRev = create<{ rev: number }>(() => ({ rev: 0 }));

export function selectionChanged(): void {
  useSelectionRev.setState((s) => ({ rev: s.rev + 1 }));
  void useAppStore.getState().syncBlocker();
}

// Another app (Settings > Screen Time) can change things while we're in the background.
AppState.addEventListener('change', (st) => {
  if (st === 'active') useSelectionRev.setState((s) => ({ rev: s.rev + 1 }));
});

function readItems(): PickedItem[] {
  if (blocker.kind !== 'ios-screentime') return [];
  try {
    const token = ScreenTime.getFamilyActivitySelectionId(SELECTION_ID);
    return token ? splitSelection(token) : [];
  } catch {
    return [];
  }
}

/** How many apps / categories / sites are picked. Missing fields count as 0 (no NaN). */
function pickedCount(): number {
  if (blocker.kind !== 'ios-screentime') return 0;
  const total = (m?: { applicationCount?: number; categoryCount?: number; webDomainCount?: number }) =>
    m ? (m.applicationCount ?? 0) + (m.categoryCount ?? 0) + (m.webDomainCount ?? 0) : 0;
  try {
    const items = readItems();
    if (items.length > 0) return items.length;
    return total(ScreenTime.activitySelectionMetadata({ activitySelectionId: SELECTION_ID }));
  } catch {
    return 0;
  }
}

/** The picked apps, always current across screens. */
export function usePickedItems(): PickedItem[] {
  const rev = useSelectionRev((s) => s.rev);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(readItems, [rev]);
}

/** Remove one picked app/category/site from the selection. */
export function removePicked(item: PickedItem): void {
  try {
    ScreenTime.difference(
      { activitySelectionId: SELECTION_ID },
      { activitySelectionToken: item.token },
      { persistAsActivitySelectionId: SELECTION_ID },
    );
  } catch {
    // Leave it as is; the list re-reads and still shows the item.
  }
  selectionChanged();
}

/**
 * Apple's app picker (iOS Screen Time). It opens with the current selection already ticked,
 * so "edit" adds or removes without losing what was there. Needs authorization first.
 */
export function useLockPicker() {
  const rev = useSelectionRev((s) => s.rev);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const count = useMemo(pickedCount, [rev]);
  const [visible, setVisible] = useState(false);
  const [saving, setSaving] = useState(false);
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
    setSaving(true);
    setTimeout(() => {
      setVisible(false);
      setSaving(false);
      setClosedOnce(true);
      selectionChanged();
    }, 1200);
  }, []);

  useEffect(() => {
    if (!visible) return;
    // Safety net: if the sheet somehow never reports closing, don't stay mounted forever.
    const id = setTimeout(() => setVisible(false), 10 * 60_000);
    return () => clearTimeout(id);
  }, [visible]);

  const element = visible ? (
    <DeviceActivitySelectionSheetViewPersisted
      style={styles.anchor}
      familyActivitySelectionId={SELECTION_ID}
      // Required for the native view to load the saved selection; without it the sheet opens
      // empty and picking one app silently replaces everything that was locked.
      includeEntireCategory
      onSelectionChange={(e) => {
        const m = e.nativeEvent;
        setLastEvent(`앱${m.applicationCount ?? '?'}/분류${m.categoryCount ?? '?'}/웹${m.webDomainCount ?? '?'}`);
      }}
      onDismissRequest={close}
    />
  ) : null;

  return { count, open, element, saving, lastEvent, closedOnce };
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', width: 1, height: 1 },
});
