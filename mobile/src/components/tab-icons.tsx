import Svg, { Circle, Line, Path } from 'react-native-svg';

/**
 * Minimal line icons for the tab bar: one 24px grid, one stroke weight, round caps,
 * no fills. Active state is shown by color (and a slightly heavier stroke), not by
 * switching to a filled glyph.
 */
export type TabIconName = 'home' | 'crew' | 'records' | 'settings';

export function TabIcon({ name, color, active, size = 24 }: { name: TabIconName; color: string; active?: boolean; size?: number }) {
  const sw = active ? 2 : 1.6;
  const common = { stroke: color, strokeWidth: sw, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      {name === 'home' && <Path d="M4.5 10.5 12 4.5l7.5 6V19.5h-15z" {...common} />}
      {name === 'crew' && (
        <>
          <Circle cx="9" cy="9" r="3" {...common} />
          <Path d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5" {...common} />
          <Path d="M15.5 6.4a3 3 0 0 1 0 5.2M17.5 14.8c1.4.6 2.4 2 2.9 4.2" {...common} />
        </>
      )}
      {name === 'records' && (
        <>
          <Line x1="5" y1="7" x2="19" y2="7" {...common} />
          <Line x1="5" y1="12" x2="19" y2="12" {...common} />
          <Line x1="5" y1="17" x2="13" y2="17" {...common} />
        </>
      )}
      {name === 'settings' && (
        <>
          <Line x1="4.5" y1="8" x2="19.5" y2="8" {...common} />
          <Line x1="4.5" y1="16" x2="19.5" y2="16" {...common} />
          <Circle cx="9" cy="8" r="2.2" {...common} fill="#F7F7F3" />
          <Circle cx="15" cy="16" r="2.2" {...common} fill="#F7F7F3" />
        </>
      )}
    </Svg>
  );
}

/** Workout button glyph: a plain barbell in thin strokes. */
export function BarbellIcon({ color, size = 26 }: { color: string; size?: number }) {
  const common = { stroke: color, strokeWidth: 2.2, strokeLinecap: 'round' as const, fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false}>
      <Line x1="7" y1="12" x2="17" y2="12" {...common} />
      <Line x1="7" y1="7.5" x2="7" y2="16.5" {...common} />
      <Line x1="17" y1="7.5" x2="17" y2="16.5" {...common} />
      <Line x1="3.5" y1="10" x2="3.5" y2="14" {...common} />
      <Line x1="20.5" y1="10" x2="20.5" y2="14" {...common} />
    </Svg>
  );
}
