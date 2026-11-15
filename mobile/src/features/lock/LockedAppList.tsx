import Ionicons from '@expo/vector-icons/Ionicons';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import * as ScreenTime from 'react-native-device-activity';

import { Divider, Muted, Row, T } from '@/components/ui';
import { blocker, SELECTION_ID } from '@/platform/blocker';
import { useAppStore } from '@/store/app-store';
import { colors } from '@/theme';

import { PickedItemLabel, splitSelection, type PickedItem } from '../../../modules/locked-apps';

const KIND_LABEL: Record<PickedItem['kind'], string> = { app: '앱', category: '카테고리', web: '웹사이트' };

function readItems(): PickedItem[] {
  if (blocker.kind !== 'ios-screentime') return [];
  try {
    const token = ScreenTime.getFamilyActivitySelectionId(SELECTION_ID);
    return token ? splitSelection(token) : [];
  } catch {
    return [];
  }
}

/**
 * The apps picked in Apple's picker, each with its real icon and name (drawn by iOS),
 * and a button to stop locking it. `refreshKey` forces a re-read after the picker closes.
 */
export function LockedAppList({ open, refreshKey }: { open: boolean; refreshKey?: number }) {
  const [items, setItems] = useState(readItems);
  const [confirm, setConfirm] = useState<string | null>(null);

  const refresh = useCallback(() => setItems(readItems()), []);
  useEffect(refresh, [refresh, refreshKey]);

  const remove = (item: PickedItem) => {
    try {
      ScreenTime.difference(
        { activitySelectionId: SELECTION_ID },
        { activitySelectionToken: item.token },
        { persistAsActivitySelectionId: SELECTION_ID },
      );
    } catch {
      // Keep the list as it was; the row stays visible.
    }
    setConfirm(null);
    refresh();
    void useAppStore.getState().syncBlocker();
  };

  if (items.length === 0) return null;

  return (
    <View>
      {items.map((item, i) => (
        <View key={item.token}>
          {i > 0 && <Divider />}
          <Row style={styles.row}>
            <View style={{ flex: 1 }}>
              {PickedItemLabel ? (
                <PickedItemLabel item={item.token} style={styles.label} />
              ) : (
                <T style={{ fontWeight: '600' }}>{KIND_LABEL[item.kind]}</T>
              )}
            </View>
            {confirm === item.token ? (
              <Row style={{ gap: 12 }}>
                <Pressable accessibilityRole="button" onPress={() => setConfirm(null)} hitSlop={8}>
                  <T style={{ color: colors.mute, fontWeight: '600' }}>취소</T>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => remove(item)} hitSlop={8}>
                  <T style={{ color: colors.red, fontWeight: '700' }}>잠금 해제</T>
                </Pressable>
              </Row>
            ) : (
              <Row style={{ gap: 10 }}>
                <Ionicons name={open ? 'lock-open-outline' : 'lock-closed'} size={18} color={open ? colors.mute : colors.red} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="이 앱 잠그지 않기"
                  onPress={() => setConfirm(item.token)}
                  hitSlop={8}
                >
                  <Ionicons name="close" size={20} color={colors.mute} />
                </Pressable>
              </Row>
            )}
          </Row>
        </View>
      ))}
      {confirm && <Muted style={{ fontSize: 12, marginTop: 4 }}>잠금 해제하면 이 앱은 운동 안 해도 열려요.</Muted>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 12, paddingVertical: 6, minHeight: 52 },
  label: { height: 44, width: '100%' },
});
