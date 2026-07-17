import assert from "node:assert/strict";
import {
  challengeDateKeyFor,
  challengeUnlockIso,
  learningClockFor,
  learningCycleDateKeys,
  localDeadlineIso,
  nextChallengeUnlockIso,
} from "../src/lib/time.ts";

const timezone = "Africa/Johannesburg";
const beforeRelease = new Date("2026-07-17T05:59:59.000Z");
const atRelease = new Date("2026-07-17T06:00:00.000Z");

assert.equal(challengeDateKeyFor(beforeRelease, timezone), "2026-07-16");
assert.equal(challengeDateKeyFor(atRelease, timezone), "2026-07-17");
assert.equal(challengeUnlockIso("2026-07-17", timezone), "2026-07-17T06:00:00.000Z");
assert.equal(nextChallengeUnlockIso("2026-07-17", timezone), "2026-07-18T06:00:00.000Z");

const clock = learningClockFor(atRelease, timezone);
assert.equal(clock.localDateKey, "2026-07-17");
assert.equal(clock.activeChallengeDateKey, "2026-07-17");
assert.equal(clock.localTime, "08:00");
assert.equal(clock.nextChallengeReleaseAt, "2026-07-18T06:00:00.000Z");

assert.deepEqual(learningCycleDateKeys("2026-07-17", 6), [
  "2026-07-12",
  "2026-07-13",
  "2026-07-14",
  "2026-07-15",
  "2026-07-16",
  "2026-07-17",
  "2026-07-18",
]);
assert.deepEqual(learningCycleDateKeys("2026-07-17", 0), [
  "2026-07-13",
  "2026-07-14",
  "2026-07-15",
  "2026-07-16",
  "2026-07-17",
  "2026-07-18",
  "2026-07-19",
]);

assert.equal(localDeadlineIso("2026-07-17", "America/New_York", 15), "2026-07-17T19:00:00.000Z");
assert.equal(challengeDateKeyFor(new Date("2026-07-16T18:00:00.000Z"), "Pacific/Kiritimati"), "2026-07-17");

console.log("Time, release boundary, timezone, and learning-cycle checks passed.");
