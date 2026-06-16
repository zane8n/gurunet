-- CreateTable
CREATE TABLE "UserChallengeSettings" (
    "userId" TEXT NOT NULL,
    "track" TEXT NOT NULL DEFAULT 'networking',
    "durationMinutes" INTEGER NOT NULL DEFAULT 45,
    "difficultyFloor" "Difficulty" NOT NULL DEFAULT 'Normal',
    "topicFocus" TEXT,
    "recoveryMode" BOOLEAN NOT NULL DEFAULT false,
    "teamMode" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserChallengeSettings_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "CohortChallenge" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "track" TEXT NOT NULL,
    "difficulty" "Difficulty" NOT NULL,
    "completionWindowHours" INTEGER NOT NULL DEFAULT 24,
    "inviteCode" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CohortChallenge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CohortEnrollment" (
    "id" TEXT NOT NULL,
    "cohortChallengeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CohortEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CohortChallenge_inviteCode_key" ON "CohortChallenge"("inviteCode");

-- CreateIndex
CREATE INDEX "CohortChallenge_ownerId_idx" ON "CohortChallenge"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "CohortEnrollment_cohortChallengeId_userId_key" ON "CohortEnrollment"("cohortChallengeId", "userId");

-- CreateIndex
CREATE INDEX "CohortEnrollment_userId_idx" ON "CohortEnrollment"("userId");

-- AddForeignKey
ALTER TABLE "UserChallengeSettings" ADD CONSTRAINT "UserChallengeSettings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortChallenge" ADD CONSTRAINT "CohortChallenge_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortEnrollment" ADD CONSTRAINT "CohortEnrollment_cohortChallengeId_fkey" FOREIGN KEY ("cohortChallengeId") REFERENCES "CohortChallenge"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CohortEnrollment" ADD CONSTRAINT "CohortEnrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
