CREATE INDEX IF NOT EXISTS "Challenge_userId_createdAt_idx"
ON "Challenge"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "Submission_userId_submittedAt_idx"
ON "Submission"("userId", "submittedAt");

CREATE INDEX IF NOT EXISTS "Submission_challengeId_idx"
ON "Submission"("challengeId");

CREATE INDEX IF NOT EXISTS "Grade_userId_createdAt_idx"
ON "Grade"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "Grade_challengeId_idx"
ON "Grade"("challengeId");

CREATE INDEX IF NOT EXISTS "LedgerEvent_userId_createdAt_idx"
ON "LedgerEvent"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "Redemption_userId_createdAt_idx"
ON "Redemption"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "NotebookEntry_userId_createdAt_idx"
ON "NotebookEntry"("userId", "createdAt");
