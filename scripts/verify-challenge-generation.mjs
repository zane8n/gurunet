import assert from "node:assert/strict";
import {
  challengeNoveltyIssues,
  CHALLENGE_BLUEPRINT_VERSION,
  selectChallengeBlueprint,
} from "../src/lib/challenge-blueprints.ts";
import { buildCoherentChallengeCase } from "../src/lib/challenge-cases.ts";
import { challengeGenerationSystemPrompt } from "../src/lib/challenge-prompt.ts";
import { selectRecoveryContext } from "../src/lib/recovery.ts";

function discipline(id, label, topics, formats) {
  return {
    id,
    label,
    topics,
    formats,
    evidenceTypes: ["Command output", "Logs", "Validation artifacts"],
    responseSections: ["Position", "Evidence", "Work product", "Validation"],
    weakPatterns: [],
    unsafePatterns: [],
    rubric: {},
    targetDifficulty: "Normal",
    weeklyTimeBudgetHours: 4,
    avoidAreas: [],
  };
}

const networking = discipline(
  "networking",
  "Networking",
  ["VLANs", "STP", "OSPF", "BGP", "ACLs"],
  ["Hands-on lab", "Configuration review", "Design review"],
);
const linux = discipline(
  "linux_systems",
  "Linux / Systems",
  ["systemd", "journald", "permissions", "storage", "Bash/Zsh"],
  ["Hands-on lab", "Log investigation", "Shell task"],
);
const governedDisciplines = [
  networking,
  linux,
  discipline("cybersecurity", "Cybersecurity", ["Authentication", "Threat triage", "Hardening", "Network security", "Detection logic", "Containment"], ["Security investigation", "Hardening review", "Forensics timeline"]),
  discipline("software_engineering", "Software Engineering", ["Debugging", "API design", "Testing", "Refactoring", "Performance", "Reliability"], ["Bug triage", "Code review", "Test plan"]),
  discipline("automation_scripting", "Automation / Scripting", ["Bash", "Python", "Ansible", "Parsing", "Idempotency", "Error handling"], ["Scripting and coding", "Code critique", "Command-only challenge"]),
  discipline("cloud_devops", "Cloud / DevOps", ["IAM", "Networking", "Deployments", "Observability", "Cost", "Reliability"], ["Architecture review", "Incident triage", "Minimum safe fix"]),
  discipline("data_ai", "Data / AI", ["Data cleaning", "Evaluation", "Prompting", "Model risk", "Metrics", "Pipelines"], ["Analysis review", "Model evaluation", "Evidence ranking"]),
  discipline("applied_engineering", "Applied Engineering / Troubleshooting", ["Fault isolation", "Root cause", "Maintenance", "Reliability", "Safety", "Documentation"], ["Troubleshooting case", "Decision review", "Failure prediction"]),
  discipline("technical_writing", "Technical Writing / Documentation", ["Runbooks", "Postmortems", "Procedures", "Reports", "Knowledge base", "Decision records"], ["Runbook repair", "Technical brief", "Design critique"]),
];

assert(challengeGenerationSystemPrompt.split(/\s+/).length < 260, "challenge prompt has become a rule engine again");
assert(challengeGenerationSystemPrompt.includes("format hint is a preference"), "format hint is still treated as a binding mode");
assert(challengeGenerationSystemPrompt.includes("Do not combine unrelated assessment styles"), "coherence instruction is missing");

const userHistory = [];
const focuses = new Set();
const signatures = new Set();
const modes = new Set();
let previousPrimary = "";
for (let day = 1; day <= 45; day += 1) {
  const dateKey = day <= 31
    ? `2026-08-${String(day).padStart(2, "0")}`
    : `2026-09-${String(day - 31).padStart(2, "0")}`;
  const blueprint = selectChallengeBlueprint({
    userId: "learner-networking",
    dateKey,
    discipline: networking,
    novelty: { recent: userHistory, sameDayGlobal: [] },
  });
  assert.equal(blueprint.version, CHALLENGE_BLUEPRINT_VERSION, "blueprint version drifted");
  assert.equal(blueprint.focus, blueprint.primaryTopic, "assessment emphasis leaked into the technical topic");
  assert(!blueprint.focus.includes("·"), "technical topic contains presentation metadata");
  assert.notEqual(blueprint.primaryTopic, previousPrimary, "primary topic must rotate when alternatives exist");
  assert(!signatures.has(blueprint.signature), `blueprint signature repeated inside the 45-day test: ${blueprint.signature}`);
  focuses.add(blueprint.focus);
  signatures.add(blueprint.signature);
  modes.add(blueprint.modeId);
  assert.equal(blueprint.modeFamily, "adaptive", "legacy cognitive-mode matrix is still active");
  assert(networking.formats.includes(blueprint.modeLabel), "selector introduced a format the learner did not choose");
  previousPrimary = blueprint.primaryTopic;
  userHistory.unshift({
    dateKey,
    title: blueprint.blueprintId,
    topic: blueprint.focus,
    blueprint,
  });
}
assert.equal(modes.size, networking.formats.length, "preferred format hints did not rotate");
assert.equal(focuses.size, networking.topics.length, "topic rotation did not cover the governed catalog");

const labOnly = discipline("networking", "Networking", networking.topics, ["Hands-on lab"]);
let labAlignedCount = 0;
const labHistory = [];
for (let day = 1; day <= 40; day += 1) {
  const dateKey = day <= 28
    ? `2027-01-${String(day).padStart(2, "0")}`
    : `2027-02-${String(day - 28).padStart(2, "0")}`;
  const blueprint = selectChallengeBlueprint({
    userId: "lab-preference-user",
    dateKey,
    discipline: labOnly,
    novelty: { recent: labHistory, sameDayGlobal: [] },
  });
  if (blueprint.modeLabel === "Hands-on lab" && blueprint.modeId === "hands_on_lab") labAlignedCount += 1;
  labHistory.unshift({ dateKey, title: blueprint.blueprintId, topic: blueprint.focus, blueprint });
}
assert.equal(labAlignedCount, 40, "selector ignored or explored outside the learner's sole format preference");

for (const historyItem of userHistory) {
  const blueprint = historyItem.blueprint;
  const packet = buildCoherentChallengeCase(blueprint, networking.id);
  const scenario = [
    packet.background,
    "Supplied artifacts",
    ...packet.evidence,
    packet.objective,
  ].join("\n");
  const issues = challengeNoveltyIssues({
    title: `${blueprint.primaryTopic}: ${packet.title}`,
    topic: blueprint.focus,
    scenario,
    objective: packet.objective,
    blueprint,
    history: [],
  });
  assert.deepEqual(issues, [], `coherent fallback rejected for ${blueprint.modeId}: ${issues.join(" ")}`);
  assert.equal(packet.evidence.length, 4, "fallback packet must provide four concrete artifacts");
}

const sameDayGlobal = [];
const globalSignatures = new Set();
for (let user = 0; user < 60; user += 1) {
  const blueprint = selectChallengeBlueprint({
    userId: `learner-${user}`,
    dateKey: "2026-09-01",
    discipline: networking,
    novelty: { recent: [], sameDayGlobal },
  });
  assert(!globalSignatures.has(blueprint.signature), "two same-day users received the same semantic blueprint");
  globalSignatures.add(blueprint.signature);
  sameDayGlobal.push({
    dateKey: "2026-09-01",
    title: blueprint.blueprintId,
    topic: blueprint.focus,
    blueprint,
  });
}

const linuxBlueprint = selectChallengeBlueprint({
  userId: "learner-linux",
  dateKey: "2026-09-02",
  discipline: linux,
  novelty: { recent: [], sameDayGlobal: [] },
});
assert(linux.topics.includes(linuxBlueprint.primaryTopic), "Linux profile drifted outside its topic catalog");
assert(!networking.topics.includes(linuxBlueprint.primaryTopic), "Linux profile received a networking topic");

let governedCaseCount = 0;
for (const [disciplineIndex, governed] of governedDisciplines.entries()) {
  for (const [topicIndex, topic] of governed.topics.entries()) {
    const blueprint = selectChallengeBlueprint({
      userId: `governed-${governed.id}-${topicIndex}`,
      dateKey: `2026-10-${String(disciplineIndex + 1).padStart(2, "0")}`,
      discipline: governed,
      requestedTopic: topic,
      novelty: { recent: [], sameDayGlobal: [] },
    });
    const packet = buildCoherentChallengeCase(blueprint, governed.id);
    assert.equal(blueprint.primaryTopic, topic, `${governed.id} did not retain its requested governed topic`);
    assert.equal(packet.evidence.length, 4, `${governed.id}/${topic} does not have four supplied artifacts`);
    assert(packet.evidence.every((item) => /^\[[A-D]\]/.test(item)), `${governed.id}/${topic} artifacts are not explicitly labelled`);
    assert(packet.solution.length >= 100, `${governed.id}/${topic} teaching answer is underdeveloped`);
    governedCaseCount += 1;
  }
}

const focused = selectChallengeBlueprint({
  userId: "focused-user",
  dateKey: "2026-09-03",
  discipline: networking,
  requestedTopic: "BGP",
  novelty: { recent: [], sameDayGlobal: [] },
});
assert.equal(focused.primaryTopic, "BGP", "an explicit governed topic focus was not respected");

const regenerated = selectChallengeBlueprint({
  userId: "focused-user",
  dateKey: "2026-09-03",
  discipline: networking,
  requestedTopic: "BGP",
  novelty: {
    recent: [{ dateKey: "2026-09-03", title: "Original", topic: focused.focus, blueprint: focused }],
    sameDayGlobal: [],
  },
  regenerationAttempt: 1,
});
assert.notEqual(regenerated.signature, focused.signature, "regeneration did not produce a new blueprint");

const validationIssues = challengeNoveltyIssues({
  title: "Original",
  topic: "Wrong topic",
  scenario: "Original scenario with the same evidence and structure repeated again for this learner.",
  blueprint: focused,
  history: [{
    dateKey: "2026-09-02",
    title: "Original",
    topic: focused.focus,
    scenario: "Original scenario with the same evidence and structure repeated again for this learner.",
    blueprint: focused,
  }],
});
assert(validationIssues.some((issue) => issue.includes("topic field")), "topic drift was not detected");
assert(validationIssues.some((issue) => issue.includes("title repeats")), "title repetition was not detected");

const abstractIssues = challengeNoveltyIssues({
  title: `Pressure triage: ${focused.primaryTopic}`,
  topic: focused.focus,
  scenario: "A narrow but repeatable service symptom exists. The relevant configuration is present, but one counter or state transition differs from baseline. One service path fails.",
  objective: "Use the artifacts to make a decision.",
  blueprint: focused,
  history: [],
});
assert(abstractIssues.some((issue) => issue.includes("abstract placeholder")), "abstract fallback prose was not rejected");
assert(abstractIssues.some((issue) => issue.includes("concrete, testable artifacts")), "artifact-free prompt was not rejected");

const recovery = selectRecoveryContext({
  dateKey: "2026-09-04",
  scheduledAfterRest: false,
  manualRequested: false,
  disciplineLabel: "Networking",
  profileWeakAreas: [],
  disciplineTopics: ["ACLs", "VLANs"],
  history: [{
    id: "challenge-1",
    dateKey: "2026-09-03",
    title: "ACL review",
    topic: "ACL troubleshooting: Prove claims with command-level evidence before recommending changes.",
    objective: "Identify the shadowed permit.",
    status: "Submitted",
    grade: {
      id: "grade-1",
      finalScore: 8,
      technicalCap: "INCOMPLETE",
      nextImprovementTarget: "Prove claims with command-level evidence before recommending changes.",
    },
  }],
});
assert(recovery, "low-score recovery was not selected");
assert.equal(recovery.target, "ACL troubleshooting", "recovery target retained an instruction fragment");
assert(recovery.task.includes("10 deny ip 10.10.0.0"), "ACL recovery did not provide a concrete retrieval case");
assert(!recovery.task.includes("nearby but different case"), "legacy generic recovery wording survived");

console.log(`Challenge generation verified: ${signatures.size} unique plans, ${governedCaseCount} governed fallback cases, ${modes.size} profile formats, ${globalSignatures.size} same-day user plans.`);
