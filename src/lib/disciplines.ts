import type { Difficulty } from "@/lib/domain";

export type RubricAxisKey =
  | "creativity"
  | "ingenuity"
  | "reporting"
  | "alienness"
  | "neatness";

export type DisciplineTemplate = {
  id: string;
  label: string;
  summary: string;
  topics: string[];
  formats: string[];
  evidenceTypes: string[];
  responseSections: string[];
  weakPatterns: string[];
  unsafePatterns: string[];
  rubric: Record<RubricAxisKey, { label: string; description: string }>;
};

const universalRubric: Record<RubricAxisKey, { label: string; description: string }> = {
  creativity: {
    label: "Creativity",
    description: "Frames the problem with useful options instead of repeating surface facts.",
  },
  ingenuity: {
    label: "Ingenuity",
    description: "Uses practical methods, evidence, and constraints to reach a defensible answer.",
  },
  reporting: {
    label: "Reporting",
    description: "Communicates the work clearly enough for another practitioner to audit.",
  },
  alienness: {
    label: "Lateral thinking",
    description: "Notices non-obvious failure modes, trade-offs, and hidden assumptions.",
  },
  neatness: {
    label: "Neatness",
    description: "Keeps the answer structured, concise, and operationally usable.",
  },
};

export const disciplineCatalog: DisciplineTemplate[] = [
  {
    id: "networking",
    label: "Networking",
    summary: "Routing, switching, firewalls, wireless, packet reasoning, and operational troubleshooting.",
    topics: ["VLANs", "STP", "OSPF", "BGP", "NAT", "ACLs", "QoS", "Wireless", "Packet analysis"],
    formats: ["Hands-on lab", "Troubleshooting scenario", "Configuration review", "Design review", "Incident triage"],
    evidenceTypes: ["Commands/config snippets", "Packet or log interpretation", "Topology assumptions", "Rollback plan"],
    responseSections: ["Hypothesis", "Evidence", "Checks", "Risk and rollback", "Recommendation"],
    weakPatterns: ["generic textbook explanation", "no command-level evidence", "ignores rollback"],
    unsafePatterns: ["disruptive change without verification", "broad permit/disable advice", "reload-first reasoning"],
    rubric: universalRubric,
  },
  {
    id: "linux_systems",
    label: "Linux / Systems",
    summary: "Services, logs, permissions, shell tooling, performance, and operational recovery.",
    topics: ["systemd", "journald", "permissions", "processes", "storage", "networking", "Bash/Zsh"],
    formats: ["Hands-on lab", "Log investigation", "Service recovery", "Shell task", "Hardening review"],
    evidenceTypes: ["Command output", "Log excerpts", "Config snippets", "Risk/rollback notes"],
    responseSections: ["Symptom", "Evidence", "Commands", "Root cause", "Fix and validation"],
    weakPatterns: ["blind chmod/chown", "missing logs", "no validation command"],
    unsafePatterns: ["recursive destructive commands", "permission broadening without scope", "service restart without impact check"],
    rubric: universalRubric,
  },
  {
    id: "cybersecurity",
    label: "Cybersecurity",
    summary: "Detection, triage, hardening, incident response, identity, and evidence handling.",
    topics: ["Authentication", "Threat triage", "Hardening", "Network security", "Detection logic", "Containment"],
    formats: ["Hands-on lab", "Security investigation", "Control review", "Incident command", "Detection improvement"],
    evidenceTypes: ["Timeline", "Indicators", "Log correlation", "Containment and recovery plan"],
    responseSections: ["Impact", "Evidence", "Hypothesis", "Containment", "Follow-up"],
    weakPatterns: ["alarmist claims", "no timeline", "no containment criteria"],
    unsafePatterns: ["destroying evidence", "blanket blocking without business impact", "credential advice without rotation scope"],
    rubric: universalRubric,
  },
  {
    id: "software_engineering",
    label: "Software Engineering",
    summary: "Debugging, architecture, API design, testing, code review, and reliability.",
    topics: ["Debugging", "API design", "Testing", "Refactoring", "Performance", "Reliability"],
    formats: ["Hands-on lab", "Bug triage", "Code review", "Design critique", "Test plan"],
    evidenceTypes: ["Reproduction steps", "Failure analysis", "Patch strategy", "Tests and trade-offs"],
    responseSections: ["Problem", "Evidence", "Approach", "Tests", "Trade-offs"],
    weakPatterns: ["solution before reproduction", "no tests", "overbroad refactor"],
    unsafePatterns: ["data-loss changes", "auth bypass", "silent failure handling"],
    rubric: universalRubric,
  },
  {
    id: "automation_scripting",
    label: "Automation / Scripting",
    summary: "Repeatable scripts, parsing, safety checks, idempotency, and operational tooling.",
    topics: ["Bash", "Python", "Ansible", "Parsing", "Idempotency", "Error handling"],
    formats: ["Hands-on lab", "Script improvement", "Automation design", "Runbook automation", "Failure handling"],
    evidenceTypes: ["Pseudocode/code", "Inputs/outputs", "Safety checks", "Dry-run behavior"],
    responseSections: ["Goal", "Inputs", "Logic", "Safety", "Validation"],
    weakPatterns: ["no input validation", "no dry run", "manual-only answer"],
    unsafePatterns: ["destructive loops", "unquoted shell variables", "no rollback path"],
    rubric: universalRubric,
  },
  {
    id: "cloud_devops",
    label: "Cloud / DevOps",
    summary: "Cloud architecture, deployments, IAM, observability, reliability, and cost trade-offs.",
    topics: ["IAM", "Networking", "Deployments", "Observability", "Cost", "Reliability"],
    formats: ["Hands-on lab", "Architecture review", "Incident triage", "Deployment plan", "Cost/risk review"],
    evidenceTypes: ["Architecture assumptions", "Metrics/logs", "IAM scope", "Rollback and blast radius"],
    responseSections: ["Context", "Risk", "Evidence", "Plan", "Rollback"],
    weakPatterns: ["ignores IAM", "no rollback", "no cost or blast-radius note"],
    unsafePatterns: ["wildcard permissions", "public exposure without controls", "state mutation without backup"],
    rubric: universalRubric,
  },
  {
    id: "data_ai",
    label: "Data / AI",
    summary: "Data quality, analysis, model behavior, evaluation, and practical AI system review.",
    topics: ["Data cleaning", "Evaluation", "Prompting", "Model risk", "Metrics", "Pipelines"],
    formats: ["Hands-on lab", "Analysis review", "Model evaluation", "Pipeline triage", "Risk assessment"],
    evidenceTypes: ["Assumptions", "Metrics", "Sample errors", "Validation method"],
    responseSections: ["Question", "Data assumptions", "Method", "Validation", "Limitations"],
    weakPatterns: ["metric-free claims", "no baseline", "no data caveats"],
    unsafePatterns: ["unsupported causal claims", "privacy leakage", "production model change without validation"],
    rubric: universalRubric,
  },
  {
    id: "applied_engineering",
    label: "Applied Engineering / Troubleshooting",
    summary: "Practical fault isolation, trade-offs, maintenance planning, and systems reasoning.",
    topics: ["Fault isolation", "Root cause", "Maintenance", "Reliability", "Safety", "Documentation"],
    formats: ["Hands-on lab", "Troubleshooting case", "Decision review", "Maintenance plan", "Root-cause analysis"],
    evidenceTypes: ["Symptoms", "Tests", "Assumptions", "Risk controls"],
    responseSections: ["Observation", "Hypothesis", "Tests", "Decision", "Prevention"],
    weakPatterns: ["guess-first reasoning", "no control test", "no safety consideration"],
    unsafePatterns: ["unsafe operation", "no isolation", "no stop condition"],
    rubric: universalRubric,
  },
  {
    id: "technical_writing",
    label: "Technical Writing / Documentation",
    summary: "Runbooks, reports, postmortems, procedures, and clear technical communication.",
    topics: ["Runbooks", "Postmortems", "Procedures", "Reports", "Knowledge base", "Decision records"],
    formats: ["Hands-on lab", "Runbook creation", "Incident report", "Procedure review", "Documentation rewrite"],
    evidenceTypes: ["Audience", "Prerequisites", "Steps", "Verification and escalation criteria"],
    responseSections: ["Audience", "Purpose", "Procedure", "Validation", "Escalation"],
    weakPatterns: ["unclear audience", "missing prerequisites", "no verification criteria"],
    unsafePatterns: ["ambiguous dangerous instruction", "missing warning", "no escalation path"],
    rubric: universalRubric,
  },
];

export function getDiscipline(id?: string | null) {
  return disciplineCatalog.find((item) => item.id === id) ?? disciplineCatalog[0];
}

export function disciplineIds() {
  return disciplineCatalog.map((item) => item.id);
}

export function disciplineSnapshot(input: {
  disciplineId: string;
  rankedTopics: string[];
  preferredFormats: string[];
  evidenceTypes: string[];
  targetDifficulty: Difficulty;
  weeklyTimeBudgetHours: number;
  preferenceNotes?: string;
}) {
  const template = getDiscipline(input.disciplineId);
  return {
    id: template.id,
    label: template.label,
    topics: input.rankedTopics.length ? input.rankedTopics : template.topics.slice(0, 4),
    formats: input.preferredFormats.length ? input.preferredFormats : template.formats.slice(0, 3),
    evidenceTypes: input.evidenceTypes.length ? input.evidenceTypes : template.evidenceTypes,
    responseSections: template.responseSections,
    weakPatterns: template.weakPatterns,
    unsafePatterns: template.unsafePatterns,
    rubric: template.rubric,
    targetDifficulty: input.targetDifficulty,
    weeklyTimeBudgetHours: input.weeklyTimeBudgetHours,
    preferenceNotes: input.preferenceNotes?.trim() || undefined,
  };
}

export function defaultDisciplineSnapshot() {
  return disciplineSnapshot({
    disciplineId: "networking",
    rankedTopics: [],
    preferredFormats: [],
    evidenceTypes: [],
    targetDifficulty: "Normal",
    weeklyTimeBudgetHours: 4,
  });
}
