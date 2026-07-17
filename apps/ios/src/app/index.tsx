import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import type { LearningClockDto } from "@gurunet/contracts";
import { releaseRefreshDelay } from "@gurunet/domain";
import { api, signIn } from "@/lib/client";
import { syncIOSNotifications } from "@/lib/notifications";

type Data = {
  challenge?: {
    id: string;
    title: string;
    topic: string;
    difficulty: string;
    scenario: string;
    objective: string;
    deadlineAt: string;
    status?: string;
  };
  user: { name: string; pisScore: number; currentStreak: number };
  clock?: LearningClockDto;
  nextChallengeUnlockAt?: string;
  studyProfile?: { restDay?: number } | null;
  preferences?: {
    challengeAvailable?: boolean;
    deadlineWarning?: boolean;
    deadlineOffsetMinutes?: number;
    quietStartLocalTime?: string;
    quietEndLocalTime?: string;
  } | null;
  schedules?: Array<{
    id: string;
    title: string;
    daysOfWeek: number[];
    localTime: string;
    durationMinutes: number;
    reminderMinutesBefore: number;
    enabled: boolean;
  }>;
};

export default function Today() {
  const [data, setData] = useState<Data | null>(null);
  const [auth, setAuth] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const result = await api.request<Data>("/bootstrap");
      setData(result);
      setAuth(false);
      void syncIOSNotifications(false, result).catch(() => undefined);
    } catch (error: unknown) {
      if (error && typeof error === "object" && "status" in error && error.status === 401) {
        setAuth(true);
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (!data?.clock) return;
    const delay = releaseRefreshDelay(data.clock);
    const timer = delay === null ? undefined : setTimeout(() => void load(), delay);
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void load();
    });
    return () => {
      if (timer) clearTimeout(timer);
      subscription.remove();
    };
  }, [data?.clock, load]);

  if (auth) return <Login onDone={load} />;
  if (!data) return <View style={s.center}><ActivityIndicator /></View>;
  const challenge = data.challenge;

  return (
    <ScrollView
      style={s.page}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={s.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} />}
    >
      <Text style={s.kicker}>PERSONALIZED PRACTICE</Text>
      <Text style={s.greeting}>
        {data.user.currentStreak ? `${data.user.currentStreak}-day rhythm` : "Begin today's work"}
      </Text>
      {challenge ? (
        <>
          <View style={s.pills}>
            <Text style={s.pill}>{challenge.difficulty}</Text>
            <Text style={s.meta}>{challenge.topic}</Text>
            <Text style={s.meta}>PIS {data.user.pisScore.toFixed(1)}</Text>
          </View>
          <Text style={s.title}>{challenge.title}</Text>
          <Text style={s.body}>{challenge.scenario}</Text>
          <Text style={s.section}>Objective</Text>
          <Text style={s.body}>{challenge.objective}</Text>
          <Pressable
            style={s.button}
            onPress={() => router.push({ pathname: "/respond", params: { challengeId: challenge.id } })}
          >
            <Text style={s.buttonText}>Compose response</Text>
          </Pressable>
        </>
      ) : (
        <Text style={s.body}>Your next challenge will appear at 08:00.</Text>
      )}
    </ScrollView>
  );
}

function Login({ onDone }: { onDone: () => Promise<void> | void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      await signIn(email, password);
      await syncIOSNotifications(true).catch(() => false);
      await onDone();
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={s.login}>
      <Text style={s.kicker}>GURUNET</Text>
      <Text style={s.title}>Sign in</Text>
      <TextInput style={s.input} autoCapitalize="none" keyboardType="email-address" placeholder="Email" value={email} onChangeText={setEmail} />
      <TextInput style={s.input} secureTextEntry placeholder="Password" value={password} onChangeText={setPassword} />
      {error ? <Text style={s.error}>{error}</Text> : null}
      <Pressable style={[s.button, busy && s.disabled]} disabled={busy} onPress={submit}>
        <Text style={s.buttonText}>{busy ? "Signing in..." : "Continue"}</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f7f8f8" },
  content: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 48 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  login: { flex: 1, justifyContent: "center", padding: 22, backgroundColor: "#f7f8f8" },
  kicker: { fontSize: 12, fontWeight: "700", color: "#167d87", letterSpacing: 1 },
  greeting: { fontSize: 17, color: "#657278", marginTop: 8, marginBottom: 26 },
  input: { height: 52, borderRadius: 10, backgroundColor: "#fff", borderWidth: StyleSheet.hairlineWidth, borderColor: "#c7ced0", paddingHorizontal: 14, fontSize: 16, marginBottom: 12 },
  pills: { flexDirection: "row", alignItems: "center", gap: 10 },
  pill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 10, overflow: "hidden", backgroundColor: "#e1eff0", color: "#145f66", fontSize: 12 },
  meta: { fontSize: 12, color: "#657278" },
  title: { fontSize: 29, lineHeight: 35, fontWeight: "600", color: "#172126", marginTop: 18, marginBottom: 16 },
  body: { fontSize: 17, lineHeight: 27, color: "#354348" },
  section: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", color: "#657278", marginTop: 28, marginBottom: 8 },
  button: { marginTop: 18, backgroundColor: "#167d87", paddingVertical: 15, borderRadius: 10, alignItems: "center" },
  buttonText: { color: "white", fontSize: 17, fontWeight: "600" },
  disabled: { opacity: 0.65 },
  error: { color: "#b84d49", marginTop: 2 },
});
