export type AppId = 'youtube' | 'instagram' | 'tiktok' | 'webtoon' | 'chzzk' | 'x';

export interface LockableApp {
  id: AppId;
  name: string;
  glyph: string;
  /** Android package name, used by the Android blocker. iOS uses FamilyActivityPicker tokens instead. */
  androidPackage?: string;
}

export const LOCKABLE_APPS: LockableApp[] = [
  { id: 'youtube', name: '유튜브', glyph: '유', androidPackage: 'com.google.android.youtube' },
  { id: 'instagram', name: '인스타그램', glyph: '인', androidPackage: 'com.instagram.android' },
  { id: 'tiktok', name: '틱톡', glyph: '틱', androidPackage: 'com.zhiliaoapp.musically' },
  { id: 'webtoon', name: '네이버 웹툰', glyph: '웹', androidPackage: 'com.nhn.android.webtoon' },
  { id: 'chzzk', name: '치지직', glyph: '치' },
  { id: 'x', name: 'X', glyph: 'X', androidPackage: 'com.twitter.android' },
];

export function appById(id: string): LockableApp | undefined {
  return LOCKABLE_APPS.find((a) => a.id === id);
}
