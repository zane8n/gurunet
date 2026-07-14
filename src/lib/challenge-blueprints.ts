import type { ChallengeBlueprint, DisciplineSnapshot } from "@/lib/domain";

export const CHALLENGE_BLUEPRINT_VERSION = 3;

type ChallengeMode = {
  id: string;
  label: string;
  family: string;
  lens: string;
  deliverable: string;
  interaction: ChallengeBlueprint["interaction"];
  validationKind: ChallengeBlueprint["validationKind"];
  responseSections: string[];
  promptDirective: string;
  preferenceSignals: string[];
  excludedDisciplines?: string[];
};

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

const modes: ChallengeMode[] = [
  mode("troubleshooting", "Troubleshooting investigation", "diagnose", "fault isolation", "A ranked diagnosis and safe remediation plan", "written", "holistic", ["Hypothesis", "Evidence chain", "Diagnostic sequence", "Safe fix", "Verification and rollback"], "Create a realistic fault-isolation case with competing hypotheses. The learner must distinguish cause from symptom and prove the next action.", ["troubleshooting", "incident", "service recovery", "root-cause"]),
  mode("configuration_build", "Configuration build", "build", "correct implementation", "A minimal implementation with validation and rollback", "commands", "command-sequence", ["Assumptions", "Configuration", "Validation", "Failure handling", "Rollback"], "Require the learner to produce an exact, minimally scoped configuration or implementation rather than only describe one.", ["configuration", "hands-on", "lab", "deployment", "shell task"]),
  mode("configuration_review", "Configuration review", "review", "configuration defect detection", "An annotated review and corrected configuration", "commands", "command-sequence", ["Findings", "Impact", "Corrected configuration", "Validation", "Rollback"], "Supply a plausible configuration containing several valid lines and one or two consequential defects. Do not make every line wrong.", ["configuration review", "control review", "procedure review", "review"]),
  mode("pressure_triage", "Pressure triage", "decide", "time-critical prioritisation", "A first-15-minutes decision record", "written", "holistic", ["First action", "Evidence priority", "Containment", "Escalation", "Stop conditions"], "Put the learner under a short operational window with incomplete evidence and require a safe first decision, not a complete postmortem.", ["incident triage", "incident command", "service recovery", "pressure"]),
  mode("time_boxed_diagnostic", "Time-boxed diagnostic", "diagnose", "diagnostic efficiency", "A time-boxed check sequence with decision branches", "commands", "command-sequence", ["Working hypothesis", "First three checks", "Decision branches", "Containment", "Exit criteria"], "Limit the learner to a small number of checks. Each check must change the decision tree and avoid shotgun troubleshooting.", ["troubleshooting", "log investigation", "pipeline triage", "bug triage"]),
  mode("hardening_review", "Hardening review", "audit", "abuse resistance", "A risk-ranked hardening change set", "written", "holistic", ["Exposure", "Risk ranking", "Minimum controls", "Validation", "Operational trade-offs"], "Present a working but weak system. Require risk-ranked controls that preserve its intended use and avoid blanket lockdown advice.", ["hardening", "security", "control review", "risk assessment"]),
  mode("observability_design", "Monitoring and observability", "observe", "signal design", "A signal, threshold, and response design", "written", "holistic", ["Failure signals", "Telemetry", "Alert logic", "Triage path", "False-positive controls"], "Ask the learner to design useful telemetry and alerts for a concrete failure mode, including thresholds, noise control, and operator action.", ["observability", "detection", "metrics", "analysis"]),
  mode("scripting_task", "Scripting and coding", "automate", "safe automation", "Code or pseudocode plus test cases", "code", "code-reasoning", ["Contract", "Implementation", "Safety controls", "Test cases", "Failure behavior"], "Require executable-quality code or precise pseudocode for a bounded task. Include deterministic input/output examples that make the answer testable.", ["script", "code", "automation", "hands-on", "lab", "pipeline"]),
  mode("environment_admin", "Mini environment administration", "operate", "environment operations", "A command sequence and resulting state", "commands", "command-sequence", ["Initial state", "Commands", "Expected state", "Verification", "Recovery"], "Define a small environment the learner can reproduce locally and administer. Make state transitions and verification observable.", ["hands-on", "lab", "service recovery", "shell task", "maintenance"]),
  mode("technology_selection", "Technology selection", "compare", "tool selection", "A weighted decision and adoption guardrails", "written", "holistic", ["Requirements", "Options", "Decision matrix", "Recommendation", "Adoption risks"], "Give concrete requirements and imperfect options. Require a justified selection; do not permit a generic list of popular tools.", ["design review", "architecture", "decision review", "cost/risk"]),
  mode("forensics_timeline", "Forensics timeline", "investigate", "temporal reconstruction", "A defensible event timeline and confidence levels", "written", "holistic", ["Timeline", "Material evidence", "Gaps", "Competing explanations", "Next preservation step"], "Provide timestamps from multiple sources with one clock or attribution complication. Require correlation without overstating certainty.", ["security investigation", "log investigation", "incident", "root-cause"]),
  mode("find_the_trap", "Find the trap", "inspect", "hidden defect recognition", "The trap, its consequence, and a proving test", "written", "holistic", ["Trap", "Why it matters", "Proof", "Minimum correction", "Regression check"], "Hide one consequential trap among realistic, mostly-correct evidence. The task is to identify and prove it, not list every theoretical concern.", ["review", "bug", "failure handling", "analysis"]),
  mode("command_only", "Command-only challenge", "execute", "command precision", "A constrained command sequence with comments limited to risks", "commands", "command-sequence", ["Commands", "Expected output", "Abort condition", "Rollback"], "Require an exact ordered command sequence under a strict command budget. Explanations should be limited to safety-critical annotations.", ["hands-on", "lab", "shell", "configuration"]),
  mode("oral_defense", "Oral defense", "defend", "defensible reasoning", "A concise position followed by anticipated examiner questions", "oral", "oral-defense", ["Position", "Decisive evidence", "Assumptions", "Likely challenge", "Defense"], "Ask for a concise professional position that can be challenged orally. Include ambiguity that tests whether the learner can defend assumptions.", ["incident command", "decision", "review", "assessment"]),
  mode("minimum_safe_fix", "Minimum safe fix", "remediate", "smallest safe change", "One minimal change with blast-radius proof", "commands", "command-sequence", ["Fault", "Minimum change", "Pre-check", "Verification", "Rollback trigger"], "Several changes could help, but require the smallest reversible action that addresses the demonstrated fault without broad scope.", ["troubleshooting", "service recovery", "failure handling", "control review"]),
  mode("evidence_ranking", "Evidence ranking", "reason", "evidence quality", "A ranked evidence table with what each item proves", "written", "holistic", ["Evidence ranking", "What it proves", "What it cannot prove", "Leading hypothesis", "Next discriminator"], "Provide mixed-strength evidence. Require ranking by diagnostic value and explicit limits on what each artifact establishes.", ["investigation", "analysis", "triage", "evaluation"]),
  mode("design_critique", "Design critique", "design", "architecture trade-offs", "A critique with a safer revised design", "written", "holistic", ["Design intent", "Failure modes", "Trade-offs", "Revised design", "Validation"], "Present a plausible design with non-obvious operational weaknesses. Require a proportional revision, not a greenfield replacement.", ["design review", "architecture", "decision review", "maintenance plan"]),
  mode("code_critique", "Code critique", "review", "code correctness and safety", "An annotated defect review, patch, and tests", "code", "code-reasoning", ["Observed behavior", "Defects", "Patch", "Tests", "Residual risk"], "Supply a compact realistic code or script excerpt with interacting defects. Require a scoped patch and tests.", ["code review", "script improvement", "bug triage", "failure handling"], "technical_writing"),
  mode("operational_decision", "Operational decision", "decide", "trade-off judgment", "A decision record with triggers for reversal", "written", "holistic", ["Decision", "Evidence", "Trade-offs", "Execution guardrails", "Reversal trigger"], "Force a choice between imperfect operational options. The strongest answer should state what would change the decision.", ["decision", "incident", "risk", "maintenance"]),
  mode("true_false_defense", "True / false with defense", "reason", "claim evaluation", "A verdict for each claim with corrections and evidence", "written", "holistic", ["Verdicts", "Evidence", "Corrections", "Exceptions", "Practical consequence"], "Give 5-7 tightly scoped professional claims with a mix of true, false, and conditionally true statements. Marks come from the defense, not guessing.", ["knowledge", "assessment", "review"]),
  mode("knowledge_quest", "Knowledge quest", "connect", "concept transfer", "A connected explanation built from staged clues", "written", "holistic", ["Clue interpretation", "Governing principle", "Application", "Boundary case", "Verification"], "Build a staged inquiry where each clue reveals a useful concept and the final task applies it to a practical case.", ["analysis", "evaluation", "knowledge"]),
  mode("technical_brief", "Technical brief", "explain", "professional synthesis", "A concise technical brief for a named audience", "written", "holistic", ["Audience and decision", "Technical position", "Evidence", "Risks", "Recommendation"], "Require a short evidence-led brief for a specific stakeholder. It must make a decision easier, not become a generic essay.", ["report", "documentation", "incident report", "postmortem"]),
  mode("failure_prediction", "Failure prediction", "predict", "pre-mortem reasoning", "A ranked pre-mortem and detection plan", "written", "holistic", ["Likely failures", "Leading indicators", "Prevention", "Detection", "Response"], "Describe a planned change and ask what is most likely to fail first, why, and how to detect it before users do.", ["risk", "design", "deployment", "maintenance"]),
  mode("runbook_repair", "Runbook repair", "document", "operational usability", "A corrected runbook excerpt with stop conditions", "written", "holistic", ["Audience", "Prerequisites", "Procedure", "Verification", "Stop and escalation"], "Provide an unsafe or ambiguous runbook excerpt. Require a production-usable rewrite with observable success and escalation criteria.", ["runbook", "procedure", "documentation", "service recovery"]),
  mode("capacity_planning", "Capacity planning", "plan", "capacity and performance", "A capacity recommendation with assumptions and thresholds", "written", "holistic", ["Demand model", "Bottleneck", "Calculation", "Recommendation", "Monitoring trigger"], "Provide a small but sufficient metrics set. Require explicit assumptions, simple calculations, and a scale trigger.", ["performance", "cost", "reliability", "metrics"]),
  mode("migration_plan", "Migration planning", "plan", "change sequencing", "A phased migration, validation, and rollback plan", "written", "holistic", ["Current state", "Target state", "Phases", "Validation gates", "Rollback"], "Require a phased migration under live-service constraints, with compatibility, data/state handling, and go/no-go gates.", ["deployment", "architecture", "maintenance", "procedure"]),
  mode("post_incident_reconstruction", "Post-incident reconstruction", "investigate", "causal reconstruction", "A causal chain and corrective-action plan", "written", "holistic", ["Timeline", "Causal chain", "Contributing factors", "What worked", "Corrective actions"], "Give a compact incident record and require separation of trigger, root cause, contributing factors, and corrective actions.", ["postmortem", "root-cause", "incident report", "reliability"]),
  mode("test_strategy", "Test strategy", "validate", "proof design", "A risk-based test matrix", "written", "holistic", ["Risks", "Test matrix", "Fixtures", "Pass criteria", "Coverage limits"], "Present a change with meaningful failure modes. Require tests that distinguish correctness from happy-path execution.", ["test plan", "evaluation", "validation", "review"]),
  mode("architecture_tradeoff", "Architecture trade-off", "design", "system design judgment", "A bounded architecture decision record", "written", "holistic", ["Forces", "Options", "Decision", "Consequences", "Revisit trigger"], "Require an architecture decision between viable alternatives using explicit operational, cost, security, and maintenance forces.", ["architecture", "design", "decision", "cost/risk"]),
];

const scenarioFamilies: Record<string, string[]> = {
  networking: ["remote branch", "campus access layer", "data-centre edge", "WAN hub", "wireless office", "cloud interconnect", "industrial site", "service-provider handoff"],
  linux_systems: ["public web host", "container worker", "database node", "bastion host", "CI runner", "backup server", "shared file server", "observability node"],
  cybersecurity: ["identity platform", "internet-facing service", "employee endpoint fleet", "cloud control plane", "third-party integration", "SOC detection queue", "privileged access path", "software supply chain"],
  software_engineering: ["checkout API", "background worker", "event consumer", "authentication service", "mobile sync backend", "reporting pipeline", "feature-flag rollout", "shared library"],
  automation_scripting: ["fleet maintenance job", "configuration inventory", "backup validation", "account lifecycle task", "deployment helper", "log-processing pipeline", "certificate rotation", "data migration utility"],
  cloud_devops: ["multi-account cloud estate", "Kubernetes service", "serverless API", "delivery pipeline", "object-storage workflow", "managed database", "edge delivery stack", "infrastructure-as-code rollout"],
  data_ai: ["recommendation service", "fraud model", "analytics warehouse", "document classifier", "forecast pipeline", "retrieval system", "customer segmentation job", "evaluation harness"],
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

const constraintTwists = [
  "Only one production change is permitted before a go/no-go review.",
  "The primary dashboard contains one misleading but plausible signal.",
  "Access is read-only until the learner identifies the decisive check.",
  "The maintenance window has twelve minutes remaining.",
  "A rollback must preserve evidence for a later review.",
  "A junior operator must be able to execute the final plan safely.",
  "The service is degraded but a broad restart or shutdown is prohibited.",
  "One stakeholder is pushing a fast fix that expands the blast radius.",
  "Telemetry is incomplete, so confidence and assumptions must be explicit.",
  "The proposed fix must work without purchasing or installing a new tool.",
  "A compliance control limits credential, data, or configuration exposure.",
  "The learner must define the observation that would make them stop and escalate.",
];

export function selectChallengeBlueprint(input: {
  userId: string;
  dateKey: string;
  discipline: DisciplineSnapshot;
  requestedTopic?: string | null;
  novelty: ChallengeNoveltyContext;
  regenerationAttempt?: number;
}): ChallengeBlueprint {
  const { discipline } = input;
  const avoided = new Set((discipline.avoidAreas ?? []).map(normalize));
  const availableTopics = discipline.topics.filter((topic) => !avoided.has(normalize(topic)));
  const requestedTopic = availableTopics.find((topic) => normalize(topic) === normalize(input.requestedTopic ?? ""));
  const topics = requestedTopic ? [requestedTopic] : availableTopics.length ? availableTopics : [discipline.label];
  const compatibleModes = modes.filter((item) => !item.excludedDisciplines?.includes(discipline.id));
  const preferredModeIds = preferredModes(discipline.formats, compatibleModes);
  const regenerationAttempt = input.regenerationAttempt ?? 0;
  const preferenceIsConstrained = preferredModeIds.size < compatibleModes.length;
  const explorationSlot = stableIndex(
    `${input.userId}:${input.dateKey}:${discipline.id}:${regenerationAttempt}:mode-balance`,
    4,
  ) === 0;
  const exploratoryModes = compatibleModes.filter((item) => !preferredModeIds.has(item.id));
  const selectedModes = preferenceIsConstrained
    ? explorationSlot && exploratoryModes.length
      ? exploratoryModes
      : compatibleModes.filter((item) => preferredModeIds.has(item.id))
    : compatibleModes;
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
    for (const challengeMode of selectedModes) {
      const seed = `${input.userId}:${input.dateKey}:${discipline.id}:${primaryTopic}:${challengeMode.id}:${regenerationAttempt}`;
      const settingPool = scenarioFamilies[discipline.id] ?? scenarioFamilies.applied_engineering;
      const scenarioFamily = settingPool[stableIndex(`${seed}:setting`, settingPool.length)];
      const practitionerRole = practitionerRoles[stableIndex(`${seed}:role`, practitionerRoles.length)];
      const evidencePool = discipline.evidenceTypes.length ? discipline.evidenceTypes : ["observable artifacts"];
      const evidenceStyle = evidencePool[stableIndex(`${seed}:evidence`, evidencePool.length)];
      const constraintTwist = constraintTwists[stableIndex(`${seed}:constraint`, constraintTwists.length)];
      const secondaryTopic = selectSecondaryTopic(topics, primaryTopic, seed, challengeMode.family);
      const secondaryDiscipline = selectSecondaryDiscipline(
        discipline.secondaryInterests ?? [],
        discipline.id,
        seed,
        challengeMode.family,
      );
      const focus = primaryTopic;
      const signature = normalize([
        discipline.id,
        primaryTopic,
        secondaryTopic,
        secondaryDiscipline,
        challengeMode.id,
        scenarioFamily,
        practitionerRole,
        constraintTwist,
      ].filter(Boolean).join("|"));
      const nonce = shortHash(`${seed}:${signature}`);
      const blueprint: ChallengeBlueprint = {
        version: CHALLENGE_BLUEPRINT_VERSION,
        blueprintId: `bp_${shortHash(`${signature}:${input.userId}:${input.dateKey}:${regenerationAttempt}`)}`,
        signature,
        nonce,
        primaryTopic,
        ...(secondaryTopic ? { secondaryTopic } : {}),
        ...(secondaryDiscipline ? { secondaryDiscipline } : {}),
        focus,
        emphasis: challengeMode.lens,
        modeId: challengeMode.id,
        modeLabel: challengeMode.label,
        modeFamily: challengeMode.family,
        scenarioFamily,
        practitionerRole,
        evidenceStyle,
        constraintTwist,
        deliverable: challengeMode.deliverable,
        interaction: challengeMode.interaction,
        validationKind: challengeMode.validationKind,
        responseSections: challengeMode.responseSections,
        promptDirective: challengeMode.promptDirective,
      };
      candidates.push({
        blueprint,
        penalty: blueprintPenalty({
          blueprint,
          recent,
          globalSignatures,
          preferred: preferredModeIds.has(challengeMode.id),
          topicRank,
          seed,
        }),
      });
    }
  }

  candidates.sort((left, right) => left.penalty - right.penalty || left.blueprint.signature.localeCompare(right.blueprint.signature));
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
    issues.push("The topic field mixes the technical subject with assessment metadata.");
  }
  const packetText = `${input.title}\n${input.scenario}\n${input.objective ?? ""}`;
  if (!containsTopic(packetText, input.blueprint.primaryTopic)) {
    issues.push(`The packet does not materially address the selected technical topic "${input.blueprint.primaryTopic}".`);
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
      issues.push(`The packet uses an abstract placeholder instead of concrete case evidence: "${phrase}".`);
    }
  }
  if (concreteArtifactScore(input.scenario) < 3) {
    issues.push("The scenario needs at least three concrete, testable artifacts with actual values, excerpts, claims, or observed states.");
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
    const similarity = jaccard(currentTokens, meaningfulTokens(`${prior.title} ${prior.scenario ?? prior.topic}`));
    if (similarity >= 0.72) {
      issues.push(`The concept and framing are too similar to the ${prior.dateKey} challenge "${prior.title}".`);
      break;
    }
  }
  const modeNeedles = modeEvidenceNeedles[input.blueprint.modeId] ?? [];
  if (modeNeedles.length && !modeNeedles.some((needle) => normalize(`${input.scenario} ${input.title}`).includes(needle))) {
    issues.push(`The packet does not visibly implement the selected ${input.blueprint.modeLabel} format.`);
  }
  return issues;
}

function blueprintPenalty(input: {
  blueprint: ChallengeBlueprint;
  recent: ChallengeHistorySignal[];
  globalSignatures: Set<string>;
  preferred: boolean;
  topicRank: number;
  seed: string;
}) {
  let penalty = input.preferred ? 0 : 28;
  penalty += input.topicRank * 4;
  penalty += stableIndex(`${input.seed}:jitter`, 37);
  if (input.globalSignatures.has(input.blueprint.signature)) penalty += 10_000;

  for (const [index, item] of input.recent.entries()) {
    const age = index + 1;
    const prior = item.blueprint;
    if (prior?.signature === input.blueprint.signature) penalty += 20_000;
    if (normalize(prior?.focus ?? item.topic) === normalize(input.blueprint.focus)) penalty += age <= 21 ? 4_000 : 500;
    if (normalize(prior?.primaryTopic ?? item.topic).includes(normalize(input.blueprint.primaryTopic))) {
      penalty += age === 1 ? 1_200 : age <= 3 ? 600 : age <= 7 ? 180 : age <= 21 ? 45 : 0;
    }
    if (prior?.modeId === input.blueprint.modeId) penalty += age === 1 ? 800 : age <= 3 ? 320 : age <= 7 ? 90 : 0;
    if (prior?.modeFamily === input.blueprint.modeFamily) penalty += age === 1 ? 260 : age <= 3 ? 80 : 0;
    if (prior?.scenarioFamily === input.blueprint.scenarioFamily) penalty += age <= 5 ? 100 : 0;
    if (prior?.practitionerRole === input.blueprint.practitionerRole) penalty += age <= 3 ? 45 : 0;
  }
  return penalty;
}

function preferredModes(formats: string[], available: ChallengeMode[]) {
  const normalizedFormats = formats.map(normalize);
  const ids = new Set(
    available
      .filter((item) => {
        const label = normalize(item.label);
        return normalizedFormats.some((format) => label.includes(format) || format.includes(label)) ||
          item.preferenceSignals.some((signal) => normalizedFormats.some((format) => format.includes(normalize(signal)) || normalize(signal).includes(format)));
      })
      .map((item) => item.id),
  );
  return ids.size ? ids : new Set(available.map((item) => item.id));
}

function selectSecondaryTopic(topics: string[], primary: string, seed: string, family: string) {
  if (!["design", "compare", "plan", "connect", "predict"].includes(family)) return undefined;
  const remaining = topics.filter((topic) => topic !== primary);
  if (!remaining.length || stableIndex(`${seed}:hybrid`, 4) !== 0) return undefined;
  return remaining[stableIndex(`${seed}:secondary`, remaining.length)];
}

function selectSecondaryDiscipline(
  interests: string[],
  primaryDiscipline: string,
  seed: string,
  family: string,
) {
  if (!["design", "compare", "connect", "automate", "observe", "plan"].includes(family)) return undefined;
  const available = interests.filter((item) => normalize(item) !== normalize(primaryDiscipline));
  if (!available.length || stableIndex(`${seed}:cross-discipline`, 4) !== 0) return undefined;
  return available[stableIndex(`${seed}:secondary-discipline`, available.length)];
}

function emergencyBlueprint(input: {
  userId: string;
  dateKey: string;
  discipline: DisciplineSnapshot;
  regenerationAttempt?: number;
}) {
  const nonce = shortHash(`${input.userId}:${input.dateKey}:${input.regenerationAttempt ?? 0}`);
  const primaryTopic = input.discipline.topics[0] ?? input.discipline.label;
  return {
    version: CHALLENGE_BLUEPRINT_VERSION,
    blueprintId: `bp_${nonce}`,
    signature: normalize(`${input.discipline.id}:${primaryTopic}:troubleshooting:${nonce}`),
    nonce,
    primaryTopic,
    focus: primaryTopic,
    emphasis: "fault isolation",
    modeId: "troubleshooting",
    modeLabel: "Troubleshooting investigation",
    modeFamily: "diagnose",
    scenarioFamily: scenarioFamilies[input.discipline.id]?.[0] ?? "operational system",
    practitionerRole: "on-call practitioner",
    evidenceStyle: input.discipline.evidenceTypes[0] ?? "observable artifacts",
    constraintTwist: constraintTwists[0],
    deliverable: "A ranked diagnosis and safe remediation plan",
    interaction: "written",
    validationKind: "holistic",
    responseSections: ["Hypothesis", "Evidence chain", "Diagnostic sequence", "Safe fix", "Verification and rollback"],
    promptDirective: "Create a concrete fault-isolation case with competing hypotheses and a safe response.",
  } satisfies ChallengeBlueprint;
}

function mode(
  id: string,
  label: string,
  family: string,
  lens: string,
  deliverable: string,
  interaction: ChallengeBlueprint["interaction"],
  validationKind: ChallengeBlueprint["validationKind"],
  responseSections: string[],
  promptDirective: string,
  preferenceSignals: string[],
  ...excludedDisciplines: string[]
): ChallengeMode {
  return { id, label, family, lens, deliverable, interaction, validationKind, responseSections, promptDirective, preferenceSignals, excludedDisciplines };
}

const modeEvidenceNeedles: Record<string, string[]> = {
  pressure_triage: ["first 15", "15 minute", "decision window", "triage"],
  configuration_build: ["configuration", "implement", "build"],
  configuration_review: ["configuration", "review", "excerpt"],
  scripting_task: ["code", "script", "function", "input"],
  code_critique: ["code", "script", "diff", "excerpt"],
  true_false_defense: ["true", "false", "claim"],
  forensics_timeline: ["timeline", "timestamp", "time"],
  command_only: ["command", "commands"],
  oral_defense: ["defend", "oral", "position"],
  evidence_ranking: ["rank", "evidence"],
  technology_selection: ["option", "select", "requirements"],
};

function containsTopic(value: string, topic: string) {
  const source = normalize(value);
  const tokens = normalize(topic).split(" ").filter((token) => token.length >= 2);
  return tokens.length > 0 && tokens.every((token) => source.includes(token));
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
