import type { Challenge, Difficulty, User } from "@/lib/domain";
import { createId } from "@/lib/store";
import {
  challengeDateKeyFor,
  getUserTimezone,
  localDeadlineIso,
  nowIso,
} from "@/lib/time";

const topics = [
  "VLAN and STP troubleshooting",
  "OSPF adjacency recovery",
  "Firewall NAT and ACL review",
  "Linux log investigation",
  "Wireless roaming analysis",
  "BGP route selection",
  "Network automation script review",
  "Packet analysis under pressure",
];

const templates = [
  {
    title: "Intermittent VLAN reachability after switch maintenance",
    topic: "VLAN and STP troubleshooting",
    scenario:
      "Users on VLAN 30 report random application drops after an access switch reload. Core uplinks look healthy, but STP logs show topology changes and one trunk has an unexpected native VLAN.",
    objective:
      "Identify the most likely fault path, write a safe verification sequence, and recommend a minimal change plan.",
    allowedTools: [
      "show interfaces trunk",
      "show spanning-tree detail",
      "show mac address-table dynamic",
      "show logging",
      "packet capture notes",
    ],
    solution:
      "Validate trunk allowed/native VLAN state, compare STP root and topology change counters, trace MAC movement, confirm whether VLAN 30 traverses the affected trunk, then correct the native/allowed VLAN mismatch during a controlled change with rollback.",
  },
  {
    title: "OSPF neighbor stuck after firewall policy update",
    topic: "OSPF adjacency recovery",
    scenario:
      "A branch router no longer forms OSPF adjacency with the distribution firewall after a rule cleanup. ICMP works between interface IPs, but routes are missing and hello counters are not incrementing.",
    objective:
      "Separate L3 reachability from protocol reachability and produce a safe test plan.",
    allowedTools: [
      "show ip ospf neighbor",
      "show ip ospf interface",
      "show access-lists",
      "packet capture",
      "firewall session table",
    ],
    solution:
      "Confirm OSPF network type, hello/dead timers, area/authentication, and multicast/protocol 89 handling. Verify firewall policy permits OSPF, not only ICMP, then restore the minimum required protocol allowance.",
  },
  {
    title: "Suspicious Linux authentication burst",
    topic: "Linux log investigation",
    scenario:
      "A monitoring alert reports SSH authentication failures from two foreign IPs and one internal jump host. CPU and network graphs are normal, but the service account has a successful login after the burst.",
    objective:
      "Triage whether this is failed noise, credential misuse, or expected automation.",
    allowedTools: [
      "journalctl",
      "last",
      "lastlog",
      "grep",
      "ss",
      "audit logs",
    ],
    solution:
      "Correlate failed and accepted SSH events, source IP ownership, service account usage, command history where available, active sessions, and authorized_keys changes before deciding containment.",
  },
];

export function difficultyForPis(pis: number): Difficulty {
  if (pis < 45) return "Guided";
  if (pis <= 60) return "Normal";
  if (pis <= 75) return "Advanced";
  if (pis <= 90) return "Production";
  return "Expert";
}

export function buildChallengeFromAi({
  user,
  dateKey,
  deadlineAt,
  recovery,
  pressure,
  ai,
}: {
  user: User;
  dateKey: string;
  deadlineAt: string;
  recovery: boolean;
  pressure: boolean;
  ai: {
    title: string;
    difficulty: Difficulty;
    topic: string;
    scenario: string;
    objective: string;
    constraints: string[];
    allowedTools: string[];
    expectedAnswerFormat: string;
    submissionRequirements: string[];
    solution: string;
    antiGenericRequirement: string;
  };
}): Challenge {
  return {
    id: createId("chl"),
    userId: user.id,
    dateKey,
    title: recovery ? `Recovery drill: ${ai.title}` : ai.title,
    difficulty: ai.difficulty,
    topic: recovery ? `Recovery: ${ai.topic}` : ai.topic,
    scenario: recovery
      ? `${ai.scenario} This challenge includes recovery work because the previous required submission was missed.`
      : ai.scenario,
    objective: ai.objective,
    constraints: ai.constraints,
    allowedTools: ai.allowedTools,
    expectedAnswerFormat: ai.expectedAnswerFormat,
    submissionRequirements: ai.submissionRequirements,
    deadlineAt,
    solution: ai.solution,
    antiGenericRequirement: ai.antiGenericRequirement,
    status: pressure ? "Pressure Challenge" : recovery ? "Recovery Challenge" : "Active",
    isRecovery: recovery,
    isPressure: pressure,
    createdAt: nowIso(),
  };
}

export function generateChallenge(
  user: User,
  options?: { recovery?: boolean; pressure?: boolean; dateKey?: string },
) {
  const timezone = getUserTimezone(user.timezone);
  const today = options?.dateKey ?? challengeDateKeyFor(new Date(), timezone);
  const difficulty = difficultyForPis(user.pisScore);
  const seed = today
    .split("")
    .reduce((total, char) => total + char.charCodeAt(0), user.id.length);
  const template = templates[seed % templates.length];
  const topic = options?.recovery ? "Recovery: " + template.topic : template.topic;

  const challenge: Challenge = {
    id: createId("chl"),
    userId: user.id,
    dateKey: today,
    title: options?.recovery
      ? `Recovery drill: ${template.title}`
      : template.title,
    difficulty,
    topic: topics.includes(template.topic) ? topic : template.topic,
    scenario: options?.recovery
      ? `${template.scenario} This challenge includes recovery work because the previous required submission was missed.`
      : template.scenario,
    objective: template.objective,
    constraints: [
      "Do not reveal or assume the solution before submitting.",
      "Do not recommend destructive changes without verification and rollback.",
      "Explain why the first three checks are ordered that way.",
      "Tie the final recommendation to evidence.",
    ],
    allowedTools: template.allowedTools,
    expectedAnswerFormat:
      "Hypothesis, ordered checks, expected observations, risk/rollback notes, final recommendation.",
    submissionRequirements: [
      "Root cause hypothesis",
      "Command or evidence sequence",
      "Assumptions and risks",
      "Rollback or safety note",
      "Final recommendation",
    ],
    deadlineAt: localDeadlineIso(today, timezone, 12),
    solution: template.solution,
    antiGenericRequirement:
      "Explain why your first three checks are ordered that way and what result would disprove your hypothesis.",
    status: options?.pressure ? "Pressure Challenge" : options?.recovery ? "Recovery Challenge" : "Active",
    isRecovery: Boolean(options?.recovery),
    isPressure: Boolean(options?.pressure),
    createdAt: nowIso(),
  };

  return challenge;
}
