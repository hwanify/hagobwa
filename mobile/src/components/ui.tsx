import type { ReactNode } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';

import { appById } from '@/core/apps';
import { colors, font, MAX_WIDTH, radius } from '@/theme';

/* ---------- layout ---------- */

export function Screen({
  children,
  scroll = true,
  bg = colors.paper,
  edges = ['top', 'bottom'],
  footer,
}: {
  children: ReactNode;
  scroll?: boolean;
  bg?: string;
  edges?: ('top' | 'bottom')[];
  footer?: ReactNode;
}) {
  const inner = scroll ? (
    <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.scrollContent, { flex: 1 }]}>{children}</View>
  );
  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: bg }]} edges={edges}>
      <View style={styles.column}>
        <View style={{ flex: 1 }}>{inner}</View>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </View>
    </SafeAreaView>
  );
}

/* ---------- text ---------- */

type TProps = TextProps & { style?: StyleProp<TextStyle>; children: ReactNode };

export function T({ style, ...rest }: TProps) {
  return <Text {...rest} style={[styles.text, style]} />;
}
export function H1(p: TProps) {
  return <T {...p} style={[styles.h1, p.style]} />;
}
export function H2(p: TProps) {
  return <T {...p} style={[styles.h2, p.style]} />;
}
export function Muted(p: TProps) {
  return <T {...p} style={[styles.muted, p.style]} />;
}
export function Mono(p: TProps) {
  return <T {...p} style={[styles.mono, p.style]} />;
}

/* ---------- buttons ---------- */

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
  icon,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'quiet' | 'ink' | 'paper' | 'ghost';
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const v = BUTTON[variant];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: v.bg },
        variant === 'ghost' && { paddingVertical: 12 },
        pressed && { transform: [{ scale: 0.98 }] },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      {icon}
      <T style={[styles.buttonText, { color: v.fg }, variant === 'ghost' && { fontSize: 14 }]}>{label}</T>
    </Pressable>
  );
}

const BUTTON = {
  primary: { bg: colors.red, fg: colors.white },
  quiet: { bg: colors.ground, fg: colors.ink },
  ink: { bg: colors.ink, fg: colors.white },
  paper: { bg: colors.paper, fg: colors.ink },
  ghost: { bg: 'transparent', fg: colors.mute },
} as const;

export function Chip({
  label,
  active,
  onPress,
  tone = 'red',
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  tone?: 'red' | 'ink';
}) {
  const on = tone === 'red' ? colors.red : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={[styles.chip, { backgroundColor: active ? on : colors.ground }]}
    >
      <T style={[styles.chipText, { color: active ? colors.white : colors.mute }]}>{label}</T>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  stretch,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  /** Fill the available width, items sharing it equally. */
  stretch?: boolean;
}) {
  return (
    <View style={[styles.segment, stretch && { alignSelf: 'stretch' }]}>
      {options.map((o) => {
        const active = o.id === value;
        return (
          <Pressable
            key={o.id}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.id)}
            style={[styles.segmentItem, stretch && { flex: 1, alignItems: 'center' }, active && { backgroundColor: colors.ink }]}
          >
            <Text style={[styles.text, styles.chipText, { color: active ? colors.paper : colors.mute }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ---------- bits ---------- */

export function Card({ children, style, tone = 'ground' }: { children: ReactNode; style?: StyleProp<ViewStyle>; tone?: 'ground' | 'ink' | 'red' | 'paper' }) {
  const bg = { ground: colors.ground, ink: colors.ink, red: colors.red, paper: colors.paper }[tone];
  return <View style={[styles.card, { backgroundColor: bg }, style]}>{children}</View>;
}

export function AppTile({ appId, size = 40 }: { appId: string; size?: number }) {
  const app = appById(appId);
  const toneByApp: Record<string, { bg: string; fg: string }> = {
    youtube: { bg: colors.red, fg: colors.white },
    instagram: { bg: colors.ink, fg: colors.paper },
    tiktok: { bg: '#33363C', fg: colors.paper },
    webtoon: { bg: '#6B6E75', fg: colors.paper },
    chzzk: { bg: '#A3A59E', fg: colors.ink },
    x: { bg: '#2A2C30', fg: colors.paper },
  };
  const t = toneByApp[appId] ?? { bg: colors.mute, fg: colors.paper };
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.3, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
      <T style={{ color: t.fg, fontWeight: '900', fontSize: size * 0.38 }}>{app?.glyph ?? '?'}</T>
    </View>
  );
}

export function Ring({ ratio, size = 184, stroke = 14, children }: { ratio: number; size?: number; stroke?: number; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, ratio));
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={colors.dim} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={colors.red}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - clamped)}
        />
      </Svg>
      {children}
    </View>
  );
}

export function ProgressBar({ ratio, color = colors.red, track = colors.ground, height = 8 }: { ratio: number; color?: string; track?: string; height?: number }) {
  return (
    <View style={{ height, borderRadius: height, backgroundColor: track, overflow: 'hidden' }}>
      <View style={{ height, width: `${Math.max(0, Math.min(1, ratio)) * 100}%`, backgroundColor: color, borderRadius: height }} />
    </View>
  );
}

export function Row({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center' }, style]}>{children}</View>;
}

export function Divider() {
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.line }} />;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  column: { flex: 1, width: '100%', maxWidth: MAX_WIDTH, alignSelf: 'center' },
  scrollContent: { paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24, flexGrow: 1 },
  footer: { paddingHorizontal: 24, paddingBottom: 16, paddingTop: 8 },
  text: { color: colors.ink, fontFamily: font.family, fontSize: 15 },
  h1: { fontSize: 28, fontWeight: '800', letterSpacing: -0.8, lineHeight: 36 },
  h2: { fontSize: 20, fontWeight: '800', letterSpacing: -0.4 },
  muted: { color: colors.mute, fontSize: 14, lineHeight: 21 },
  mono: { fontFamily: font.mono, fontWeight: '700' },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: radius.md,
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  buttonText: { fontSize: 16, fontWeight: '700' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: radius.pill },
  chipText: { fontSize: 13, fontWeight: '700' },
  segment: { flexDirection: 'row', backgroundColor: colors.ground, borderRadius: radius.pill, padding: 4 },
  segmentItem: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill },
  card: { borderRadius: radius.md, padding: 16 },
});
