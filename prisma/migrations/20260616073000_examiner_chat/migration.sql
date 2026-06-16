-- CreateTable
CREATE TABLE "ExaminerMessage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "challengeId" TEXT,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "actions" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExaminerMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExaminerMessage_userId_createdAt_idx" ON "ExaminerMessage"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "ExaminerMessage_challengeId_idx" ON "ExaminerMessage"("challengeId");

-- AddForeignKey
ALTER TABLE "ExaminerMessage" ADD CONSTRAINT "ExaminerMessage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExaminerMessage" ADD CONSTRAINT "ExaminerMessage_challengeId_fkey" FOREIGN KEY ("challengeId") REFERENCES "Challenge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
