import { useEffect, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { api } from "@/lib/client";
import { disableAndroidNotifications, syncAndroidNotifications } from "@/lib/notifications";

type Preferences = { challengeAvailable: boolean; studyWindowReminder: boolean; deadlineWarning: boolean };

export default function Settings() {
  const [deviceAlerts, setDeviceAlerts] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>({ challengeAvailable: true, studyWindowReminder: true, deadlineWarning: true });
  const [social, setSocial] = useState(false);

  useEffect(() => {
    void Promise.all([
      api.request<{ preferences: Preferences }>("/notifications/preferences").then((result) => setPreferences(result.preferences)),
      api.request<{ settings: { discoverable: boolean } }>("/social/settings").then((result) => setSocial(result.settings.discoverable)),
      syncAndroidNotifications(false).then(setDeviceAlerts),
    ]).catch(() => undefined);
  }, []);

  async function setReminder(key: keyof Preferences, value: boolean) {
    setPreferences((current) => ({ ...current, [key]: value }));
    await api.request("/notifications/preferences", { method: "PATCH", body: JSON.stringify({ [key]: value }) });
  }

  async function setDeviceNotifications(value: boolean) {
    const enabled = value ? await syncAndroidNotifications(true) : (await disableAndroidNotifications(), false);
    setDeviceAlerts(enabled);
    if (value && !enabled) Alert.alert("Notifications remain off", "Allow notifications in Android settings to receive learning reminders.");
  }

  return <ScrollView style={s.page} contentContainerStyle={s.content}>
    <Text style={s.h1}>Settings</Text>
    <Text style={s.section}>NOTIFICATIONS</Text>
    <Row label="Notifications on this device" value={deviceAlerts} setValue={(value) => void setDeviceNotifications(value)} />
    <Row label="Challenge ready" value={preferences.challengeAvailable} setValue={(value) => void setReminder("challengeAvailable", value)} />
    <Row label="Study window" value={preferences.studyWindowReminder} setValue={(value) => void setReminder("studyWindowReminder", value)} />
    <Row label="Deadline warning" value={preferences.deadlineWarning} setValue={(value) => void setReminder("deadlineWarning", value)} />
    <Text style={s.note}>Quiet hours and recurring study blocks are synchronized from your account settings.</Text>
    <Text style={s.section}>PRIVACY</Text>
    <Row label="Show my name and rank for connections" value={social} setValue={(value) => { setSocial(value); void api.request("/social/settings", { method: "PATCH", body: JSON.stringify({ discoverable: value }) }); }} />
    <Text style={s.section}>ACCOUNT</Text>
    <Pressable style={s.item} onPress={() => Alert.alert("Export requested", "Your learning export will be downloaded securely.")}><Text style={s.label}>Export my data</Text></Pressable>
    <Pressable style={s.item} onPress={() => Alert.alert("Delete account", "This permanently removes the account and private learning data.")}><Text style={s.danger}>Delete account</Text></Pressable>
  </ScrollView>;
}

function Row({ label, value, setValue }: { label: string; value: boolean; setValue: (value: boolean) => void }) {
  return <View style={s.item}><Text style={s.label}>{label}</Text><Switch value={value} onValueChange={setValue} trackColor={{ true: "#71b8bc" }} /></View>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f7f8f8" }, content: { padding: 20, paddingBottom: 48 }, h1: { fontSize: 30, fontWeight: "600", color: "#172126", marginBottom: 28 },
  section: { fontSize: 12, fontWeight: "700", color: "#657278", marginTop: 22, marginBottom: 6 }, item: { minHeight: 58, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderColor: "#dce3e4" },
  label: { fontSize: 15, color: "#172126", flex: 1 }, note: { fontSize: 12, lineHeight: 18, color: "#657278", marginTop: 10 }, danger: { fontSize: 15, color: "#b84d49" },
});
