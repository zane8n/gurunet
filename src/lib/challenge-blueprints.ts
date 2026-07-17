import type { ChallengeBlueprint, DisciplineSnapshot } from "@/lib/domain";

export const CHALLENGE_BLUEPRINT_VERSION = 5;

export type ChallengeHistorySignal = {
  dateKey: string;
  title: string;
  topic: string;
  scenario?: string;
  disciplineId?: string;
  blueprint?: ChallengeBlueprint;
};

export type ChallengeNoveltyContext = {
  recent: ChallengeHistorySignal[];
  sameDayGlobal: ChallengeHistorySignal[];
};

const scenarioFamilies: Record<string, string[]> = {
  networking: ["remote branch", "campus access layer", "data-centre edge", "WAN hub", "wireless office", "cloud interconnect", "industrial site", "service-provider handoff"],
  linux_systems: ["public web host", "container worker", "database node", "bastion host", "CI runner", "backup server", "shared file server", "observability node"],
  cybersecurity: ["identity platform", "internet-facing service", "employee endpoint fleet", "cloud control plane", "third-party integration", "SOC queue", "privileged access path", "software supply chain"],
  software_engineering: ["checkout API", "background worker", "event consumer", "authentication service", "mobile sync backend", "reporting pipeline", "feature rollout", "shared library"],
  automation_scripting: ["fleet maintenance job", "configuration inventory", "backup validation", "account lifecycle task", "deployment helper", "log-processing pipeline", "certificate rotation", "data migration utility"],
  cloud_devops: ["multi-account cloud estate", "Kubernetes service", "serverless API", "delivery pipeline", "object-storage workflow", "managed database", "edge delivery stack", "infrastructure rollout"],
  data_ai: ["recommendation service", "fraud model", "analytics warehouse", "document classifier", "forecast pipeline", "retrieval system", "segmentation job", "evaluation harness"],
  applied_engineering: ["remote field system", "production line", "building control system", "power distribution unit", "sensor network", "cooling plant", "maintenance workshop", "telemetry gateway"],
  technical_writing: ["on-call runbook", "change procedure", "incident postmortem", "operator handoff", "knowledge-base article", "architecture decision record", "release guide", "safety procedure"],
};

const practitionerRoles = [
  "on-call practitioner",
  "change implementer",
  "peer reviewer",
  "incident lead",
  "service owner",
  "security reviewer",
  "consulting engineer",
  "operations lead",
];

const constraints = [
  "Use only the evidence supplied in the challenge and label any assumption.",
  "Prefer one reversible change before any broad rollback or restart.",
  "Keep production impact visible in the proposed sequence.",
  "State the observation that would disprove the leading conclusion.",
  "Separate what the evidence proves from what still needs validation.",
  "Include a practical verification step and a rollback or stop condition.",
];

export function selectChallengeBlueprint(input: {
  userId: string;
  dateKey: string;
  discipline: DisciplineSnapshot;
  requestedTopic?: string | null;
  novelty: ChallengeNoveltyContext;
  regenerationAttempt?: number;
}): ChallengeBlueprint {
  const avoided = new Set((input.discipline.avoidAreas ?? []).map(normalize));
  const availableTopics = input.discipline.topics.filter((topic) => !avoided.has(normalize(topic)));
  const requestedTopic = availableTopics.find(
    (topic) => normalize(topic) === normalize(input.requestedTopic ?? ""),
  );
  const topics = requestedTopic
    ? [requestedTopic]
    : availableTopics.length
      ? availableTopics
      : [input.discipline.label];
  const formats = unique(input.discipline.formats.length
    ? input.discipline.formats
    : ["Practical scenario"]);
  const regenerationAttempt = input.regenerationAttempt ?? 0;
  const recent = input.novelty.recent.filter(
    (item) => regenerationAttempt > 0 || item.dateKey !== input.dateKey,
  );
  const globalSignatures = new Set(
    input.novelty.sameDayGlobal
      .map((item) => item.blueprint?.signature)
      .filter((item): item is string => Boolean(item)),
  );
  const candidates: Array<{ blueprint: ChallengeBlueprint; penalty: number }> = [];

  for (const [topicRank, primaryTopic] of topics.entries()) {
    for (const format of formats) {
      const seed = `${input.userId}:${input.dateKey}:${input.discipline.id}:${primaryTopic}:${format}:${regenerationAttempt}`;
      const settings = scenarioFamilies[input.discipline.id] ?? scenarioFamilies.applied_engineering;
      const scenarioFamily = settings[stableIndex(`${seed}:setting`, settings.length)];
      const practitionerRole = practitionerRoles[stableIndex(`${seed}:role`, practitionerRoles.length)];
      const evidence = input.discipline.evidenceTypes.length
        ? input.discipline.evidenceTypes
        : ["observable artifacts"];
      const evidenceStyle = evidence[stableIndex(`${seed}:evidence`, evidence.length)];
      const constraintTwist = constraints[stableIndex(`${seed}:constraint`, constraints.length)];
      const signature = normalize([
        input.discipline.id,
        primaryTopic,
        format,
        scenarioFamily,
        practitionerRole,
        constraintTwist,
      ].join("|"));
      const nonce = shortHash(`${seed}:${signature}`);
      const interaction = interactionForFormat(format);
      const blueprint: ChallengeBlueprint = {
        version: CHALLENGE_BLUEPRINT_VERSION,
        blueprintId: `bp_${shortHash(`${CHALLENGE_BLUEPRINT_VERSION}:${signature}:${input.userId}:${input.dateKey}:${regenerationAttempt}`)}`,
        signature,
        nonce,
        primaryTopic,
        focus: primaryTopic,
        modeId: formatId(format),
        modeLabel: format,
        modeFamily: "adaptive",
        scenarioFamily,
        practitionerRole,
        evidenceStyle,
        constraintTwist,
        deliverable: "A complete, scenario-specific response",
        interaction,
        validationKind: interaction === "code"
          ? "code-reasoning"
          : interaction === "commands"
            ? "command-sequence"
            : interaction === "oral"
              ? "oral-defense"
              : "holistic",
        responseSections: input.discipline.responseSections.length
          ? input.discipline.responseSections
          : ["Conclusion", "Evidence", "Work", "Verification", "Risk"],
        promptDirective:
          "Create one coherent practical challenge in which the topic, scenario, evidence, objective, and requested work all describe the same problem.",
      };
      candidates.push({
        blueprint,
        penalty: blueprintPenalty({
          blueprint,
          recent,
          globalSignatures,
          topicRank,
          seed,
        }),
      });
    }
  }

  candidates.sort(
    (left, right) => left.penalty - right.penalty || left.blueprint.signature.localeCompare(right.blueprint.signature),
  );
  return candidates[0]?.blueprint ?? emergencyBlueprint(input);
}

export function blueprintFromSnapshot(value: unknown): ChallengeBlueprint | undefined {
  if (!value || typeof value !== "object") return undefined;
  const generationContext = (value as { generationContext?: unknown }).generationContext;
  if (!generationContext || typeof generationContext !== "object") return undefined;
  const blueprint = (generationContext as { blueprint?: unknown }).blueprint;
  if (!blueprint || typeof blueprint !== "object") return undefined;
  const candidate = blueprint as Partial<ChallengeBlueprint>;
  if (
    typeof candidate.blueprintId !== "string" ||
    typeof candidate.signature !== "string" ||
    typeof candidate.primaryTopic !== "string" ||
    typeof candidate.modeId !== "string" ||
    typeof candidate.modeLabel !== "string" ||
    !Array.isArray(candidate.responseSections)
  ) return undefined;
  return candidate as ChallengeBlueprint;
}

export function challengeNoveltyIssues(input: {
  title: string;
  topic: string;
  scenario: string;
  objective?: string;
  blueprint: ChallengeBlueprint;
  history: ChallengeHistorySignal[];
}) {
  const issues: string[] = [];
  if (normalize(input.topic) !== normalize(input.blueprint.focus)) {
    issues.push(`The topic field must be exactly "${input.blueprint.focus}".`);
  }
  if (/[·|]/.test(input.topic)) {
    issues.push("The topic field mixes the technical subject with presentation metadata.");
  }

  const packetText = `${input.title}\n${input.scenario}\n${input.objective ?? ""}`;
  if (!containsTopic(packetText, input.blueprint.primaryTopic)) {
    issues.push(`The challenge does not materially address "${input.blueprint.primaryTopic}".`);
  }
  const vaguePhrases = [
    "narrow but repeatable service symptom",
    "the relevant configuration is present",
    "one counter or state transition",
    "one service path fails",
    "implementation record, observed state, and monitoring view disagree",
    "nearby but different case",
  ];
  const normalizedPacket = normalize(packetText);
  for (const phrase of vaguePhrases) {
    if (normalizedPacket.includes(normalize(phrase))) {
      issues.push(`The challenge uses an abstract placeholder instead of case evidence: "${phrase}".`);
    }
  }
  const internalLabels = [
    "assessment mode",
    "role and setting",
    "task 1 - main assessment",
    "required deliverable",
    "retrieval target",
    "skill to strengthen",
  ];
  for (const label of internalLabels) {
    if (normalizedPacket.includes(normalize(label))) {
      issues.push(`The learner brief exposes internal generator language: "${label}".`);
    }
  }
  if (concreteArtifactScore(input.scenario) < 3) {
    issues.push("The scenario needs at least three concrete, testable artifacts, values, excerpts, claims, or observed states.");
  }

  const recent = input.history.slice(0, 45);
  for (const prior of recent) {
    if (normalize(prior.title) === normalize(input.title)) {
      issues.push(`The title repeats "${prior.title}".`);
      break;
    }
  }
  const currentTokens = meaningfulTokens(`${input.title} ${input.scenario}`);
  for (const prior of recent.slice(0, 20)) {
    const similarity = jaccard(
      currentTokens,
      meaningfulTokens(`${prior.title} ${prior.scenario ?? prior.topic}`),
    );
    if (similarity >= 0.72) {
      issues.push(`The concept and framing are too similar to the ${prior.dateKey} challenge "${prior.title}".`);
      break;
    }
  }
  return issues;
}

function blueprintPenalty(input: {
  blueprint: ChallengeBlueprint;
  recent: ChallengeHistorySignal[];
  globalSignatures: Set<string>;
  topicRank: number;
  seed: string;
}) {
  let penalty = input.topicRank * 4 + stableIndex(`${input.seed}:jitter`, 37);
  if (input.globalSignatures.has(input.blueprint.signature)) penalty += 10_000;

  for (const [index, item] of input.recent.entries()) {
    const age = index + 1;
    const prior = item.blueprint;
    if (prior?.signature === input.blueprint.signature) penalty += 20_000;
    if (normalize(prior?.primaryTopic ?? item.topic) === normalize(input.blueprint.primaryTopic)) {
      penalty += age === 1 ? 5_000 : age <= 3 ? 1_200 : age <= 7 ? 320 : age <= 21 ? 60 : 0;
    }
    if (normalize(prior?.modeLabel) === normalize(input.blueprint.modeLabel)) {
      penalty += age === 1 ? 450 : age <= 3 ? 120 : age <= 7 ? 30 : 0;
    }
    if (prior?.scenarioFamily === input.blueprint.scenarioFamily) {
      penalty += age <= 3 ? 90 : age <= 7 ? 20 : 0;
    }
  }
  return penalty;
}

function emergencyBlueprint(input: {
  userId: string;
  dateKey: string;
  discipline: DisciplineSnapshot;
  regenerationAttempt?: number;
}) {
  const nonce = shortHash(`${input.userId}:${input.dateKey}:${input.regenerationAttempt ?? 0}`);
  const primaryTopic = input.discipline.topics[0] ?? input.discipline.label;
  const format = input.discipline.formats[0] ?? "Practical scenario";
  const interaction = interactionForFormat(format);
  return {
    version: CHALLENGE_BLUEPRINT_VERSION,
    blueprintId: `bp_${nonce}`,
    signature: normalize(`${input.discipline.id}:${primaryTopic}:${format}:${nonce}`),
    nonce,
    primaryTopic,
    focus: primaryTopic,
    modeId: formatId(format),
    modeLabel: format,
    modeFamily: "adaptive",
    scenarioFamily: scenarioFamilies[input.discipline.id]?.[0] ?? "operational system",
    practitionerRole: "responsible practitioner",
    evidenceStyle: input.discipline.evidenceTypes[0] ?? "observable artifacts",
    constraintTwist: constraints[0],
    deliverable: "A complete, scenario-specific response",
    interaction,
    validationKind: interaction === "code"
      ? "code-reasoning"
      : interaction === "commands"
        ? "command-sequence"
        : interaction === "oral"
          ? "oral-defense"
          : "holistic",
    responseSections: input.discipline.responseSections.length
      ? input.discipline.responseSections
      : ["Conclusion", "Evidence", "Work", "Verification", "Risk"],
    promptDirective:
      "Create one coherent practical challenge in which the topic, scenario, evidence, objective, and requested work all describe the same problem.",
  } satisfies ChallengeBlueprint;
}

function interactionForFormat(format: string): ChallengeBlueprint["interaction"] {
  const value = normalize(format);
  if (value.includes("oral")) return "oral";
  if (/(code|script|automation)/.test(value)) return "code";
  if (/(command|configuration|hands on|lab|shell|environment administration)/.test(value)) return "commands";
  return "written";
}

function formatId(format: string) {
  return normalize(format).replace(/\s+/g, "_").slice(0, 48) || "practical_scenario";
}

function containsTopic(value: string, topic: string) {
  const source = normalize(value);
  const exact = normalize(topic);
  if (source.includes(exact)) return true;
  const tokens = exact.split(" ").filter((token) => token.length >= 2);
  const matches = tokens.filter((token) => source.includes(token)).length;
  return tokens.length > 0 && matches >= Math.ceil(tokens.length / 2);
}

function concreteArtifactScore(value: string) {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const concrete = lines.filter((line) =>
    /(?:\b\d+(?:\.\d+)?(?:%|ms|s|gb|mb|kb|\/\d+)?\b|\b\d{1,3}(?:\.\d{1,3}){3}\b|\b(?:gi|te|eth|ens|vlan|pid|uid|http|tcp|udp|acl|api|pod|node|host|line|step)[-\w./:]*\b|[#>$]|=>|==|!=|\b(?:true|false|deny|permit|failed|error|warning|timeout|dropped|active|inactive)\b|["'`][^"'`]{4,}["'`])/i.test(line),
  );
  return Math.min(6, concrete.length);
}

function meaningfulTokens(value: string) {
  return new Set(normalize(value).split(" ").filter((token) => token.length >= 5));
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const item of left) if (right.has(item)) intersection += 1;
  return intersection / (left.size + right.size - intersection);
}

function unique(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function normalize(value: string | undefined) {
  return (value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function stableIndex(seed: string, length: number) {
  return parseInt(shortHash(seed).slice(0, 8), 36) % Math.max(1, length);
}

function shortHash(value: string) {
  let first = 2166136261;
  let second = 2246822519;
  for (const character of value) {
    const code = character.charCodeAt(0);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `${(first >>> 0).toString(36)}${(second >>> 0).toString(36)}`;
}
