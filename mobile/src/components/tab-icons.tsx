import Ionicons from '@expo/vector-icons/Ionicons';

/**
 * Tab bar icons: the familiar outline glyphs, kept simple. The active tab only changes
 * color (no switch to a filled glyph), and the calendar has no inner dots.
 */
export type TabIconName = 'home' | 'crew' | 'records' | 'settings';

const GLYPH: Record<TabIconName, keyof typeof Ionicons.glyphMap> = {
  home: 'home-outline',
  crew: 'people-outline',
  records: 'calendar-clear-outline',
  settings: 'settings-outline',
};

export function TabIcon({ name, color, size = 24 }: { name: TabIconName; color: string; active?: boolean; size?: number }) {
  return <Ionicons name={GLYPH[name]} size={size} color={color} />;
}

/** Workout button glyph. */
export function BarbellIcon({ color, size = 26 }: { color: string; size?: number }) {
  return <Ionicons name="barbell" size={size} color={color} />;
}
