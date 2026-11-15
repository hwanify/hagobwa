import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { Platform, StyleSheet, View } from 'react-native';

import { AppTile, Button, Mono, ProgressBar, Row, Screen, T } from '@/components/ui';
import { appById } from '@/core/apps';
import { formatClock } from '@/core/format';
import { goHome } from '@/navigation';
import { useAppStore } from '@/store/app-store';
import { colors } from '@/theme';

/**
 * Stand-in for "the user is inside the locked app".
 * On a real device the OS shows the app itself and the native blocker re-locks it;
 * here we show the countdown so the whole loop can be tried in the browser.
 */
export default function Session() {
  const { app } = useLocalSearchParams<{ app?: string }>();
  const target = appById(app ?? '') ?? appById('youtube')!;
  const balance = useAppStore((s) => s.bank.balanceSec);
  const active = useAppStore((s) => s.bank.session);
  const tickSession = useAppStore((s) => s.tickSession);
  const skipAhead = useAppStore((s) => s.skipAhead);
  const closeApp = useAppStore((s) => s.closeApp);

  useEffect(() => {
    const id = setInterval(() => {
      if (tickSession().exhausted) {
        router.replace({ pathname: '/blocked', params: { app: target.id } });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [tickSession, target.id]);

  useEffect(() => {
    if (!active && balance <= 0) router.replace({ pathname: '/blocked', params: { app: target.id } });
  }, [active, balance, target.id]);

  const stop = () => {
    closeApp();
    goHome();
  };

  const skip = () => {
    if (skipAhead(60).exhausted) router.replace({ pathname: '/blocked', params: { app: target.id } });
  };

  return (
    <Screen bg={colors.ink} scroll={false} footer={<Button variant="paper" label="그만 보기" onPress={stop} />}>
      <Row style={{ gap: 12, marginTop: 8 }}>
        <AppTile appId={target.id} size={36} />
        <T style={{ color: colors.paper, fontSize: 16, fontWeight: '700' }}>{target.name} 보는 중</T>
      </Row>
      <View style={styles.grid}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={styles.tile} />
        ))}
      </View>
      <View style={styles.panel}>
        <T style={{ color: 'rgba(247,247,243,0.6)', fontSize: 12 }}>남은 시간</T>
        <Mono style={{ color: colors.paper, fontSize: 48, letterSpacing: -1 }}>{formatClock(balance)}</Mono>
        <View style={{ marginTop: 12 }}>
          <ProgressBar ratio={balance / 1800} track="rgba(255,255,255,0.1)" height={6} />
        </View>
        <T style={{ color: 'rgba(247,247,243,0.5)', fontSize: 11, marginTop: 8, lineHeight: 16 }}>
          {Platform.OS === 'web'
            ? '체험판 화면이에요. 실제 앱에서는 이 시간 동안 원래 앱이 열리고, 0이 되면 다시 잠겨요.'
            : '0이 되면 다시 잠겨요.'}
        </T>
        {Platform.OS === 'web' && (
          <Button variant="ghost" label="체험용: 1분 건너뛰기" onPress={skip} style={{ marginTop: 4 }} />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  grid: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 20 },
  tile: { width: '48%', flexGrow: 1, minHeight: 90, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.07)' },
  panel: { marginTop: 16, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.08)', padding: 18 },
});
