import { requireNativeView, requireOptionalNativeModule } from 'expo';
import type { ComponentType } from 'react';
import { Platform, type ViewProps } from 'react-native';

export interface PickedItem {
  kind: 'app' | 'category' | 'web';
  /** Single-item selection token (base64), usable with react-native-device-activity. */
  token: string;
}

const native = Platform.OS === 'ios' ? requireOptionalNativeModule<{ split(selection: string): PickedItem[] }>('LockedApps') : null;

/** True when this build includes the native module (older builds don't). */
export const isAvailable = !!native;

export function splitSelection(selection: string): PickedItem[] {
  try {
    return native?.split(selection) ?? [];
  } catch {
    return [];
  }
}

/** Icon + name of a picked item, drawn by iOS. Null where unavailable. */
export const PickedItemLabel: ComponentType<ViewProps & { item: string }> | null = native
  ? requireNativeView('LockedApps')
  : null;
