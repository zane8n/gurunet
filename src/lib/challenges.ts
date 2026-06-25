import type { Challenge, Difficulty, User } from "@/lib/domain";
import { createId } from "@/lib/store";
import {
  challengeDateKeyFor,
  getUserTimezone,
  localDeadlineIso,
  nowIso,
} from "@/lib/time";

type ChallengeTemplate = {
  title: string;
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

const defaultExpectedAnswerFormat = [
  "1. Most Likely Root Cause / Core Answer",
  "2. Evidence",
  "- Evidence 1",
  "- Evidence 2",
  "- Evidence 3",
  "3. Immediate Containment Plan",
  "4. Exact Commands / Checks / Work Product",
  "5. Verification Steps",
  "6. Long-Term Prevention",
  "7. Why I Reject Other Causes",
  "8. Risk / Rollback",
].join("\n");

const templates: ChallengeTemplate[] = [
  {
    title: "High CPU on Core Switch During Broadcast Storm",
    topic: "VLAN and STP troubleshooting",
    scenario: [
      "Scenario / Background",
      "At a remote site, users report intermittent access to file servers, VoIP phones dropping calls, slow browsing, and Wi-Fi disconnects. No physical outage is reported. NMS shows CPU spikes on SW-CORE-01. A contractor recently connected a small unmanaged switch in an office. You have SSH access to the core switch.",
      "",
      "Evidence Provided",
      "CPU",
      "SW-CORE-01# show processes cpu sorted",
      "CPU utilization for five seconds: 88%/71%",
      "CPU utilization for one minute: 84%",
      "CPU utilization for five minutes: 82%",
      "PID Runtime(ms) Invoked uSecs 5Sec 1Min 5Min TTY Process",
      " 93 23423423   987654 23712 69.4% 68.2% 67.1% 0 STP",
      "",
      "MAC Table",
      "SW-CORE-01# show mac address-table dynamic | include 0050.56aa.bb01",
      "Vlan 30 0050.56aa.bb01 DYNAMIC Gi1/0/18",
      "Vlan 30 0050.56aa.bb01 DYNAMIC Gi1/0/22",
      "",
      "Logs",
      "%SW_MATM-4-MACFLAP_NOTIF: Host 0050.56aa.bb01 in vlan 30 is flapping between Gi1/0/18 and Gi1/0/22",
      "",
      "STP",
      "show spanning-tree summary",
      "Number of topology changes 4287 last change occurred 00:00:07 ago",
      "",
      "CDP",
      "Gi1/0/18   IP Phone",
      "Gi1/0/22   not advertised",
      "",
      "Optional Lab",
      "Model two access ports bridged by an unmanaged switch and observe MAC flapping, STP topology changes, and CPU pressure.",
      "",
      "Submission Deadline",
      "15:00 local time. Do not reveal the solution until after submission.",
    ].join("\n"),
    objective:
      "Determine the most likely cause and propose the safest immediate response and long-term prevention plan while keeping production impact as low as possible.",
    constraints: [
      "You cannot reboot the core switch.",
      "You cannot shut down the whole floor.",
      "You cannot disable STP globally.",
      "You cannot physically visit the site.",
      "Only one access port may be shut down remotely.",
      "No packet captures may be invented.",
    ],
    allowedTools: [
      "show spanning-tree",
      "show spanning-tree summary",
      "show mac address-table dynamic",
      "show logging",
      "show interfaces status",
      "show interfaces counters errors",
      "show cdp neighbors",
      "show lldp neighbors",
      "show interfaces description",
      "show run interface",
    ],
    expectedAnswerFormat: defaultExpectedAnswerFormat,
    submissionRequirements: [
      "Root cause.",
      "Operational reasoning tied to evidence.",
      "Which interface you would disable and why.",
      "Exact commands.",
      "Verification steps.",
      "Rollback procedure.",
      "Long-term prevention.",
    ],
    solution:
      "The likely root cause is a Layer 2 loop or unmanaged-switch bridge causing a broadcast storm and MAC flapping in VLAN 30. The STP process consuming most CPU, rapid topology changes, and the same MAC flapping between Gi1/0/18 and Gi1/0/22 point away from routing, DHCP, ISP, firewall, or server failure. The safest immediate action is to isolate the least-described suspect port, Gi1/0/22, because Gi1/0/18 advertises an IP Phone while Gi1/0/22 is not advertised and is one of the flap endpoints. Before shutting it, verify interface description, status, counters, STP role/state, and neighbors. Then shut only Gi1/0/22, monitor CPU, STP topology-change rate, logs, and user impact. Roll back with no shutdown if the condition worsens or the wrong port was isolated. Long-term prevention includes BPDU Guard, PortFast only on true edge ports, storm-control, loop guard where appropriate, clear contractor access rules, switchport documentation, and alerting for MAC flaps and STP churn.",
    antiGenericRequirement:
      "Your answer must name the specific suspect interface, tie it to MAC flapping and STP CPU evidence, and explain why shutting that port is safer than broad floor isolation.",
  },
  {
    title: "ACL Change Broke Remote Switch Management",
    topic: "ACL troubleshooting",
    scenario: [
      "Scenario / Background",
      "After an emergency ACL cleanup, NOC engineers can no longer SSH to SW-ACCESS-07 from the management subnet. Users behind the switch still have normal production access, and no routing change was approved. A junior engineer says they only added a security deny near the top of the ACL.",
      "",
      "Topology / Context",
      "NOC subnet: 10.10.50.0/24",
      "Switch management SVI: 10.20.7.11/24",
      "Approved jump host: 10.10.50.25",
      "Management ACL applied inbound on Vlan207.",
      "",
      "Evidence Provided",
      "Ping from jump host to 10.20.7.11 fails. SSH from jump host times out.",
      "",
      "ACL excerpt",
      "ip access-list extended MGMT-IN",
      " 10 deny ip 10.10.0.0 0.0.255.255 any log",
      " 20 permit tcp host 10.10.50.25 host 10.20.7.11 eq 22",
      " 30 permit icmp 10.10.50.0 0.0.0.255 host 10.20.7.11",
      " 40 deny ip any any log",
      "",
      "Interface excerpt",
      "interface Vlan207",
      " ip address 10.20.7.11 255.255.255.0",
      " ip access-group MGMT-IN in",
      "",
      "Submission Deadline",
      "15:00 local time. Do not reveal the solution until after submission.",
    ].join("\n"),
    objective:
      "Identify why approved management traffic is blocked and propose the least risky correction, verification, and rollback plan.",
    constraints: [
      "Do not remove the ACL entirely.",
      "Do not open SSH from all sources.",
      "Do not reboot the switch.",
      "Assume production traffic must remain undisturbed.",
      "Only the management ACL may be changed.",
    ],
    allowedTools: [
      "show ip interface vlan 207",
      "show access-lists",
      "show run interface vlan207",
      "show run | section ip access-list extended MGMT-IN",
      "configure terminal",
      "ip access-list extended MGMT-IN",
      "no sequence",
      "sequence permit",
      "ping",
      "ssh test from approved jump host",
    ],
    expectedAnswerFormat: defaultExpectedAnswerFormat,
    submissionRequirements: [
      "Root cause.",
      "Exact ACL line or order problem.",
      "Corrected ACL sequence.",
      "Verification plan.",
      "Rollback plan.",
      "Why the issue is not routing, server, DHCP, ISP, or general switch failure.",
    ],
    solution:
      "The deny at sequence 10 matches the approved NOC source range before the later permit lines are evaluated. IOS ACLs are processed top-down, first match wins, so the permit for host 10.10.50.25 never takes effect. The safest fix is to insert the specific SSH and ICMP permits before the broad deny, or remove and re-add sequence 10 below approved management permits. Verification is to inspect ACL hit counts, test SSH and ping from the approved jump host, confirm denied traffic still logs, and ensure no broad permit was introduced. Rollback is to restore the previous ACL sequence from saved config or reinsert the prior deny order if unexpected access occurs.",
    antiGenericRequirement:
      "Your answer must explain first-match ACL behavior and reference the exact sequence numbers causing the block.",
  },
  {
    title: "Suspicious Linux authentication burst",
    topic: "Linux log investigation",
    scenario: [
      "Scenario / Background",
      "A monitoring alert reports SSH authentication failures from two foreign IPs and one internal jump host. CPU and network graphs are normal, but the service account has a successful login after the burst. The business owner says a deployment may have run overnight, but there is no change ticket.",
      "",
      "Evidence Provided",
      "auth.log excerpt",
      "Jun 25 01:42:11 app-02 sshd[21877]: Failed password for invalid user admin from 185.22.14.8 port 44122 ssh2",
      "Jun 25 01:42:18 app-02 sshd[21880]: Failed password for root from 45.91.200.12 port 50710 ssh2",
      "Jun 25 01:43:04 app-02 sshd[21895]: Accepted publickey for svc_deploy from 10.30.4.18 port 51244 ssh2",
      "",
      "last excerpt",
      "svc_deploy pts/2 10.30.4.18 Thu Jun 25 01:43 - 01:46 (00:03)",
      "",
      "authorized_keys timestamp",
      "/home/svc_deploy/.ssh/authorized_keys modified: Jun 25 01:38",
      "",
      "Submission Deadline",
      "15:00 local time. Do not reveal the solution until after submission.",
    ].join("\n"),
    objective:
      "Triage whether this is failed noise, credential misuse, or expected automation.",
    constraints: [
      "Do not disable SSH globally.",
      "Do not delete keys without preserving evidence.",
      "Do not assume foreign failed logins explain the accepted internal login.",
      "Production application availability must be preserved.",
      "Use only host-level evidence available in the brief.",
    ],
    allowedTools: [
      "journalctl",
      "last",
      "lastlog",
      "grep",
      "ss",
      "audit logs",
    ],
    expectedAnswerFormat: defaultExpectedAnswerFormat,
    submissionRequirements: [
      "Incident classification.",
      "Evidence supporting or weakening credential misuse.",
      "Immediate containment that preserves service availability.",
      "Commands or checks to validate the service account login.",
      "Evidence preservation steps.",
      "Long-term prevention.",
    ],
    solution:
      "Correlate failed and accepted SSH events, source IP ownership, service account usage, command history where available, active sessions, and authorized_keys changes before deciding containment.",
    antiGenericRequirement:
      "Your answer must separate noisy failed attempts from the accepted service-account login and address the modified authorized_keys timestamp.",
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
    title: ai.title,
    difficulty: ai.difficulty,
    topic: ai.topic,
    scenario: ai.scenario,
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

  const challenge: Challenge = {
    id: createId("chl"),
    userId: user.id,
    dateKey: today,
    title: template.title,
    difficulty,
    topic: template.topic,
    scenario: options?.recovery ? withRecoveryComponent(template.scenario) : template.scenario,
    objective: template.objective,
    constraints: template.constraints,
    allowedTools: template.allowedTools,
    expectedAnswerFormat: options?.recovery
      ? `${template.expectedAnswerFormat}\n9. Recovery Component`
      : template.expectedAnswerFormat,
    submissionRequirements: options?.recovery
      ? [...template.submissionRequirements, "Recovery component answer."]
      : template.submissionRequirements,
    deadlineAt: localDeadlineIso(today, timezone, 15),
    solution: template.solution,
    antiGenericRequirement: template.antiGenericRequirement,
    status: options?.pressure ? "Pressure Challenge" : options?.recovery ? "Recovery Challenge" : "Active",
    isRecovery: Boolean(options?.recovery),
    isPressure: Boolean(options?.pressure),
    createdAt: nowIso(),
  };

  return challenge;
}

function withRecoveryComponent(scenario: string) {
  return scenario.replace(
    "Submission Deadline\n15:00 local time. Do not reveal the solution until after submission.",
    [
      "Recovery Component",
      "Previous missed topic: ACL troubleshooting.",
      "In 3-5 lines explain why placing a deny statement before a permit statement in an ACL can block otherwise valid traffic.",
      "",
      "Submission Deadline",
      "15:00 local time. Do not reveal the solution until after submission.",
    ].join("\n"),
  );
}
