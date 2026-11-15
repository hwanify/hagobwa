import Ionicons from '@expo/vector-icons/Ionicons';

/**
 * Tab bar icons: outline when idle, the filled version of the same glyph when selected.
 */
export type TabIconName = 'home' | 'crew' | 'records' | 'settings';

const GLYPH: Record<TabIconName, { idle: keyof typeof Ionicons.glyphMap; active: keyof typeof Ionicons.glyphMap }> = {
  home: { idle: 'home-outline', active: 'home' },
  crew: { idle: 'people-outline', active: 'people' },
  records: { idle: 'calendar-clear-outline', active: 'calendar-clear' },
  settings: { idle: 'settings-outline', active: 'settings' },
};

export function TabIcon({ name, color, active = false, size = 24 }: { name: TabIconName; color: string; active?: boolean; size?: number }) {
  const g = GLYPH[name];
  return <Ionicons name={active ? g.active : g.idle} size={size} color={color} />;
}

/** Workout button glyph. */
export function BarbellIcon({ color, size = 26 }: { color: string; size?: number }) {
  return <Ionicons name="barbell" size={size} color={color} />;
}
