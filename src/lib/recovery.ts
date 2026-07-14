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
      target: `${item.topic}: ${shorten(item.objective, 150)}`,
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
      target: `${item.topic}: ${item.grade?.nextImprovementTarget ?? "strengthen the weakest evidence chain"}`,
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
    target: `${input.disciplineLabel}: ${area}`,
    reason: "Practise a weak area explicitly selected in the study profile.",
    priority: 2 + index,
    dateKey: input.dateKey,
  }));
  const topicCandidates = input.disciplineTopics.map<RecoveryCandidate>((topic, index) => ({
    sourceType: "RecentLearning",
    sourceId: `topic:${normalizeKey(topic)}`,
    target: `${input.disciplineLabel}: ${topic}`,
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
  const targetKey = normalizeKey(candidate.target);
  const priorAssignments = recentTargets.filter((item) => item === targetKey).length;
  const styles = ["Evidence drill", "Error correction", "Transfer check", "Teach-back"] as const;
  const taskStyle = styles[stableIndex(`${input.dateKey}:${targetKey}:${priorAssignments}`, styles.length)];
  const task = recoveryTask(taskStyle, candidate.target);

  return {
    targetKey,
    target: candidate.target,
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

function recoveryTask(style: RecoveryContext["taskStyle"], target: string) {
  if (style === "Error correction") {
    return `For ${target}, state the likely misconception or failed approach, correct it, and give one check that proves the correction.`;
  }
  if (style === "Transfer check") {
    return `Apply the principle behind ${target} to a nearby but different case. State what changes, what stays true, and one validation step.`;
  }
  if (style === "Teach-back") {
    return `Teach back ${target} in 4-6 precise lines: the governing principle, one common mistake, its consequence, and how to verify the right result.`;
  }
  return `For ${target}, name the decisive evidence, explain what it proves, and give one observation that would disprove your conclusion.`;
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
