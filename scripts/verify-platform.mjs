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
  "src/app/api/v1/uploads/direct/route.ts",
  "src/app/api/admin/users/route.ts",
  "vercel.json",
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
  throw new Error("v1 social network route must expose accepted network ranking only.");
}

console.log("Platform structure verified.");
