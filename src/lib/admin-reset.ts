import { prisma } from "@/lib/prisma";
import { clearUploadStorage } from "@/lib/storage";

export const resetConfirmationPhrase = "RESET GURUNET DATA";

export async function resetApplicationData(input: {
  actor: string;
  confirmation: string;
}) {
  if (input.confirmation !== resetConfirmationPhrase) {
    throw new Response(`Type ${resetConfirmationPhrase} to confirm reset`, { status: 400 });
  }

  const before = await snapshotCounts();

  await prisma.$executeRawUnsafe(`
    TRUNCATE TABLE
      "AiUsage",
      "AiJob",
      "VerificationToken",
      "MarketplaceChallenge",
      "CohortChallenge",
      "User"
    RESTART IDENTITY CASCADE
  `);

  const uploads = await clearUploadStorage();
  const after = await snapshotCounts();

  return {
    action: "ResetApplicationData",
    actor: input.actor,
    before,
    after,
    uploads,
    preserved: ["AdminCredential", "_prisma_migrations"],
  };
}

async function snapshotCounts() {
  const [
    users,
    challenges,
    submissions,
    submissionAttachments,
    grades,
    challengeNotices,
    examinerMessages,
    notebookEntries,
    weeklyDisciplineRecords,
    friendships,
    marketplaceChallenges,
    challengeEnrollments,
    cohortChallenges,
    cohortEnrollments,
    aiJobs,
    aiUsage,
    sessions,
    localSessions,
    accounts,
    supportActions,
    studyProfiles,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.challenge.count(),
    prisma.submission.count(),
    prisma.submissionAttachment.count(),
    prisma.grade.count(),
    prisma.challengeNotice.count(),
    prisma.examinerMessage.count(),
    prisma.notebookEntry.count(),
    prisma.weeklyDisciplineRecord.count(),
    prisma.friendship.count(),
    prisma.marketplaceChallenge.count(),
    prisma.challengeEnrollment.count(),
    prisma.cohortChallenge.count(),
    prisma.cohortEnrollment.count(),
    prisma.aiJob.count(),
    prisma.aiUsage.count(),
    prisma.session.count(),
    prisma.localSession.count(),
    prisma.account.count(),
    prisma.supportAction.count(),
    prisma.userStudyProfile.count(),
  ]);

  return {
    users,
    challenges,
    submissions,
    submissionAttachments,
    grades,
    challengeNotices,
    examinerMessages,
    notebookEntries,
    weeklyDisciplineRecords,
    friendships,
    marketplaceChallenges,
    challengeEnrollments,
    cohortChallenges,
    cohortEnrollments,
    aiJobs,
    aiUsage,
    sessions,
    localSessions,
    accounts,
    supportActions,
    studyProfiles,
  };
}
