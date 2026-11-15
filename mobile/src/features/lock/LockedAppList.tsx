import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Divider, Muted, Row, T } from '@/components/ui';
import { colors } from '@/theme';

import { PickedItemLabel, type PickedItem } from '../../../modules/locked-apps';
import { removePicked, usePickedItems } from './LockPicker';

const KIND_LABEL: Record<PickedItem['kind'], string> = { app: '앱', category: '카테고리', web: '웹사이트' };

/**
 * The apps picked in Apple's picker, each with its real icon and name (drawn by iOS),
 * and an ✕ to stop locking it. Shared state: home and settings always show the same list.
 */
export function LockedAppList() {
  const items = usePickedItems();
  const [confirm, setConfirm] = useState<string | null>(null);

  if (items.length === 0) return null;

  return (
    <View>
      {items.map((item, i) => {
        const asking = confirm === item.token;
        return (
          <View key={item.token}>
            {i > 0 && <Divider />}
            <Row style={styles.row}>
              <View style={{ flex: 1, opacity: asking ? 0.45 : 1 }}>
                {PickedItemLabel ? (
                  <PickedItemLabel item={item.token} style={styles.label} />
                ) : (
                  <T style={{ fontWeight: '600' }}>{KIND_LABEL[item.kind]}</T>
                )}
              </View>
              {asking ? (
                <Row style={{ gap: 16 }}>
                  <Pressable accessibilityRole="button" onPress={() => setConfirm(null)} hitSlop={10}>
                    <T style={{ color: colors.mute, fontWeight: '600' }}>취소</T>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      setConfirm(null);
                      removePicked(item);
                    }}
                    hitSlop={10}
                  >
                    <T style={{ color: colors.red, fontWeight: '700' }}>빼기</T>
                  </Pressable>
                </Row>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="잠글 앱에서 빼기"
                  onPress={() => setConfirm(item.token)}
                  hitSlop={12}
                  style={styles.remove}
                >
                  <Ionicons name="close" size={18} color={colors.mute} />
                </Pressable>
              )}
            </Row>
          </View>
        );
      })}
      {confirm && <Muted style={{ fontSize: 12, marginTop: 4 }}>빼면 이 앱은 운동하지 않아도 열려요.</Muted>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: 12, paddingVertical: 6, minHeight: 54 },
  label: { height: 44, width: '100%' },
  remove: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.ground },
});
