import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api } from "@/lib/client";

type RankingRow = { id: string; name: string; rank: number; isYou: boolean; connectionState: "You" | "Available" | "Incoming" | "Outgoing" | "Connected" };
type Connection = { id: string; name: string; preferredProfession: string; pisScore: number; currentStreak: number; latestScore: number | null };
type Invitation = { id: string; direction: "Incoming" | "Outgoing"; profile: { id: string; name: string } };

export default function Network() {
  const [ranking, setRanking] = useState<RankingRow[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);

  async function load() {
    const [network, requests] = await Promise.all([
      api.request<{ leaderboard: RankingRow[]; friends: Connection[] }>("/social/network"),
      api.request<{ invitations: Invitation[] }>("/social/invitations"),
    ]);
    setRanking(network.leaderboard);
    setConnections(network.friends);
    setInvitations(requests.invitations);
  }
  useEffect(() => {
    let active = true;
    Promise.all([
      api.request<{ leaderboard: RankingRow[]; friends: Connection[] }>("/social/network"),
      api.request<{ invitations: Invitation[] }>("/social/invitations"),
    ]).then(([network, requests]) => {
        if (!active) return;
        setRanking(network.leaderboard);
        setConnections(network.friends);
        setInvitations(requests.invitations);
      })
      .catch(() => undefined);
    return () => { active = false; };
  }, []);
  async function invite(id: string) {
    await api.request("/social/invitations", { method: "POST", body: JSON.stringify({ userId: id }) });
    await load();
  }
  async function act(id: string, action: "accept" | "decline") {
    await api.request(`/social/invitations/${id}/${action}`, { method: "POST" });
    await load();
  }

  return <ScrollView style={s.page} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.content}>
    <Text style={s.intro}>See opted-in learner ranks without exposing scores or learning history. Details unlock only after connection.</Text>
    {invitations.some((item) => item.direction === "Incoming") ? <><Text style={s.section}>REQUESTS</Text>{invitations.filter((item) => item.direction === "Incoming").map((item) => <View style={s.row} key={item.id}><Text style={s.name}>{item.profile.name}</Text><Pressable onPress={() => void act(item.id, "accept")}><Text style={s.connect}>Accept</Text></Pressable><Pressable onPress={() => void act(item.id, "decline")}><Text style={s.state}>Decline</Text></Pressable></View>)}</> : null}
    <Text style={s.section}>VISIBLE RANKING</Text>
    {ranking.map((person) => <View style={s.row} key={person.id}>
      <Text style={s.rank}>#{person.rank}</Text><Text style={s.name}>{person.name}{person.isYou ? " (you)" : ""}</Text>
      {person.connectionState === "Available" ? <Pressable onPress={() => void invite(person.id)}><Text style={s.connect}>Connect</Text></Pressable> : <Text style={s.state}>{person.connectionState === "Outgoing" ? "Requested" : person.connectionState}</Text>}
    </View>)}
    <Text style={s.section}>CONNECTIONS</Text>
    {connections.map((person) => <View style={s.connection} key={person.id}><Text style={s.name}>{person.name}</Text><Text style={s.meta}>{person.preferredProfession}</Text><Text style={s.detail}>{person.pisScore.toFixed(1)} PIS · {person.currentStreak} streak · {person.latestScore ?? "-"} latest</Text></View>)}
  </ScrollView>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#f7f8f8" }, content: { padding: 20, paddingBottom: 48 }, intro: { fontSize: 15, lineHeight: 22, color: "#657278", marginBottom: 18 },
  section: { fontSize: 12, color: "#657278", marginTop: 20, marginBottom: 7 }, row: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#b9c3c5" },
  rank: { width: 42, fontSize: 14, fontWeight: "600", color: "#167d87" }, name: { flex: 1, fontSize: 16, fontWeight: "600", color: "#172126" }, connect: { fontSize: 15, fontWeight: "600", color: "#167d87" }, state: { fontSize: 12, color: "#657278" },
  connection: { paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#b9c3c5" }, meta: { fontSize: 13, color: "#657278", marginTop: 3 }, detail: { fontSize: 12, color: "#167d87", marginTop: 5 },
});
