import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";

import {
  AppTile,
  Button,
  Card,
  Divider,
  Mono,
  Muted,
  Ring,
  Row,
  Screen,
  T,
} from "@/components/ui";
import { openCharge } from "@/navigation";
import { BarbellIcon } from "@/components/tab-icons";
import { appById, type AppId } from "@/core/apps";
import { addDays, startOfWeek } from "@/core/dates";
import { formatDuration, minutesOf } from "@/core/format";
import { EXERCISE_LABEL } from "@/core/rates";
import { capFor, streakDays, todayReps, usageBetween } from "@/core/timebank";
import { EmergencyUnlock } from "@/features/lock/EmergencyUnlock";
import { useLockPicker } from "@/features/lock/LockPicker";
import { blocker } from "@/platform/blocker";
import { useAppStore, useNow } from "@/store/app-store";
import { colors } from "@/theme";

export default function Home() {
  const now = useNow(30_000);
  const bank = useAppStore((s) => s.bank);
  const goalHours = useAppStore((s) => s.goalHours);
  const locked = useAppStore((s) => s.lockedApps);
  const openApp = useAppStore((s) => s.openApp);

  const balance = bank.balanceSec;
  const streak = streakDays(bank, now);
  const reps = todayReps(bank, now);
  const week = startOfWeek(now);
  const weekUsed = usageBetween(bank, week, addDays(week, 7));
  const last = bank.workouts.reduce<(typeof bank.workouts)[number] | undefined>(
    (a, w) => (!a || w.at > a.at ? w : a),
    undefined,
  );

  const onApp = (id: AppId) => {
    if (openApp(id)) router.push({ pathname: "/session", params: { app: id } });
    else router.push({ pathname: "/blocked", params: { app: id } });
  };

  return (
    <Screen edges={["top"]}>
      <Row style={{ justifyContent: "space-between" }}>
        <T style={styles.logo}>
          하고봐<T style={[styles.logo, { color: colors.red }]}>.</T>
        </T>
        {streak > 0 && (
          <Row style={styles.streak}>
            <Ionicons name="flame" size={14} color={colors.red} />
            <T style={{ fontSize: 13, fontWeight: "700" }}>{streak}일 연속</T>
          </Row>
        )}
      </Row>

      <View style={{ alignItems: "center", marginTop: 20 }}>
        <Ring ratio={balance / capFor(goalHours)}>
          <Muted style={{ fontSize: 12, fontWeight: "600" }}>남은 시간</Muted>
          <Mono style={{ fontSize: 44, letterSpacing: -1 }}>
            {minutesOf(balance)}
            <T style={{ fontSize: 18, fontWeight: "700" }}>분</T>
          </Mono>
          <Muted style={{ fontSize: 11 }}>
            최대 {goalHours}시간까지 모여요
          </Muted>
        </Ring>
      </View>

      <Row style={{ gap: 8, marginTop: 20 }}>
        <Card style={{ flex: 1 }}>
          <Muted style={{ fontSize: 12 }}>오늘 운동</Muted>
          <T style={styles.stat}>{reps}회</T>
        </Card>
        <Card style={{ flex: 1 }}>
          <Muted style={{ fontSize: 12 }}>이번 주 사용</Muted>
          <T style={styles.stat}>{formatDuration(weekUsed)}</T>
        </Card>
      </Row>

      <Button
        style={{ marginTop: 12 }}
        label="운동하고 충전하기"
        icon={<BarbellIcon color={colors.white} size={20} />}
        onPress={() => router.push("/workout")}
      />

      {last && (
        <Pressable
          accessibilityRole="button"
          onPress={() => openCharge(last.id)}
          style={styles.lastCharge}
        >
          <Ionicons name="receipt-outline" size={18} color={colors.ink} />
          <T style={{ flex: 1, fontWeight: "600" }}>
            최근 충전 · {EXERCISE_LABEL[last.exercise]} {last.reps}회
          </T>
          <Mono style={{ color: colors.red }}>
            +{formatDuration(last.earnedSec)}
          </Mono>
          <Ionicons name="chevron-forward" size={16} color={colors.mute} />
        </Pressable>
      )}

      {blocker.kind === "ios-screentime" ? (
        <NativeLockStatus open={balance >= 60} />
      ) : (
        <>
          <Row
            style={{
              justifyContent: "space-between",
              marginTop: 24,
              marginBottom: 4,
            }}
          >
            <T style={{ fontSize: 15, fontWeight: "700" }}>
              잠긴 앱 {locked.length}
            </T>
            <Muted style={{ fontSize: 12 }}>눌러서 열어보기</Muted>
          </Row>
          {locked.length === 0 ? (
            <Muted style={{ paddingVertical: 12 }}>
              설정에서 잠글 앱을 골라 주세요.
            </Muted>
          ) : (
            locked.map((id, i) => {
              const app = appById(id);
              const open = balance > 0;
              return (
                <View key={id}>
                  {i > 0 && <Divider />}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => onApp(id)}
                    style={styles.appRow}
                  >
                    <AppTile appId={id} size={36} />
                    <T style={{ flex: 1, fontSize: 15, fontWeight: "600" }}>
                      {app?.name ?? id}
                    </T>
                    <Ionicons
                      name={open ? "lock-open-outline" : "lock-closed"}
                      size={20}
                      color={open ? colors.mute : colors.red}
                    />
                  </Pressable>
                </View>
              );
            })
          )}
          <Card style={{ marginTop: 20 }}>
            <Muted style={{ fontSize: 12, lineHeight: 18 }}>
              {blocker.description}
            </Muted>
          </Card>
        </>
      )}
    </Screen>
  );
}

/** iOS: a compact lock summary; the 잠금 tab has the list, editing and emergency unlock. */
function NativeLockStatus({ open }: { open: boolean }) {
  const picker = useLockPicker();
  const locked = !open && picker.count > 0;
  return (
    <>
      <Pressable accessibilityRole="button" onPress={() => router.navigate('/lock')} style={styles.lockRow}>
        <Ionicons name={locked ? 'lock-closed' : 'lock-open-outline'} size={20} color={locked ? colors.red : colors.mute} />
        <View style={{ flex: 1 }}>
          <T style={{ fontSize: 15, fontWeight: '700' }}>
            {picker.count === 0 ? '잠근 앱이 없어요' : `잠긴 앱 ${picker.count} · ${locked ? '잠겨 있어요' : '열려 있어요'}`}
          </T>
          <Muted style={{ fontSize: 12 }}>
            {picker.count === 0 ? '눌러서 잠글 앱을 골라 주세요' : locked ? '운동하고 충전하면 열려요' : '충전한 시간을 다 쓰면 다시 잠겨요'}
          </Muted>
        </View>
        <Ionicons name="chevron-forward" size={16} color={colors.mute} />
      </Pressable>
      {locked && <EmergencyUnlock />}
    </>
  );
}

const styles = StyleSheet.create({
  logo: { fontSize: 24, fontWeight: "900", letterSpacing: -1 },
  streak: {
    gap: 4,
    backgroundColor: colors.ground,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  stat: { fontSize: 18, fontWeight: "800", marginTop: 2 },
  appRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 10,
  },
  lockRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 20,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.ground,
  },
  lastCharge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
  },
});
