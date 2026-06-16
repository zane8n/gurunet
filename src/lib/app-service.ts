import { z } from "zod";
import type {
  DisciplineRecord,
  MarketplaceChallenge,
  User,
} from "@/lib/domain";
import { difficultyForPis } from "@/lib/challenges";
import { gradeSubmission, createNotebookEntry, needsVerification } from "@/lib/scoring";
import { generateVerificationQuestion, templateFallbackChallenge } from "@/lib/openai-service";
import { createId } from "@/lib/store";
import { prisma } from "@/lib/prisma";
import {
  fromDbChallenge,
  fromDbDisciplineRecord,
  fromDbGrade,
  fromDbMarketplaceChallenge,
  fromDbNotebookEntry,
  fromDbRedemption,
  fromDbStatus,
  fromDbSubmission,
  fromDbUser,
  toDbStatus,
} from "@/lib/db-mappers";
import { enqueueAiJob } from "@/lib/ai-jobs";
import { buildSubmissionContent, type SubmissionAttachment } from "@/lib/submission-content";
import {
  challengeDateKeyFor,
  dateKeyFor,
  getUserTimezone,
  nextChallengeUnlockIso,
  weekKeyFor,
} from "@/lib/time";

export const submissionSchema = z.object({
  content: z.string().trim().min(20).max(120000),
  attachmentIds: z.array(z.string().trim().min(2).max(120)).max(8).optional(),
});

export const verificationSchema = z.object({
  answer: z.string().trim().min(5).max(3000),
});

export const redemptionSchema = z.object({
  rewardName: z.string().trim().min(2).max(120),
  cost: z.coerce.number().int().positive().max(500),
  date: z.string().trim().min(8).max(20),
  note: z.string().trim().max(300).optional(),
});

export const friendSchema = z.object({
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
});

export const enrollmentSchema = z.object({
  challengeId: z.string().trim().min(2).max(120),
});

export async function getDashboard(user: User) {
  await ensureMissedPreviousChallenge(user);
  const today = await getOrCreateTodayChallenge(user);
  await ensureMarketplaceCatalog();

  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const currentUser = fromDbUser(dbUser);
  const timezone = getUserTimezone(currentUser.timezone);
  const [submissions, grades, notebookEntries, redemptions, challenges, socialData] =
    await Promise.all([
      prisma.submission.findMany({
        where: { userId: user.id },
        include: { attachments: true },
      }),
      prisma.grade.findMany({ where: { userId: user.id } }),
      prisma.notebookEntry.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.redemption.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.challenge.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 8,
      }),
      getSocialData(user.id),
    ]);

  const todaySubmissionDb =
    submissions.find((item) => item.challengeId === today.id) ?? null;
  const todaySubmission = todaySubmissionDb
    ? submissionWithAttachments(todaySubmissionDb)
    : null;
  const todayGradeDb = grades.find((item) => item.challengeId === today.id) ?? null;

  return {
    user: currentUser,
    today,
    nextChallengeUnlockAt: nextChallengeUnlockIso(today.dateKey, timezone),
    todaySubmission,
    todayGrade: todayGradeDb ? fromDbGrade(todayGradeDb) : null,
    progress: challenges.map((challenge) => {
      const grade = grades.find((item) => item.challengeId === challenge.id);
      return {
        id: challenge.id,
        date: challenge.dateKey,
        challenge: challenge.title,
        difficulty: challenge.difficulty,
        status: fromDbStatus(challenge.status),
        finalScore: grade?.finalScore ?? null,
        pis: grade?.updatedPis ?? currentUser.pisScore,
        ertEarned: grade?.ertEarned ?? 0,
        ertBalance: grade?.ertBalance ?? currentUser.ertBalance,
        mainWeakness: grade?.nextImprovementTarget ?? "Not graded",
        nextFocus: grade?.nextImprovementTarget ?? "Submit the active challenge",
      };
    }),
    notebookEntries: notebookEntries.map(fromDbNotebookEntry),
    redemptions: redemptions.map(fromDbRedemption),
    social: buildSocialSnapshot(currentUser, socialData),
  };
}

export async function getOrCreateTodayChallenge(user: User) {
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const currentUser = fromDbUser(dbUser);
  const existingChallenges = await prisma.challenge.findMany({
    where: { userId: user.id },
    select: { userId: true, dateKey: true, createdAt: true },
  });
  const today = currentChallengeDateKey(currentUser, existingChallenges);

  const existing = await prisma.challenge.findFirst({
    where: { userId: user.id, dateKey: today },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return fromDbChallenge(existing);

  const [records, recentGrades] = await Promise.all([
    prisma.weeklyDisciplineRecord.findMany({ where: { userId: user.id } }),
    prisma.grade.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { nextImprovementTarget: true, createdAt: true },
    }),
  ]);

  const challenge = createDailyChallenge(currentUser, {
    dateKey: today,
    recovery: needsRecovery(records.map(fromDbDisciplineRecord), currentUser),
    pressure: false,
    recentWeaknesses: recentGrades.map((grade) => grade.nextImprovementTarget),
  });

  const created = await prisma.challenge.create({
    data: {
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

  await enqueueAiJob("ChallengeGeneration", `challenge:${user.id}:${today}`, {
    userId: user.id,
    challengeId: created.id,
    dateKey: today,
    difficulty: difficultyForPis(currentUser.pisScore),
  });

  return fromDbChallenge(created);
}

export async function forceGenerateChallenge(user: User) {
  return getOrCreateTodayChallenge(user);
}

export async function ensureMissedPreviousChallenge(user: User) {
  const timezone = getUserTimezone(user.timezone);
  const weekKey = weekKeyFor(new Date(), timezone);
  const existingChallenges = await prisma.challenge.findMany({
    where: { userId: user.id },
    select: { userId: true, dateKey: true, createdAt: true },
  });
  const today = currentChallengeDateKey(user, existingChallenges);
  const candidates = await prisma.challenge.findMany({
    where: {
      userId: user.id,
      dateKey: { lt: today },
      status: { in: ["Active", "RecoveryChallenge", "PressureChallenge"] },
      submissions: { none: {} },
    },
  });

  for (const challenge of candidates) {
    await prisma.$transaction(async (tx) => {
      const storedUser = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      const nextPis = Math.max(0, Number((storedUser.pisScore - 1).toFixed(1)));
      await tx.challenge.update({
        where: { id: challenge.id },
        data: { status: "Missed" },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { pisScore: nextPis, currentStreak: 0 },
      });
      await tx.ledgerEvent.create({
        data: {
          id: createId("pis"),
          userId: user.id,
          type: "PIS",
          amount: -1,
          reason: `Missed challenge: ${challenge.title}`,
          balanceAfter: nextPis,
        },
      });
      const record = await tx.weeklyDisciplineRecord.upsert({
        where: { userId_weekKey: { userId: user.id, weekKey } },
        update: { missedCount: { increment: 1 } },
        create: {
          id: createId("wdr"),
          userId: user.id,
          weekKey,
          missedCount: 1,
        },
      });
      await tx.weeklyDisciplineRecord.update({
        where: { id: record.id },
        data: {
          pisGainCapMultiplier: record.missedCount + 1 >= 2 ? 0.5 : record.pisGainCapMultiplier,
          weekendRecoveryRequired:
            record.missedCount + 1 >= 3 ? true : record.weekendRecoveryRequired,
        },
      });
    });
  }
}

export async function submitChallenge(
  user: User,
  challengeId: string,
  content: string,
  attachmentIds: string[] = [],
) {
  const challenge = await prisma.challenge.findFirst({
    where: { id: challengeId, userId: user.id },
  });
  if (!challenge) throw new Response("Challenge not found", { status: 404 });
  const existing = await prisma.submission.findFirst({ where: { challengeId } });
  if (existing) throw new Response("Challenge already submitted", { status: 409 });

  const attachments = attachmentIds.length
    ? await prisma.submissionAttachment.findMany({
        where: { id: { in: attachmentIds }, userId: user.id, submissionId: null },
      })
    : [];
  if (attachments.length !== attachmentIds.length) {
    throw new Response("One or more attachments are unavailable", { status: 400 });
  }

  const contentForScoring = buildSubmissionContent({
    body: content,
    attachments: attachments.map((attachment) => ({
      id: attachment.id,
      name: attachment.filename,
      type: attachment.mimeType,
      size: attachment.byteSize,
      kind: attachment.kind,
    })),
  });
  const requiresVerification = needsVerification(contentForScoring);
  const fallbackQuestion =
    "Name the one command or observation that would most directly disprove your main hypothesis.";

  const submittedAt = new Date();
  const submission = await prisma.$transaction(async (tx) => {
    const created = await tx.submission.create({
      data: {
        id: createId("sub"),
        challengeId,
        userId: user.id,
        content,
        submittedAt,
        isLate: submittedAt.getTime() > challenge.deadlineAt.getTime(),
        requiresVerification,
        verificationQuestion: requiresVerification ? fallbackQuestion : null,
        createdAt: submittedAt,
      },
    });
    if (attachmentIds.length > 0) {
      await tx.submissionAttachment.updateMany({
        where: { id: { in: attachmentIds }, userId: user.id, submissionId: null },
        data: { submissionId: created.id },
      });
    }
    await tx.challenge.update({
      where: { id: challengeId },
      data: { status: created.isLate ? "Late" : "Submitted" },
    });
    return created;
  });

  if (requiresVerification) {
    await enqueueAiJob("VerificationQuestion", `verification:${submission.id}`, {
      submissionId: submission.id,
      challengeId,
      userId: user.id,
    });
    void generateVerificationQuestion(fromDbChallenge(challenge), contentForScoring)
      .then((question) =>
        prisma.submission.update({
          where: { id: submission.id },
          data: { verificationQuestion: question },
        }),
      )
      .catch(() => undefined);
  }

  return submissionWithAttachments({ ...submission, attachments });
}

export async function answerVerification(user: User, submissionId: string, answer: string) {
  const submission = await prisma.submission.update({
    where: { id: submissionId, userId: user.id },
    data: { verificationAnswer: answer, requiresVerification: false },
    include: { attachments: true },
  });
  return submissionWithAttachments(submission);
}

export async function gradeExistingSubmission(user: User, submissionId: string) {
  const existing = await prisma.grade.findUnique({ where: { submissionId } });
  if (existing) return fromDbGrade(existing);

  const submission = await prisma.submission.findFirst({
    where: { id: submissionId, userId: user.id },
    include: { attachments: true },
  });
  if (!submission) throw new Response("Submission not found", { status: 404 });
  if (submission.requiresVerification && !submission.verificationAnswer) {
    throw new Response("Verification required before grading", { status: 409 });
  }
  const [challenge, storedUser] = await Promise.all([
    prisma.challenge.findUniqueOrThrow({ where: { id: submission.challengeId } }),
    prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
  ]);

  const domainChallenge = fromDbChallenge(challenge);
  const domainSubmission = submissionWithAttachments(submission);
  const grade = gradeSubmission({
    challenge: domainChallenge,
    submission: domainSubmission,
    user: fromDbUser(storedUser),
  });
  const notebookEntry = createNotebookEntry(domainChallenge, grade);

  const created = await prisma.$transaction(async (tx) => {
    const dbGrade = await tx.grade.create({
      data: {
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
    await tx.user.update({
      where: { id: user.id },
      data: {
        pisScore: grade.updatedPis,
        ertBalance: grade.ertBalance,
        currentStreak: grade.finalScore >= 13 ? { increment: 1 } : 0,
      },
    });
    await tx.ledgerEvent.create({
      data: {
        id: createId("pis"),
        userId: user.id,
        type: "PIS",
        amount: grade.pisChange,
        reason: `Graded challenge: ${challenge.title}`,
        balanceAfter: grade.updatedPis,
      },
    });
    if (grade.ertEarned > 0) {
      await tx.ledgerEvent.create({
        data: {
          id: createId("ert"),
          userId: user.id,
          type: "ERT",
          amount: grade.ertEarned,
          reason: `Earned from challenge: ${challenge.title}`,
          balanceAfter: grade.ertBalance,
        },
      });
    }
    await tx.notebookEntry.create({
      data: {
        id: notebookEntry.id,
        userId: notebookEntry.userId,
        challengeId: notebookEntry.challengeId,
        title: notebookEntry.title,
        summary: notebookEntry.summary,
        mistakes: notebookEntry.mistakes,
        correctApproach: notebookEntry.correctApproach,
        commands: notebookEntry.commands,
        lessons: notebookEntry.lessons,
        tags: notebookEntry.tags,
        createdAt: new Date(notebookEntry.createdAt),
        updatedAt: new Date(notebookEntry.updatedAt),
      },
    });
    return dbGrade;
  });

  await enqueueAiJob("StrictCritique", `critique:${submission.id}`, {
    submissionId: submission.id,
    challengeId: challenge.id,
    gradeId: created.id,
    userId: user.id,
  });

  return fromDbGrade(created);
}

export async function redeemErt(user: User, input: z.infer<typeof redemptionSchema>) {
  const redemption = await prisma.$transaction(async (tx) => {
    const storedUser = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    if (input.cost > storedUser.ertBalance) {
      throw new Response("Insufficient ERT balance", { status: 400 });
    }
    const balanceAfter = storedUser.ertBalance - input.cost;
    await tx.user.update({
      where: { id: user.id },
      data: { ertBalance: balanceAfter },
    });
    const created = await tx.redemption.create({
      data: {
        id: createId("red"),
        userId: user.id,
        rewardName: input.rewardName,
        cost: input.cost,
        date: input.date,
        note: input.note,
        balanceAfter,
      },
    });
    await tx.ledgerEvent.create({
      data: {
        id: createId("ert"),
        userId: user.id,
        type: "ERT",
        amount: -input.cost,
        reason: `Redeemed: ${input.rewardName}`,
        balanceAfter,
      },
    });
    return created;
  });
  return fromDbRedemption(redemption);
}

export async function addFriendByEmail(user: User, input: z.infer<typeof friendSchema>) {
  const friend = await prisma.user.findUnique({ where: { email: input.email } });
  if (!friend) throw new Response("No GURUnet user found with that email", { status: 404 });
  if (friend.id === user.id) throw new Response("You cannot add yourself as a friend", { status: 400 });

  const existing = await prisma.friendship.findFirst({
    where: {
      OR: [
        { userId: user.id, friendId: friend.id },
        { userId: friend.id, friendId: user.id },
      ],
    },
  });
  if (existing) return existing;

  return prisma.friendship.create({
    data: {
      id: createId("frn"),
      userId: user.id,
      friendId: friend.id,
      status: "Accepted",
    },
  });
}

export async function enrollMarketplaceChallenge(
  user: User,
  input: z.infer<typeof enrollmentSchema>,
) {
  await ensureMarketplaceCatalog();
  const challenge = await prisma.marketplaceChallenge.findUnique({
    where: { id: input.challengeId },
  });
  if (!challenge) throw new Response("Marketplace challenge not found", { status: 404 });

  return prisma.$transaction(async (tx) => {
    const existing = await tx.challengeEnrollment.findUnique({
      where: {
        userId_marketplaceChallengeId: {
          userId: user.id,
          marketplaceChallengeId: input.challengeId,
        },
      },
    });
    if (existing) return existing;
    const enrollment = await tx.challengeEnrollment.create({
      data: {
        id: createId("enr"),
        userId: user.id,
        marketplaceChallengeId: input.challengeId,
      },
    });
    const count = await tx.challengeEnrollment.count({
      where: { marketplaceChallengeId: input.challengeId },
    });
    await tx.marketplaceChallenge.update({
      where: { id: input.challengeId },
      data: { enrollmentCount: count },
    });
    return enrollment;
  });
}

function needsRecovery(records: DisciplineRecord[], user: User) {
  return records.some(
    (record) =>
      record.userId === user.id &&
      (record.weekendRecoveryRequired || record.missedCount > 0),
  );
}

function createDailyChallenge(
  user: User,
  options: {
    dateKey: string;
    recovery: boolean;
    pressure: boolean;
    recentWeaknesses: string[];
  },
) {
  return templateFallbackChallenge(user, options.recovery, options.pressure, options.dateKey);
}

function currentChallengeDateKey(
  user: User,
  challenges: { userId: string; dateKey: string; createdAt: Date | string }[],
) {
  const timezone = getUserTimezone(user.timezone);
  const now = new Date();
  const calendarToday = dateKeyFor(now, timezone);
  const rolledKey = challengeDateKeyFor(now, timezone);
  if (rolledKey === calendarToday) return calendarToday;

  const hasPreviousChallenge = challenges.some(
    (item) => item.userId === user.id && item.dateKey === rolledKey,
  );
  return hasPreviousChallenge ? rolledKey : calendarToday;
}

async function getSocialData(userId: string) {
  const [users, grades, challenges, friendships, marketplaceChallenges, challengeEnrollments] =
    await Promise.all([
      prisma.user.findMany(),
      prisma.grade.findMany(),
      prisma.challenge.findMany({ select: { userId: true } }),
      prisma.friendship.findMany({
        where: { OR: [{ userId }, { friendId: userId }] },
      }),
      prisma.marketplaceChallenge.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.challengeEnrollment.findMany(),
    ]);

  return {
    users: users.map(fromDbUser),
    grades: grades.map((grade) => ({
      userId: grade.userId,
      finalScore: grade.finalScore,
      createdAt: grade.createdAt.toISOString(),
    })),
    challenges,
    friendships: friendships.map((friendship) => ({
      id: friendship.id,
      userId: friendship.userId,
      friendId: friendship.friendId,
      status: "Accepted" as const,
      createdAt: friendship.createdAt.toISOString(),
    })),
    marketplaceChallenges: marketplaceChallenges.map(fromDbMarketplaceChallenge),
    challengeEnrollments: challengeEnrollments.map((enrollment) => ({
      id: enrollment.id,
      userId: enrollment.userId,
      marketplaceChallengeId: enrollment.marketplaceChallengeId,
      createdAt: enrollment.createdAt.toISOString(),
    })),
  };
}

function buildSocialSnapshot(
  user: User,
  data: {
    users: User[];
    grades: { userId: string; finalScore: number; createdAt: string }[];
    challenges: { userId: string }[];
    friendships: { id: string; userId: string; friendId: string; status: "Accepted"; createdAt: string }[];
    marketplaceChallenges: MarketplaceChallenge[];
    challengeEnrollments: { id: string; userId: string; marketplaceChallengeId: string; createdAt: string }[];
  },
) {
  const friendIds = new Set(
    data.friendships
      .filter((item) => item.userId === user.id || item.friendId === user.id)
      .map((item) => (item.userId === user.id ? item.friendId : item.userId)),
  );
  const latestGradeByUser = new Map<string, { finalScore: number; createdAt: string }>();
  for (const grade of data.grades) {
    const current = latestGradeByUser.get(grade.userId);
    if (!current || grade.createdAt > current.createdAt) latestGradeByUser.set(grade.userId, grade);
  }

  const profiles = data.users.map((item) => ({
    id: item.id,
    name: item.name,
    handle: `@${item.email.split("@")[0].replace(/[^a-z0-9_]+/gi, "").toLowerCase() || "engineer"}`,
    pisScore: item.pisScore,
    ertBalance: item.ertBalance,
    currentStreak: item.currentStreak,
    challengeCount: data.challenges.filter((challenge) => challenge.userId === item.id).length,
    latestScore: latestGradeByUser.get(item.id)?.finalScore ?? null,
    isFriend: friendIds.has(item.id),
    isYou: item.id === user.id,
  }));

  const leaderboard = profiles
    .slice()
    .sort(
      (a, b) =>
        b.pisScore - a.pisScore ||
        b.currentStreak - a.currentStreak ||
        (b.latestScore ?? -1) - (a.latestScore ?? -1),
    )
    .slice(0, 8)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  const enrolledIds = new Set(
    data.challengeEnrollments
      .filter((item) => item.userId === user.id)
      .map((item) => item.marketplaceChallengeId),
  );

  return {
    friends: profiles.filter((item) => item.isFriend),
    profiles: profiles.filter((item) => item.isYou || item.isFriend).slice(0, 8),
    leaderboard,
    marketplace: data.marketplaceChallenges.map((challenge) => ({
      ...challenge,
      enrollmentCount: data.challengeEnrollments.filter(
        (item) => item.marketplaceChallengeId === challenge.id,
      ).length,
      isEnrolled: enrolledIds.has(challenge.id),
    })),
    enrollments: data.challengeEnrollments.filter((item) => item.userId === user.id),
  };
}

async function ensureMarketplaceCatalog() {
  const catalog: MarketplaceChallenge[] = [
    {
      id: "market_vlan-stp-incident-room",
      title: "VLAN/STP incident room",
      topic: "Switching",
      difficulty: "Normal",
      summary: "A shared drill for ordering evidence, isolating trunk faults, and writing rollback-safe recommendations.",
      estimatedMinutes: 35,
      enrollmentCount: 0,
      createdAt: "2026-01-01T08:00:00.000Z",
    },
    {
      id: "market_ospf-policy-restore",
      title: "OSPF policy restore",
      topic: "Routing",
      difficulty: "Advanced",
      summary: "Separate reachability from protocol admission, then produce the minimum safe firewall correction.",
      estimatedMinutes: 45,
      enrollmentCount: 0,
      createdAt: "2026-01-01T08:00:00.000Z",
    },
    {
      id: "market_auth-burst-triage",
      title: "Authentication burst triage",
      topic: "Linux security",
      difficulty: "Production",
      summary: "Correlate login evidence, service-account behavior, and containment choices under time pressure.",
      estimatedMinutes: 40,
      enrollmentCount: 0,
      createdAt: "2026-01-01T08:00:00.000Z",
    },
  ];

  for (const item of catalog) {
    await prisma.marketplaceChallenge.upsert({
      where: { id: item.id },
      update: {},
      create: {
        ...item,
        createdAt: new Date(item.createdAt),
      },
    });
  }
}

function submissionWithAttachments(
  submission: Parameters<typeof fromDbSubmission>[0] & {
    attachments?: { id: string; filename: string; mimeType: string; byteSize: number; kind: "image" | "file" }[];
  },
) {
  const base = fromDbSubmission(submission);
  const attachments: SubmissionAttachment[] =
    submission.attachments?.map((attachment) => ({
      id: attachment.id,
      name: attachment.filename,
      type: attachment.mimeType,
      size: attachment.byteSize,
      kind: attachment.kind,
    })) ?? [];
  return {
    ...base,
    content:
      attachments.length > 0
        ? buildSubmissionContent({ body: base.content, attachments })
        : base.content,
  };
}
