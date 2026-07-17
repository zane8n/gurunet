import type { RecoveryContext, RecoveryOutcome, TechnicalCap } from "@/lib/domain";

type RecoveryHistory = {
  id: string;
  dateKey: string;
  title: string;
  topic: string;
  objective: string;
  status: string;
  recoveryContext?: RecoveryContext;
  grade?: {
    id: string;
    finalScore: number;
    technicalCap: TechnicalCap;
    nextImprovementTarget: string;
    recoveryOutcome?: RecoveryOutcome;
  };
};

type RecoveryCandidate = {
  sourceType: RecoveryContext["sourceType"];
  sourceId?: string;
  target: string;
  skill: string;
  reason: string;
  priority: number;
  dateKey: string;
};

export function selectRecoveryContext(input: {
  dateKey: string;
  scheduledAfterRest: boolean;
  manualRequested: boolean;
  disciplineLabel: string;
  profileWeakAreas: string[];
  disciplineTopics: string[];
  history: RecoveryHistory[];
}): RecoveryContext | null {
  const assignedSources = new Set(
    input.history
      .map((item) => item.recoveryContext?.sourceId)
      .filter((value): value is string => Boolean(value)),
  );
  const recentTargets = input.history
    .map((item) => item.recoveryContext?.targetKey)
    .filter((value): value is string => Boolean(value))
    .slice(0, 5);
  const recentTargetSet = new Set(recentTargets);

  const missed = input.history
    .filter((item) => item.status === "Missed" && !assignedSources.has(item.id))
    .map<RecoveryCandidate>((item) => ({
      sourceType: "MissedChallenge",
      sourceId: item.id,
      target: cleanRecoveryTarget(item.topic),
      skill: shorten(item.objective, 150),
      reason: `Rebuild one capability from the missed ${item.dateKey} challenge without repeating that full assessment.`,
      priority: 0,
      dateKey: item.dateKey,
    }));

  const lowGrades = input.history
    .filter(
      (item) =>
        item.grade &&
        (item.grade.finalScore < 10 || ["MOSTLY_WRONG", "UNSAFE"].includes(item.grade.technicalCap)) &&
        !assignedSources.has(item.grade.id),
    )
    .map<RecoveryCandidate>((item) => ({
      sourceType: "LowScore",
      sourceId: item.grade?.id,
      target: cleanRecoveryTarget(item.topic),
      skill: item.grade?.nextImprovementTarget ?? "strengthen the weakest evidence chain",
      reason: `Target the most consequential gap from the ${item.dateKey} correction.`,
      priority: 1,
      dateKey: item.dateKey,
    }));

  const unresolved = [...missed, ...lowGrades].sort(
    (left, right) => left.priority - right.priority || right.dateKey.localeCompare(left.dateKey),
  );
  const recoveryInLastTwoLearningDays = input.history
    .slice(0, 2)
    .some((item) => Boolean(item.recoveryContext));
  const automaticPool = missed.length > 0
    ? missed
    : recoveryInLastTwoLearningDays
      ? []
      : lowGrades;
  const automaticTrigger = automaticPool[0]?.sourceType;
  if (!input.scheduledAfterRest && !input.manualRequested && !automaticTrigger) return null;

  const profileCandidates = input.profileWeakAreas.map<RecoveryCandidate>((area, index) => ({
    sourceType: "ProfileWeakArea",
    sourceId: `profile:${normalizeKey(area)}`,
    target: cleanRecoveryTarget(area),
    skill: `Practise ${area} with an explicit claim, evidence, and verification step.`,
    reason: "Practise a weak area explicitly selected in the study profile.",
    priority: 2 + index,
    dateKey: input.dateKey,
  }));
  const topicCandidates = input.disciplineTopics.map<RecoveryCandidate>((topic, index) => ({
    sourceType: "RecentLearning",
    sourceId: `topic:${normalizeKey(topic)}`,
    target: cleanRecoveryTarget(topic),
    skill: `Retrieve and apply one governing principle from ${topic}.`,
    reason: "Use spaced retrieval to consolidate an active study-profile topic.",
    priority: 20 + index,
    dateKey: input.dateKey,
  }));

  const pool = input.scheduledAfterRest || input.manualRequested
    ? [...unresolved, ...profileCandidates, ...topicCandidates]
    : automaticPool;
  if (pool.length === 0) return null;

  const unseen = pool.find((candidate) => !recentTargetSet.has(normalizeKey(candidate.target)));
  const candidate = unseen ?? pool[stableIndex(input.dateKey, pool.length)];
  const targetKey = normalizeKey(`${candidate.target}:${candidate.skill}`);
  const priorAssignments = recentTargets.filter((item) => item === targetKey).length;
  const styles = ["Evidence drill", "Error correction", "Transfer check", "Teach-back"] as const;
  const taskStyle = styles[stableIndex(`${input.dateKey}:${targetKey}:${priorAssignments}`, styles.length)];
  const task = recoveryTask(taskStyle, candidate.target, input.dateKey);

  return {
    targetKey,
    target: candidate.target,
    skill: candidate.skill,
    reason: candidate.reason,
    trigger: input.scheduledAfterRest
      ? "ScheduledRest"
      : input.manualRequested
        ? "ManualRequest"
        : automaticTrigger === "MissedChallenge"
          ? "MissedChallenge"
          : "LowScore",
    sourceType: candidate.sourceType,
    sourceId: candidate.sourceId,
    taskStyle,
    task,
    assignedAt: input.dateKey,
  };
}

export function assessRecoveryOutcome(input: {
  recoveryContext?: RecoveryContext;
  submission: string;
}): RecoveryOutcome | undefined {
  if (!input.recoveryContext) return undefined;
  const answer = recoveryAnswer(input.submission);
  const wordCount = answer.split(/\s+/).filter(Boolean).length;
  const hasEvidence = /\b(because|evidence|shows?|indicates?|log|output|test|verify|validation|command|result)\b/i.test(answer);
  const hasCorrection = /\b(correct|instead|should|would|root cause|failure|misconception|risk)\b/i.test(answer);
  const completed = wordCount >= 35 && hasEvidence && hasCorrection;
  const attempted = wordCount >= 18;

  return {
    targetKey: input.recoveryContext.targetKey,
    target: input.recoveryContext.target,
    status: completed ? "Completed" : attempted ? "Attempted" : "NotAddressed",
    evidence: completed
      ? "The reinforcement section stated a correction and tied it to evidence or validation. This records completion, not automatic mastery."
      : attempted
        ? "The concept was attempted, but the answer needs a clearer correction-to-evidence link."
        : "The targeted recovery section was missing or too brief to evaluate.",
    ertBonus: completed ? 1 : 0,
  };
}

function recoveryTask(
  style: RecoveryContext["taskStyle"],
  target: string,
  dateKey: string,
) {
  const microCase = recoveryMicroCase(target, dateKey);
  const direction = style === "Error correction"
    ? "Spot the mistaken conclusion, correct it, and name the observation that proves your correction."
    : style === "Transfer check"
      ? "Apply the governing principle to the evidence and give one check that could disprove your conclusion."
      : style === "Teach-back"
        ? "Teach the answer back in 4-6 precise lines, including one common mistake and its consequence."
        : "Choose the decisive clue, say what it proves and does not prove, then give the next useful check.";
  const prompt = microCase.prompt.replace(/^Micro-case:\s*/i, "");
  return `${prompt}\n\n${direction} Keep the answer short and use the evidence.`;
}

export function recoveryTeachingAnswer(context: RecoveryContext) {
  return recoveryMicroCase(context.target, context.assignedAt).answer;
}

function recoveryMicroCase(target: string, seed: string) {
  const key = normalizeKey(target);
  if (key.includes("acl") || key.includes("access control")) {
    return {
      prompt: "Micro-case: ACL MGMT-IN contains `10 deny ip 10.10.0.0 0.0.255.255 any log` followed by `20 permit tcp 10.10.40.0 0.0.0.255 host 10.20.7.11 eq 22`. SSH from 10.10.40.25 is denied and line 10 gains hits while line 20 remains at zero.",
      answer: "Line 10 is evaluated first and includes 10.10.40.25, so it shadows the later SSH permit. The decisive proof is increasing hits/logs on line 10 with zero hits on line 20 for the test flow. Place the exact authorized permit before the broader deny, then verify allowed SSH and continued denial for an unauthorized 10.10.x.x source.",
    };
  }
  if (key.includes("vlan")) {
    return {
      prompt: "Micro-case: the access-side trunk allows VLANs 10,40,120,999; the distribution-side trunk allows 10,40,999. VLAN 120 has 12 MAC addresses on the access switch and none on the distribution switch, while VLAN 40 works.",
      answer: "The distribution-side trunk omits VLAN 120. The asymmetric allowlists plus one-sided MAC learning distinguish this from a whole-link failure. Add VLAN 120 to the existing allowlist with additive syntax, then verify forwarding state, MAC learning, and gateway reachability without disturbing VLAN 40.",
    };
  }
  if (key.includes("stp") || key.includes("spanning tree")) {
    return {
      prompt: "Micro-case: VLAN 70 records 820 topology changes in ten minutes; one MAC alternates between Gi1/0/14 and undocumented Gi1/0/19; the STP process uses 64% CPU. Gi1/0/14 has a documented phone.",
      answer: "The correlated MAC flap, topology changes, and STP CPU make a layer-2 loop the leading explanation. Gi1/0/19 is the safer containment candidate because Gi1/0/14 has a known endpoint. Record state, shut only Gi1/0/19, and verify the three signals fall; no shut it if impact or evidence contradicts the choice.",
    };
  }
  if (key.includes("systemd") || key.includes("service")) {
    return {
      prompt: "Micro-case: `systemctl status api` says active, but the journal reports `permission denied /var/lib/api/cache.db`; the unit runs as `apiuser`, and the directory is `root:root 0700`.",
      answer: "Active process state does not prove healthy service behavior. The apiuser cannot traverse or write the root-owned 0700 directory. Confirm the intended baseline, restore only required ownership/mode, and verify a successful write, clean logs, and the service health endpoint before considering a restart.",
    };
  }
  if (key.includes("evidence") || key.includes("claim") || key.includes("proof")) {
    return {
      prompt: "Micro-case: an operator says a deployment caused latency because both occurred at 14:00. The trace shows latency rose at 13:54, deployment began at 14:03, and a dependency timeout began at 13:53.",
      answer: "Timing disproves the deployment as the initiating cause: degradation preceded it. The dependency timeout is the stronger lead, but correlation still requires a discriminator such as dependency recovery or controlled path comparison. The deployment may affect later behavior but cannot explain onset at 13:54.",
    };
  }
  const variant = stableIndex(`${seed}:${key}`, 2);
  return variant === 0 ? {
    prompt: "Micro-case: Artifact A is a timestamped error on the failing path; Artifact B is an unchanged configuration snapshot; Artifact C is a healthy control path using the same upstream dependency. A proposed fix changes every path at once.",
    answer: "The healthy control path narrows but does not eliminate possible causes. Rank the timestamped failing-path error first, compare the differing state between paths, and choose a reversible scoped test. Reject the broad change because it destroys the control and expands blast radius before the fault is demonstrated.",
  } : {
    prompt: "Micro-case: a metric crosses its alert threshold at 10:14, a change completes at 10:19, and one healthy peer retains the prior state. The incident note labels the change the root cause without a comparison test.",
    answer: "The change cannot be the trigger for a threshold crossed five minutes earlier. Compare the failing node with the healthy peer and inspect the pre-10:14 evidence. Record the change as a possible contributor only if later evidence supports it, and state the observation that would falsify the leading hypothesis.",
  };
}

function cleanRecoveryTarget(value: string) {
  const withoutLens = value.split("·")[0]?.trim() || value.trim();
  const [first, ...rest] = withoutLens.split(":").map((part) => part.trim()).filter(Boolean);
  if (!first) return "evidence-led reasoning";
  if (rest.length === 0) return first.slice(0, 80);
  const firstLooksLikeDiscipline = /^(networking|linux|systems|cybersecurity|software engineering|automation|scripting|cloud|devops|data|ai|applied engineering|technical writing)$/i.test(first);
  return (firstLooksLikeDiscipline ? rest[0] : first).slice(0, 80);
}

function recoveryAnswer(content: string) {
  const normalized = content.replace(/\r\n/g, "\n");
  const marker = /(?:^|\n)#{0,3}\s*(?:task\s*2\s*[-:]?\s*)?(?:targeted\s+)?(?:recovery|reinforcement)(?:\s+(?:component|task|retrieval))?\s*[:]?\s*\n/i;
  const match = marker.exec(normalized);
  if (!match) return "";
  return normalized.slice((match.index ?? 0) + match[0].length).split(/\n#{1,3}\s|\n\d+\.\s/)[0] ?? "";
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 180);
}

function stableIndex(seed: string, length: number) {
  let hash = 2166136261;
  for (const character of seed) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash) % Math.max(1, length);
}

function shorten(value: string, max: number) {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length <= max ? normalized : `${normalized.slice(0, max - 3).trimEnd()}...`;
}
