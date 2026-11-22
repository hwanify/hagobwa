import { Platform } from 'react-native';

export const colors = {
  ground: '#ECEDE7',
  paper: '#F7F7F3',
  line: '#D5D6CF',
  ink: '#16181B',
  mute: '#5C5F66',
  red: '#E0454A',
  white: '#FFFFFF',
  dim: '#E2E3DC',
} as const;

export const font = {
  family: Platform.select({
    web: '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    default: undefined,
  }),
  mono: Platform.select({
    web: '"JetBrains Mono", ui-monospace, monospace',
    ios: 'Menlo',
    default: 'monospace',
  }),
};

export const radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;

export const space = (n: number) => n * 4;

/** Max content width so the app reads like a phone on wide browsers. */
export const MAX_WIDTH = 480;
