import { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { api } from "@/lib/client";
import { disableIOSNotifications, syncIOSNotifications } from "@/lib/notifications";

type Preferences = { challengeAvailable: boolean; studyWindowReminder: boolean; deadlineWarning: boolean };

export default function Settings() {
  const [deviceAlerts, setDeviceAlerts] = useState(false);
  const [preferences, setPreferences] = useState<Preferences>({ challengeAvailable: true, studyWindowReminder: true, deadlineWarning: true });
  const [discovery, setDiscovery] = useState(false);

  useEffect(() => {
    void Promise.all([
      api.request<{ preferences: Preferences }>("/notifications/preferences").then((result) => setPreferences(result.preferences)),
      api.request<{ settings: { discoverable: boolean } }>("/social/settings").then((result) => setDiscovery(result.settings.discoverable)),
      syncIOSNotifications(false).then(setDeviceAlerts),
    ]).catch(() => undefined);
  }, []);

  async function setReminder(key: keyof Preferences, value: boolean) {
    setPreferences((current) => ({ ...current, [key]: value }));
    await api.request("/notifications/preferences", { method: "PATCH", body: JSON.stringify({ [key]: value }) });
  }

  async function setDeviceNotifications(value: boolean) {
    const enabled = value ? await syncIOSNotifications(true) : (await disableIOSNotifications(), false);
    setDeviceAlerts(enabled);
  }

  return <ScrollView style={s.page} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.content}>
    <Text style={s.section}>REMINDERS</Text>
    <Row label="Notifications on this iPhone" value={deviceAlerts} set={(value) => void setDeviceNotifications(value)} />
    <Row label="Challenge ready" value={preferences.challengeAvailable} set={(value) => void setReminder("challengeAvailable", value)} />
    <Row label="Study window" value={preferences.studyWindowReminder} set={(value) => void setReminder("studyWindowReminder", value)} />
    <Row label="Deadline warning" value={preferences.deadlineWarning} set={(value) => void setReminder("deadlineWarning", value)} />
    <Text style={s.note}>Quiet hours and recurring blocks follow the rhythm saved to your account.</Text>
    <Text style={s.section}>PRIVACY</Text>
    <Row label="Show my name and rank" value={discovery} set={(value) => { setDiscovery(value); void api.request("/social/settings", { method: "PATCH", body: JSON.stringify({ discoverable: value }) }); }} />
    <Text style={s.section}>ACCOUNT</Text><View style={s.row}><Text style={s.label}>Connected accounts</Text></View><View style={s.row}><Text style={s.label}>Export my data</Text></View><View style={s.row}><Text style={s.danger}>Delete account</Text></View>
  </ScrollView>;
}

function Row({ label, value, set }: { label: string; value: boolean; set: (value: boolean) => void }) { return <View style={s.row}><Text style={s.label}>{label}</Text><Switch value={value} onValueChange={set} /></View>; }
const s = StyleSheet.create({ page: { flex: 1, backgroundColor: "#f2f2f7" }, content: { padding: 20, paddingBottom: 48 }, section: { fontSize: 12, color: "#657278", marginTop: 22, marginBottom: 7 }, row: { minHeight: 52, backgroundColor: "white", borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#d1d1d6", paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }, label: { fontSize: 16, color: "#172126", flex: 1 }, note: { fontSize: 12, lineHeight: 18, color: "#657278", marginTop: 10 }, danger: { fontSize: 16, color: "#b84d49" } });
