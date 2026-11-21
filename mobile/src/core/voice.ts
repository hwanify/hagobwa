export type VoiceMode = 'basic' | 'drill' | 'pt' | 'mom';

export const VOICE_MODES: { id: VoiceMode; label: string }[] = [
  { id: 'basic', label: '기본' },
  { id: 'drill', label: '조교' },
  { id: 'pt', label: 'PT쌤' },
  { id: 'mom', label: '엄마' },
];

const NATIVE = [
  '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉', '열',
  '열하나', '열둘', '열셋', '열넷', '열다섯', '열여섯', '열일곱', '열여덟', '열아홉', '스물',
];

const TENS = ['', '열', '스물', '서른', '마흔', '쉰', '예순', '일흔', '여든', '아흔'];
const ONES = ['', '하나', '둘', '셋', '넷', '다섯', '여섯', '일곱', '여덟', '아홉'];

/** How people count reps: native Korean to 99, then 백, 백하나 … 이백; digits beyond. */
export function koCount(n: number): string {
  if (n >= 1 && n <= 20) return NATIVE[n - 1];
  if (n > 20 && n < 100) return TENS[Math.floor(n / 10)] + ONES[n % 10];
  if (n === 100) return '백';
  if (n > 100 && n < 200) return '백' + koCount(n - 100);
  if (n === 200) return '이백';
  return String(n);
}

/** Counts out loud and nothing else; the voice mode only changes the tone. */
export function repLine(mode: VoiceMode, n: number, _target = 0): string {
  const w = koCount(n);
  return mode === 'drill' ? `${w}!` : w;
}

export function formHint(mode: VoiceMode): string {
  switch (mode) {
    case 'drill':
      return '허리 펴라!';
    case 'pt':
      return '허리 펴고, 천천히요.';
    case 'mom':
      return '허리 좀 펴라.';
    default:
      return '허리를 펴 주세요.';
  }
}
