import assert from "node:assert/strict";
import {
  challengeNoveltyIssues,
  selectChallengeBlueprint,
} from "../src/lib/challenge-blueprints.ts";

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

const userHistory = [];
const focuses = new Set();
const modes = new Set();
const families = new Set();
let previousPrimary = "";
for (let day = 1; day <= 45; day += 1) {
  const dateKey = `2026-08-${String(day).padStart(2, "0")}`;
  const blueprint = selectChallengeBlueprint({
    userId: "learner-networking",
    dateKey,
    discipline: networking,
    novelty: { recent: userHistory, sameDayGlobal: [] },
  });
  assert.notEqual(blueprint.focus, [...focuses].at(-1), "focus must not repeat consecutively");
  assert.notEqual(blueprint.primaryTopic, previousPrimary, "primary topic must rotate when alternatives exist");
  assert(!focuses.has(blueprint.focus), `focus repeated inside the 45-day test: ${blueprint.focus}`);
  focuses.add(blueprint.focus);
  modes.add(blueprint.modeId);
  families.add(blueprint.modeFamily);
  previousPrimary = blueprint.primaryTopic;
  userHistory.unshift({
    dateKey,
    title: blueprint.blueprintId,
    topic: blueprint.focus,
    blueprint,
  });
}
assert(modes.size >= 15, `expected broad mode rotation, received ${modes.size}`);
assert(families.size >= 8, `expected broad cognitive-family rotation, received ${families.size}`);

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

console.log(`Challenge generation verified: ${focuses.size} unique focuses, ${modes.size} modes, ${globalSignatures.size} same-day user blueprints.`);
