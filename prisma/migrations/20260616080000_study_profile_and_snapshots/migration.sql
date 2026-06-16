-- AlterTable
ALTER TABLE "Challenge" ADD COLUMN "disciplineSnapshot" JSONB;

-- AlterTable
ALTER TABLE "Grade" ADD COLUMN "rubricSnapshot" JSONB;

-- CreateTable
CREATE TABLE "UserStudyProfile" (
    "userId" TEXT NOT NULL,
    "primaryDiscipline" TEXT NOT NULL,
    "secondaryInterests" TEXT[],
    "rankedTopics" TEXT[],
    "currentLevel" TEXT NOT NULL,
    "preferredFormats" TEXT[],
    "evidenceTypes" TEXT[],
    "weeklyTimeBudgetHours" INTEGER NOT NULL,
    "targetDifficulty" "Difficulty" NOT NULL,
    "weakAreas" TEXT[],
    "avoidAreas" TEXT[],
    "goals" TEXT[],
    "customDiscipline" TEXT,
    "customStatus" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserStudyProfile_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "UserStudyProfile" ADD CONSTRAINT "UserStudyProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
