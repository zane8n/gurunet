ALTER TYPE "ChallengeStatus" ADD VALUE IF NOT EXISTS 'RestDay';

ALTER TABLE "UserStudyProfile"
ADD COLUMN "restDay" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "UserStudyProfile"
ADD CONSTRAINT "UserStudyProfile_restDay_check" CHECK ("restDay" BETWEEN 0 AND 6);

CREATE TABLE "GradeReview" (
  "id" TEXT NOT NULL,
  "gradeId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "dispute" TEXT NOT NULL,
  "outcome" TEXT NOT NULL,
  "rationale" TEXT NOT NULL,
  "before" JSONB NOT NULL,
  "after" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "GradeReview_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GradeReview_gradeId_createdAt_idx" ON "GradeReview"("gradeId", "createdAt");
CREATE INDEX "GradeReview_userId_createdAt_idx" ON "GradeReview"("userId", "createdAt");

ALTER TABLE "GradeReview"
ADD CONSTRAINT "GradeReview_gradeId_fkey"
FOREIGN KEY ("gradeId") REFERENCES "Grade"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GradeReview"
ADD CONSTRAINT "GradeReview_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
