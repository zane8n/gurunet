CREATE TYPE "FriendshipStatus" AS ENUM ('Pending', 'Accepted', 'Declined', 'Cancelled', 'Blocked');
CREATE TYPE "AppPlatform" AS ENUM ('Android', 'IOS', 'Windows');
CREATE TYPE "ScheduledNotificationStatus" AS ENUM ('Queued', 'Sent', 'Cancelled', 'Failed');
CREATE TYPE "NotificationDeliveryStatus" AS ENUM ('Pending', 'Delivered', 'Failed');

DROP INDEX IF EXISTS "Friendship_userId_friendId_key";
ALTER TABLE "Friendship" ADD COLUMN "pairKey" TEXT;
ALTER TABLE "Friendship" ADD COLUMN "respondedAt" TIMESTAMP(3);
ALTER TABLE "Friendship" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
UPDATE "Friendship"
SET "pairKey" = CASE
  WHEN "userId" < "friendId" THEN "userId" || ':' || "friendId"
  ELSE "friendId" || ':' || "userId"
END;
DELETE FROM "Friendship" duplicate
USING "Friendship" keep
WHERE duplicate."id" <> keep."id"
  AND duplicate."pairKey" = keep."pairKey"
  AND (duplicate."createdAt", duplicate."id") > (keep."createdAt", keep."id");
ALTER TABLE "Friendship" ALTER COLUMN "pairKey" SET NOT NULL;
ALTER TABLE "Friendship" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "Friendship" ALTER COLUMN "status" TYPE "FriendshipStatus"
USING "status"::"FriendshipStatus";
ALTER TABLE "Friendship" ALTER COLUMN "status" SET DEFAULT 'Pending';
CREATE UNIQUE INDEX "Friendship_pairKey_key" ON "Friendship"("pairKey");
CREATE INDEX "Friendship_userId_status_idx" ON "Friendship"("userId", "status");
CREATE INDEX "Friendship_friendId_status_idx" ON "Friendship"("friendId", "status");

CREATE TABLE "AppSession" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" "AppPlatform" NOT NULL,
  "deviceId" TEXT NOT NULL,
  "refreshTokenHash" TEXT NOT NULL,
  "previousRefreshTokenHash" TEXT,
  "tokenFamily" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "revokedAt" TIMESTAMP(3),
  "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AppAuthCode" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" "AppPlatform" NOT NULL,
  "codeHash" TEXT NOT NULL,
  "codeChallenge" TEXT NOT NULL,
  "redirectUri" TEXT NOT NULL,
  "state" TEXT NOT NULL,
  "deviceName" TEXT,
  "appVersion" TEXT NOT NULL,
  "timezone" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AppAuthCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeviceInstallation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "platform" "AppPlatform" NOT NULL,
  "pushToken" TEXT,
  "appVersion" TEXT NOT NULL,
  "locale" TEXT,
  "timezone" TEXT NOT NULL,
  "notificationsEnabled" BOOLEAN NOT NULL DEFAULT false,
  "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeviceInstallation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserSocialSettings" (
  "userId" TEXT NOT NULL,
  "discoverable" BOOLEAN NOT NULL DEFAULT false,
  "allowEmailInvites" BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserSocialSettings_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "NotificationPreference" (
  "userId" TEXT NOT NULL,
  "challengeAvailable" BOOLEAN NOT NULL DEFAULT true,
  "studyWindowReminder" BOOLEAN NOT NULL DEFAULT true,
  "deadlineWarning" BOOLEAN NOT NULL DEFAULT true,
  "correctionReady" BOOLEAN NOT NULL DEFAULT true,
  "recoveryPreview" BOOLEAN NOT NULL DEFAULT true,
  "socialInvitations" BOOLEAN NOT NULL DEFAULT false,
  "studyWindowLocalTime" TEXT NOT NULL DEFAULT '10:00',
  "deadlineOffsetMinutes" INTEGER NOT NULL DEFAULT 60,
  "quietStartLocalTime" TEXT NOT NULL DEFAULT '21:00',
  "quietEndLocalTime" TEXT NOT NULL DEFAULT '07:00',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("userId")
);

CREATE TABLE "StudySchedule" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "daysOfWeek" INTEGER[],
  "localTime" TEXT NOT NULL,
  "durationMinutes" INTEGER NOT NULL,
  "timezone" TEXT NOT NULL,
  "oneOffAt" TIMESTAMP(3),
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "calendarExported" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StudySchedule_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ScheduledNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "dedupeKey" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "deepLink" TEXT,
  "payload" JSONB,
  "scheduledFor" TIMESTAMP(3) NOT NULL,
  "status" "ScheduledNotificationStatus" NOT NULL DEFAULT 'Queued',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "sentAt" TIMESTAMP(3),
  "error" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScheduledNotification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotificationDelivery" (
  "id" TEXT NOT NULL,
  "scheduledNotificationId" TEXT NOT NULL,
  "deviceInstallationId" TEXT NOT NULL,
  "status" "NotificationDeliveryStatus" NOT NULL DEFAULT 'Pending',
  "providerMessageId" TEXT,
  "error" TEXT,
  "attemptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deliveredAt" TIMESTAMP(3),
  CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ResponseDraft" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "challengeId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "attachmentIds" TEXT[],
  "revision" INTEGER NOT NULL DEFAULT 1,
  "deviceId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ResponseDraft_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppSession_refreshTokenHash_key" ON "AppSession"("refreshTokenHash");
CREATE UNIQUE INDEX "AppSession_previousRefreshTokenHash_key" ON "AppSession"("previousRefreshTokenHash");
CREATE INDEX "AppSession_userId_revokedAt_idx" ON "AppSession"("userId", "revokedAt");
CREATE INDEX "AppSession_deviceId_idx" ON "AppSession"("deviceId");
CREATE INDEX "AppSession_expiresAt_idx" ON "AppSession"("expiresAt");
CREATE UNIQUE INDEX "AppAuthCode_codeHash_key" ON "AppAuthCode"("codeHash");
CREATE INDEX "AppAuthCode_expiresAt_idx" ON "AppAuthCode"("expiresAt");
CREATE INDEX "AppAuthCode_userId_createdAt_idx" ON "AppAuthCode"("userId", "createdAt");
CREATE UNIQUE INDEX "DeviceInstallation_pushToken_key" ON "DeviceInstallation"("pushToken");
CREATE INDEX "DeviceInstallation_userId_revokedAt_idx" ON "DeviceInstallation"("userId", "revokedAt");
CREATE INDEX "StudySchedule_userId_enabled_idx" ON "StudySchedule"("userId", "enabled");
CREATE UNIQUE INDEX "ScheduledNotification_dedupeKey_key" ON "ScheduledNotification"("dedupeKey");
CREATE INDEX "ScheduledNotification_status_scheduledFor_idx" ON "ScheduledNotification"("status", "scheduledFor");
CREATE INDEX "ScheduledNotification_userId_createdAt_idx" ON "ScheduledNotification"("userId", "createdAt");
CREATE UNIQUE INDEX "NotificationDelivery_scheduledNotificationId_deviceInstallationId_key" ON "NotificationDelivery"("scheduledNotificationId", "deviceInstallationId");
CREATE INDEX "NotificationDelivery_deviceInstallationId_attemptedAt_idx" ON "NotificationDelivery"("deviceInstallationId", "attemptedAt");
CREATE UNIQUE INDEX "ResponseDraft_userId_challengeId_key" ON "ResponseDraft"("userId", "challengeId");
CREATE INDEX "ResponseDraft_challengeId_idx" ON "ResponseDraft"("challengeId");

ALTER TABLE "DeviceInstallation" ADD CONSTRAINT "DeviceInstallation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppSession" ADD CONSTRAINT "AppSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppSession" ADD CONSTRAINT "AppSession_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "DeviceInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AppAuthCode" ADD CONSTRAINT "AppAuthCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSocialSettings" ADD CONSTRAINT "UserSocialSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationPreference" ADD CONSTRAINT "NotificationPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "StudySchedule" ADD CONSTRAINT "StudySchedule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ScheduledNotification" ADD CONSTRAINT "ScheduledNotification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_scheduledNotificationId_fkey" FOREIGN KEY ("scheduledNotificationId") REFERENCES "ScheduledNotification"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_deviceInstallationId_fkey" FOREIGN KEY ("deviceInstallationId") REFERENCES "DeviceInstallation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResponseDraft" ADD CONSTRAINT "ResponseDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ResponseDraft" ADD CONSTRAINT "ResponseDraft_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;
