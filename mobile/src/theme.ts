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

/**
 * One typeface everywhere (app, website, store images): Pretendard (SIL OFL, bundled in
 * assets/fonts). On iOS/Android each weight is its own font file, picked in <T> from
 * fontWeight; the web build loads the same family from a CDN.
 */
export const PRETENDARD: Record<string, string> = {
  '400': 'Pretendard-Regular',
  '500': 'Pretendard-Medium',
  '600': 'Pretendard-SemiBold',
  '700': 'Pretendard-Bold',
  '800': 'Pretendard-ExtraBold',
  '900': 'Pretendard-Black',
};

export const FONT_FILES = {
  'Pretendard-Regular': require('../assets/fonts/Pretendard-Regular.otf'),
  'Pretendard-Medium': require('../assets/fonts/Pretendard-Medium.otf'),
  'Pretendard-SemiBold': require('../assets/fonts/Pretendard-SemiBold.otf'),
  'Pretendard-Bold': require('../assets/fonts/Pretendard-Bold.otf'),
  'Pretendard-ExtraBold': require('../assets/fonts/Pretendard-ExtraBold.otf'),
  'Pretendard-Black': require('../assets/fonts/Pretendard-Black.otf'),
};

export const font = {
  family: Platform.select({
    web: '"Pretendard Variable", Pretendard, -apple-system, "Apple SD Gothic Neo", "Noto Sans KR", sans-serif',
    default: undefined,
  }),
};

export const radius = { sm: 10, md: 16, lg: 22, pill: 999 } as const;

export const space = (n: number) => n * 4;

/** Max content width so the app reads like a phone on wide browsers. */
export const MAX_WIDTH = 480;
