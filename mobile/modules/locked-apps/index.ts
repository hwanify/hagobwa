import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import { Platform, type ViewProps } from 'react-native';

export interface PickedItem {
  kind: 'app' | 'category' | 'web';
  /** Single-item selection token (base64), usable with react-native-device-activity. */
  token: string;
}

const native = Platform.OS === 'ios' ? requireOptionalNativeModule<{ split(selection: string): PickedItem[]; requestNotifications(): Promise<boolean> }>('LockedApps') : null;

/** True when this build includes the native module (older builds don't). */
export const isAvailable = !!native;

export function splitSelection(selection: string): PickedItem[] {
  try {
    return native?.split(selection) ?? [];
  } catch {
    return [];
  }
}

/** Ask for notification permission (used to open 하고봐 from the lock screen). */
export async function requestNotifications(): Promise<boolean> {
  try {
    return (await native?.requestNotifications()) ?? false;
  } catch {
    return false;
  }
}

/** Icon + name of a picked item, drawn by iOS. Null where unavailable. */
export const PickedItemLabel: ComponentType<ViewProps & { item: string }> | null = native
  ? requireNativeView('LockedApps')
  : null;
