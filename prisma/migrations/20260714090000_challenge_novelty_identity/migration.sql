ALTER TABLE "Challenge"
ADD COLUMN "generationSignature" TEXT,
ADD COLUMN "contentFingerprint" TEXT;

CREATE UNIQUE INDEX "Challenge_contentFingerprint_key"
ON "Challenge"("contentFingerprint");

CREATE UNIQUE INDEX "Challenge_userId_generationSignature_key"
ON "Challenge"("userId", "generationSignature");

CREATE INDEX "Challenge_dateKey_generationSignature_idx"
ON "Challenge"("dateKey", "generationSignature");
