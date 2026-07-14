import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const requiredPaths = [
  "apps/android/package.json",
  "apps/ios/package.json",
  "apps/windows/package.json",
  "packages/contracts/src/index.ts",
  "packages/api-client/src/index.ts",
  "packages/domain/src/index.ts",
  "packages/sync/src/index.ts",
  "packages/design-tokens/src/index.ts",
  "src/app/api/v1/bootstrap/route.ts",
  "src/app/api/v1/openapi/route.ts",
  "src/app/api/v1/social/network/route.ts",
  "src/app/api/v1/social/suggestions/route.ts",
  "src/app/api/v1/notifications/inbox/route.ts",
  "src/app/api/v1/uploads/direct/route.ts",
  "src/app/api/admin/users/route.ts",
  "vercel.json",
  "apps/android/src/lib/notifications.ts",
  "apps/ios/src/lib/notifications.ts",
  "apps/windows/src/lib/notifications.ts",
  "src/lib/notification-scheduler.ts",
];

const missing = requiredPaths.filter((file) => !existsSync(join(root, file)));
if (missing.length) {
  throw new Error(`Missing platform files:\n${missing.join("\n")}`);
}

const schema = readFileSync(join(root, "prisma/schema.prisma"), "utf8");
for (const expected of [
  "model AppSession",
  "model DeviceInstallation",
  "model UserSocialSettings",
  "model NotificationPreference",
  "model StudySchedule",
  "model ScheduledNotification",
  "model ResponseDraft",
  "enum FriendshipStatus",
]) {
  if (!schema.includes(expected)) throw new Error(`Prisma schema missing ${expected}`);
}

for (const expected of ["reminderMinutesBefore", "flexWindowMinutes"]) {
  if (!schema.includes(expected)) throw new Error(`Study rhythm schema missing ${expected}`);
}

const migration = readFileSync(
  join(root, "prisma/migrations/20260712120000_platform_expansion/migration.sql"),
  "utf8",
);
if (!migration.includes('DELETE FROM "Friendship" duplicate')) {
  throw new Error("Friendship migration must de-duplicate reverse pairs before adding pairKey uniqueness.");
}

const todayRoute = readFileSync(join(root, "src/app/api/v1/challenges/today/route.ts"), "utf8");
if (!todayRoute.includes("publicChallenge")) {
  throw new Error("v1 today challenge route must sanitize challenge internals.");
}

const socialRoute = readFileSync(join(root, "src/app/api/v1/social/network/route.ts"), "utf8");
if (!socialRoute.includes("leaderboard") || !socialRoute.includes("friends")) {
  throw new Error("v1 social network route must expose the privacy-safe ranking and accepted connections.");
}

const socialService = readFileSync(join(root, "src/lib/app-service.ts"), "utf8");
if (!socialService.includes('connectionState: item.isYou') || !socialService.includes('stableLearnerAlias')) {
  throw new Error("Public ranking must expose governed connection state and a non-email learner alias.");
}

const notificationScheduler = readFileSync(join(root, "src/lib/notification-scheduler.ts"), "utf8");
for (const kind of ["challenge_available", "study_window", "deadline_warning", "correction_ready", "connection_invitation", "study_block"]) {
  if (!notificationScheduler.includes(kind)) throw new Error(`Notification scheduler missing ${kind}`);
}

const vercel = readFileSync(join(root, "vercel.json"), "utf8");
if (!vercel.includes("0 6 * * *")) {
  throw new Error("The Vercel Hobby-safe daily maintenance cron is missing.");
}

console.log("Platform structure verified.");
