import { readFile } from "node:fs/promises";
import { prisma } from "@/lib/prisma";
import { readData } from "@/lib/store";
import { toDbStatus } from "@/lib/db-mappers";
import { createId } from "@/lib/store";
import type { AppData } from "@/lib/domain";

export async function importJsonData(sourcePath?: string) {
  const data: AppData = sourcePath
    ? JSON.parse(await readFile(sourcePath, "utf8"))
    : await readData();

  const counts = {
    users: 0,
    sessions: 0,
    challenges: 0,
    submissions: 0,
    grades: 0,
    ledgerEvents: 0,
    redemptions: 0,
    notebookEntries: 0,
    disciplineRecords: 0,
    friendships: 0,
    marketplaceChallenges: 0,
    challengeEnrollments: 0,
  };

  for (const user of data.users) {
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        name: user.name,
        email: user.email,
        passwordHash: user.passwordHash,
        timezone: user.timezone,
        pisScore: user.pisScore,
        ertBalance: user.ertBalance,
        currentStreak: user.currentStreak,
      },
      create: {
        id: user.id,
        name: user.name,
        email: user.email,
        passwordHash: user.passwordHash,
        timezone: user.timezone,
        pisScore: user.pisScore,
        ertBalance: user.ertBalance,
        currentStreak: user.currentStreak,
        createdAt: new Date(user.createdAt),
        updatedAt: new Date(user.updatedAt),
      },
    });
    counts.users += 1;
  }

  for (const session of data.sessions) {
    await prisma.localSession.upsert({
      where: { id: session.id },
      update: { userId: session.userId, expiresAt: new Date(session.expiresAt) },
      create: {
        id: session.id,
        userId: session.userId,
        expiresAt: new Date(session.expiresAt),
        createdAt: new Date(session.createdAt),
      },
    });
    counts.sessions += 1;
  }

  for (const challenge of data.challenges) {
    await prisma.challenge.upsert({
      where: { id: challenge.id },
      update: {
        status: toDbStatus(challenge.status),
        title: challenge.title,
        topic: challenge.topic,
      },
      create: {
        id: challenge.id,
        userId: challenge.userId,
        dateKey: challenge.dateKey,
        title: challenge.title,
        difficulty: challenge.difficulty,
        topic: challenge.topic,
        scenario: challenge.scenario,
        objective: challenge.objective,
        constraints: challenge.constraints,
        allowedTools: challenge.allowedTools,
        expectedAnswerFormat: challenge.expectedAnswerFormat,
        submissionRequirements: challenge.submissionRequirements,
        deadlineAt: new Date(challenge.deadlineAt),
        solution: challenge.solution,
        antiGenericRequirement: challenge.antiGenericRequirement,
        status: toDbStatus(challenge.status),
        isRecovery: challenge.isRecovery,
        isPressure: challenge.isPressure,
        createdAt: new Date(challenge.createdAt),
      },
    });
    counts.challenges += 1;
  }

  for (const submission of data.submissions) {
    await prisma.submission.upsert({
      where: { id: submission.id },
      update: {
        content: submission.content,
        requiresVerification: submission.requiresVerification,
        verificationQuestion: submission.verificationQuestion,
        verificationAnswer: submission.verificationAnswer,
      },
      create: {
        id: submission.id,
        challengeId: submission.challengeId,
        userId: submission.userId,
        content: submission.content,
        submittedAt: new Date(submission.submittedAt),
        isLate: submission.isLate,
        requiresVerification: submission.requiresVerification,
        verificationQuestion: submission.verificationQuestion,
        verificationAnswer: submission.verificationAnswer,
        createdAt: new Date(submission.createdAt),
      },
    });
    counts.submissions += 1;
  }

  for (const grade of data.grades) {
    await prisma.grade.upsert({
      where: { id: grade.id },
      update: { correction: grade.correction, nextImprovementTarget: grade.nextImprovementTarget },
      create: {
        id: grade.id,
        submissionId: grade.submissionId,
        challengeId: grade.challengeId,
        userId: grade.userId,
        creativity: grade.creativity,
        ingenuity: grade.ingenuity,
        reporting: grade.reporting,
        alienness: grade.alienness,
        neatness: grade.neatness,
        rawScore: grade.rawScore,
        balancePenalty: grade.balancePenalty,
        latePenalty: grade.latePenalty,
        technicalCap: grade.technicalCap,
        finalScore: grade.finalScore,
        verdict: grade.verdict,
        correction: grade.correction,
        contentionNotes: grade.contentionNotes,
        nextImprovementTarget: grade.nextImprovementTarget,
        pisChange: grade.pisChange,
        previousPis: grade.previousPis,
        updatedPis: grade.updatedPis,
        ertEarned: grade.ertEarned,
        ertBalance: grade.ertBalance,
        createdAt: new Date(grade.createdAt),
      },
    });
    counts.grades += 1;
  }

  for (const event of data.ledgerEvents) {
    await prisma.ledgerEvent.upsert({
      where: { id: event.id },
      update: {},
      create: {
        id: event.id,
        userId: event.userId,
        type: event.type,
        amount: event.amount,
        reason: event.reason,
        balanceAfter: event.balanceAfter,
        createdAt: new Date(event.createdAt),
      },
    });
    counts.ledgerEvents += 1;
  }

  for (const redemption of data.redemptions) {
    await prisma.redemption.upsert({
      where: { id: redemption.id },
      update: {},
      create: {
        id: redemption.id,
        userId: redemption.userId,
        rewardName: redemption.rewardName,
        cost: redemption.cost,
        date: redemption.date,
        note: redemption.note,
        balanceAfter: redemption.balanceAfter,
        createdAt: new Date(redemption.createdAt),
      },
    });
    counts.redemptions += 1;
  }

  for (const entry of data.notebookEntries) {
    await prisma.notebookEntry.upsert({
      where: { id: entry.id },
      update: { summary: entry.summary, lessons: entry.lessons, tags: entry.tags },
      create: {
        id: entry.id,
        userId: entry.userId,
        challengeId: entry.challengeId,
        title: entry.title,
        summary: entry.summary,
        mistakes: entry.mistakes,
        correctApproach: entry.correctApproach,
        commands: entry.commands,
        lessons: entry.lessons,
        tags: entry.tags,
        createdAt: new Date(entry.createdAt),
        updatedAt: new Date(entry.updatedAt),
      },
    });
    counts.notebookEntries += 1;
  }

  for (const record of data.disciplineRecords) {
    await prisma.weeklyDisciplineRecord.upsert({
      where: { userId_weekKey: { userId: record.userId, weekKey: record.weekKey } },
      update: {
        missedCount: record.missedCount,
        pisGainCapMultiplier: record.pisGainCapMultiplier,
        weekendRecoveryRequired: record.weekendRecoveryRequired,
      },
      create: {
        id: createId("wdr"),
        userId: record.userId,
        weekKey: record.weekKey,
        missedCount: record.missedCount,
        pisGainCapMultiplier: record.pisGainCapMultiplier,
        weekendRecoveryRequired: record.weekendRecoveryRequired,
      },
    });
    counts.disciplineRecords += 1;
  }

  for (const friendship of data.friendships) {
    await prisma.friendship.upsert({
      where: { id: friendship.id },
      update: {},
      create: {
        id: friendship.id,
        userId: friendship.userId,
        friendId: friendship.friendId,
        status: friendship.status,
        createdAt: new Date(friendship.createdAt),
      },
    });
    counts.friendships += 1;
  }

  for (const challenge of data.marketplaceChallenges) {
    await prisma.marketplaceChallenge.upsert({
      where: { id: challenge.id },
      update: {
        enrollmentCount: challenge.enrollmentCount,
      },
      create: {
        id: challenge.id,
        title: challenge.title,
        topic: challenge.topic,
        difficulty: challenge.difficulty,
        summary: challenge.summary,
        estimatedMinutes: challenge.estimatedMinutes,
        enrollmentCount: challenge.enrollmentCount,
        createdAt: new Date(challenge.createdAt),
      },
    });
    counts.marketplaceChallenges += 1;
  }

  for (const enrollment of data.challengeEnrollments) {
    await prisma.challengeEnrollment.upsert({
      where: { id: enrollment.id },
      update: {},
      create: {
        id: enrollment.id,
        userId: enrollment.userId,
        marketplaceChallengeId: enrollment.marketplaceChallengeId,
        createdAt: new Date(enrollment.createdAt),
      },
    });
    counts.challengeEnrollments += 1;
  }

  return counts;
}
