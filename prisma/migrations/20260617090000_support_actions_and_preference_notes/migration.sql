ALTER TABLE "UserStudyProfile" ADD COLUMN "preferenceNotes" TEXT;

CREATE TABLE "SupportAction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actor" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportAction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SupportAction_dedupeKey_key" ON "SupportAction"("dedupeKey");
CREATE INDEX "SupportAction_userId_createdAt_idx" ON "SupportAction"("userId", "createdAt");

ALTER TABLE "SupportAction" ADD CONSTRAINT "SupportAction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
