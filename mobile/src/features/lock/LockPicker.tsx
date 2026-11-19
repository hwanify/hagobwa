import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet } from 'react-native';
import * as ScreenTime from 'react-native-device-activity';
import { DeviceActivitySelectionSheetView } from 'react-native-device-activity';
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

/** Forget every picked app (data reset). */
export function clearPicked(): void {
  try {
    const token = ScreenTime.getFamilyActivitySelectionId(SELECTION_ID);
    if (token) {
      ScreenTime.difference(
        { activitySelectionToken: token },
        { activitySelectionToken: token },
        { persistAsActivitySelectionId: SELECTION_ID },
      );
    }
  } catch {
    // nothing saved
  }
  useSelectionRev.setState((s) => ({ rev: s.rev + 1 }));
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
 *
 * We save the result ourselves instead of letting the native "persisted" picker do it: that
 * one saves on a timer as it mounts and could overwrite the saved apps with an empty picker.
 */
export function useLockPicker() {
  const rev = useSelectionRev((s) => s.rev);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const count = useMemo(pickedCount, [rev]);
  const [session, setSession] = useState<{ initial: string | null; openedAt: number } | null>(null);
  const [saving, setSaving] = useState(false);
  /** Latest selection the sheet reported in this session (undefined = nothing reported). */
  const pending = useRef<string | null | undefined>(undefined);
  /** Last thing the native picker reported, shown in the diagnostics line. */
  const [lastEvent, setLastEvent] = useState('없음');
  /** True once the picker was opened and closed at least once. */
  const [closedOnce, setClosedOnce] = useState(false);

  const open = useCallback(async () => {
    const ok = await blocker.requestAuthorization();
    if (!ok) return false;
    pending.current = undefined;
    let initial: string | null = null;
    try {
      initial = ScreenTime.getFamilyActivitySelectionId(SELECTION_ID) ?? null;
    } catch {
      initial = null;
    }
    setSession({ initial, openedAt: Date.now() });
    return true;
  }, []);

  const close = useCallback(() => {
    setLastEvent((e) => `${e} · 닫힘`);
    setSaving(true);
    // The sheet reports its final selection a moment after it closes (short native debounce).
    setTimeout(() => {
      const next = pending.current;
      const before = session?.initial ?? null;
      if (next !== undefined && next !== before) {
        try {
          if (next) {
            ScreenTime.setFamilyActivitySelectionId({ id: SELECTION_ID, familyActivitySelection: next });
          } else if (before) {
            // Everything unticked on purpose: store an empty selection.
            ScreenTime.difference(
              { activitySelectionToken: before },
              { activitySelectionToken: before },
              { persistAsActivitySelectionId: SELECTION_ID },
            );
          }
        } catch {
          // Keep what was saved before.
        }
      }
      setSession(null);
      setSaving(false);
      setClosedOnce(true);
      selectionChanged();
    }, 700);
  }, [session]);

  useEffect(() => {
    if (!session) return;
    // Safety net: if the sheet somehow never reports closing, don't stay mounted forever.
    const id = setTimeout(() => setSession(null), 10 * 60_000);
    return () => clearTimeout(id);
  }, [session]);

  const element = session ? (
    <DeviceActivitySelectionSheetView
      style={styles.anchor}
      {...(session.initial ? { familyActivitySelection: session.initial } : {})}
      onSelectionChange={(e) => {
        const m = e.nativeEvent;
        setLastEvent(`앱${m.applicationCount ?? '?'}/분류${m.categoryCount ?? '?'}/웹${m.webDomainCount ?? '?'}`);
        const token = m.familyActivitySelection ?? null;
        // The sheet echoes its starting state as it mounts; an empty echo right after opening
        // is not the user clearing everything.
        if (!token && Date.now() - session.openedAt < 800) return;
        pending.current = token;
      }}
      onDismissRequest={close}
    />
  ) : null;

  return { count, open, element, saving, lastEvent, closedOnce };
}

const styles = StyleSheet.create({
  anchor: { position: 'absolute', width: 1, height: 1 },
});
