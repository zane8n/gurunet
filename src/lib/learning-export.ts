import { publicUser } from "@/lib/auth";
import {
  fromDbAttachment,
  fromDbChallenge,
  fromDbGrade,
  fromDbNotebookEntry,
  fromDbRedemption,
  fromDbStudyProfile,
  fromDbSubmission,
  fromDbUser,
} from "@/lib/db-mappers";
import type { User } from "@/lib/domain";
import { prisma } from "@/lib/prisma";

export async function buildLearningExport(user: User) {
  const [
    dbUser,
    studyProfile,
    challengeSettings,
    challenges,
    notebookEntries,
    ledgerEvents,
    redemptions,
    disciplineRecords,
    examinerMessages,
    challengeNotices,
    friendshipsStarted,
    friendshipsReceived,
    marketplaceEnrollments,
    cohortEnrollments,
    aiUsage,
  ] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
    prisma.userStudyProfile.findUnique({ where: { userId: user.id } }),
    prisma.userChallengeSettings.findUnique({ where: { userId: user.id } }),
    prisma.challenge.findMany({
      where: { userId: user.id },
      orderBy: [{ dateKey: "desc" }, { createdAt: "desc" }],
      include: {
        submissions: {
          orderBy: { submittedAt: "desc" },
          include: {
            attachments: true,
            grade: true,
          },
        },
        grades: {
          orderBy: { createdAt: "desc" },
        },
      },
    }),
    prisma.notebookEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.ledgerEvent.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.redemption.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.weeklyDisciplineRecord.findMany({
      where: { userId: user.id },
      orderBy: { weekKey: "desc" },
    }),
    prisma.examinerMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.challengeNotice.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
    prisma.friendship.findMany({
      where: { userId: user.id },
      include: { friend: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.friendship.findMany({
      where: { friendId: user.id },
      include: { user: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.challengeEnrollment.findMany({
      where: { userId: user.id },
      include: { marketplaceChallenge: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.cohortEnrollment.findMany({
      where: { userId: user.id },
      include: { cohortChallenge: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.aiUsage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  return {
    schema: "gurunet.learning-export.v1",
    exportedAt: new Date().toISOString(),
    user: publicUser(fromDbUser(dbUser)),
    studyProfile: studyProfile ? fromDbStudyProfile(studyProfile) : null,
    challengeSettings: challengeSettings
      ? {
          track: challengeSettings.track,
          durationMinutes: challengeSettings.durationMinutes,
          difficultyFloor: challengeSettings.difficultyFloor,
          topicFocus: challengeSettings.topicFocus,
          recoveryMode: challengeSettings.recoveryMode,
          teamMode: challengeSettings.teamMode,
          updatedAt: challengeSettings.updatedAt.toISOString(),
        }
      : null,
    challenges: challenges.map((challenge) => ({
      ...fromDbChallenge(challenge),
      submissions: challenge.submissions.map((submission) => ({
        ...fromDbSubmission(submission),
        attachments: submission.attachments.map(fromDbAttachment),
        grade: submission.grade ? fromDbGrade(submission.grade) : null,
      })),
      grades: challenge.grades.map(fromDbGrade),
    })),
    notebookEntries: notebookEntries.map(fromDbNotebookEntry),
    ledgerEvents: ledgerEvents.map((event) => ({
      id: event.id,
      type: event.type,
      amount: event.amount,
      reason: event.reason,
      balanceAfter: event.balanceAfter,
      createdAt: event.createdAt.toISOString(),
    })),
    redemptions: redemptions.map(fromDbRedemption),
    disciplineRecords: disciplineRecords.map((record) => ({
      weekKey: record.weekKey,
      missedCount: record.missedCount,
      pisGainCapMultiplier: record.pisGainCapMultiplier,
      weekendRecoveryRequired: record.weekendRecoveryRequired,
    })),
    examinerMessages: examinerMessages.map((message) => ({
      id: message.id,
      challengeId: message.challengeId,
      role: message.role,
      content: message.content,
      actions: message.actions,
      createdAt: message.createdAt.toISOString(),
    })),
    challengeNotices: challengeNotices.map((notice) => ({
      id: notice.id,
      challengeId: notice.challengeId,
      kind: notice.kind,
      reason: notice.reason,
      accepted: notice.accepted,
      reply: notice.reply,
      createdAt: notice.createdAt.toISOString(),
    })),
    social: {
      friends: [
        ...friendshipsStarted.map((friendship) => ({
          id: friendship.friend.id,
          name: friendship.friend.name,
          email: friendship.friend.email,
          status: friendship.status,
          createdAt: friendship.createdAt.toISOString(),
        })),
        ...friendshipsReceived.map((friendship) => ({
          id: friendship.user.id,
          name: friendship.user.name,
          email: friendship.user.email,
          status: friendship.status,
          createdAt: friendship.createdAt.toISOString(),
        })),
      ],
      marketplaceEnrollments: marketplaceEnrollments.map((enrollment) => ({
        id: enrollment.id,
        createdAt: enrollment.createdAt.toISOString(),
        challenge: {
          id: enrollment.marketplaceChallenge.id,
          title: enrollment.marketplaceChallenge.title,
          topic: enrollment.marketplaceChallenge.topic,
          difficulty: enrollment.marketplaceChallenge.difficulty,
          summary: enrollment.marketplaceChallenge.summary,
          estimatedMinutes: enrollment.marketplaceChallenge.estimatedMinutes,
        },
      })),
      cohortEnrollments: cohortEnrollments.map((enrollment) => ({
        id: enrollment.id,
        createdAt: enrollment.createdAt.toISOString(),
        cohort: {
          id: enrollment.cohortChallenge.id,
          name: enrollment.cohortChallenge.name,
          track: enrollment.cohortChallenge.track,
          difficulty: enrollment.cohortChallenge.difficulty,
          completionWindowHours: enrollment.cohortChallenge.completionWindowHours,
          inviteCode: enrollment.cohortChallenge.inviteCode,
          createdAt: enrollment.cohortChallenge.createdAt.toISOString(),
        },
      })),
    },
    aiUsage: aiUsage.map((usage) => ({
      id: usage.id,
      jobId: usage.jobId,
      type: usage.type,
      model: usage.model,
      promptTokens: usage.promptTokens,
      completionTokens: usage.completionTokens,
      totalTokens: usage.totalTokens,
      estimatedCostUsd: usage.estimatedCostUsd,
      createdAt: usage.createdAt.toISOString(),
    })),
  };
}
