import { Prisma } from "@prisma/client";
import { z } from "zod";
import type {
  DisciplineRecord,
  DisciplineSnapshot,
  Difficulty,
  MarketplaceChallenge,
  StudyProfile,
  User,
} from "@/lib/domain";
import { difficultyForPis } from "@/lib/challenges";
import { gradeSubmission, createNotebookEntry, needsVerification } from "@/lib/scoring";
import {
  generateDisciplineNoticeReply,
  generateExaminerChatReply,
  generateVerificationQuestion,
  templateFallbackChallenge,
} from "@/lib/openai-service";
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
  fromDbStudyProfile,
  fromDbUser,
  toDbStatus,
} from "@/lib/db-mappers";
import {
  defaultDisciplineSnapshot,
  disciplineCatalog,
  disciplineSnapshot,
  getDiscipline,
} from "@/lib/disciplines";
import { enqueueAiJob } from "@/lib/ai-jobs";
import { buildSubmissionContent, type SubmissionAttachment } from "@/lib/submission-content";
import {
  challengeDateKeyFor,
  dateKeyFor,
  getUserTimezone,
  localDeadlineIso,
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

export const challengeNoticeSchema = z.object({
  kind: z.enum(["late", "excuse"]),
  reason: z.string().trim().min(6).max(800),
});

const disciplineIdSchema = z.enum([
  "networking",
  "linux_systems",
  "cybersecurity",
  "software_engineering",
  "automation_scripting",
  "cloud_devops",
  "data_ai",
  "applied_engineering",
  "technical_writing",
]);
type DisciplineId = z.infer<typeof disciplineIdSchema>;
const oldTrackToDiscipline: Record<string, string> = {
  networking: "networking",
  linux: "linux_systems",
  security: "cybersecurity",
  automation: "automation_scripting",
  cloud: "cloud_devops",
  incident_command: "cybersecurity",
  documentation: "technical_writing",
};

export const challengeSettingsSchema = z.object({
  track: z.string().transform((value) => oldTrackToDiscipline[value] ?? value).pipe(disciplineIdSchema),
  durationMinutes: z.coerce.number().int().min(15).max(180),
  difficultyFloor: z.enum(["Guided", "Normal", "Advanced", "Production", "Expert"]),
  topicFocus: z.string().trim().max(120).optional(),
  recoveryMode: z.boolean().optional(),
  teamMode: z.boolean().optional(),
});

export const cohortCreateSchema = z.object({
  name: z.string().trim().min(3).max(80),
  track: z.string().transform((value) => oldTrackToDiscipline[value] ?? value).pipe(disciplineIdSchema),
  difficulty: z.enum(["Guided", "Normal", "Advanced", "Production", "Expert"]),
  completionWindowHours: z.coerce.number().int().min(4).max(168),
});

export const cohortJoinSchema = z.object({
  inviteCode: z.string().trim().min(4).max(32).transform((value) => value.toUpperCase()),
});

export const examinerChatSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  challengeId: z.string().trim().min(2).max(120).optional(),
});

export const studyProfileSchema = z.object({
  primaryDiscipline: disciplineIdSchema,
  secondaryInterests: z.array(disciplineIdSchema).max(4).default([]),
  rankedTopics: z.array(z.string().trim().min(2).max(80)).min(3).max(8),
  currentLevel: z.enum(["Beginner", "Intermediate", "Advanced", "Production", "Expert"]),
  preferredFormats: z.array(z.string().trim().min(3).max(80)).min(2).max(6),
  evidenceTypes: z.array(z.string().trim().min(3).max(80)).min(2).max(8),
  weeklyTimeBudgetHours: z.coerce.number().int().min(1).max(40),
  targetDifficulty: z.enum(["Guided", "Normal", "Advanced", "Production", "Expert"]),
  weakAreas: z.array(z.string().trim().min(2).max(80)).min(1).max(8),
  avoidAreas: z.array(z.string().trim().min(2).max(80)).max(8).default([]),
  goals: z.array(z.string().trim().min(5).max(140)).min(1).max(6),
  customDiscipline: z.string().trim().min(3).max(80).optional(),
  preferenceNotes: z.string().trim().max(1000).optional(),
});

export const supportUserLookupSchema = z.object({
  email: z.string().trim().email().max(160).optional(),
  userId: z.string().trim().min(2).max(120).optional(),
}).refine((value) => value.email || value.userId, {
  message: "Provide email or userId.",
});

export const supportActionSchema = supportUserLookupSchema.extend({
  action: z.enum(["RegenerateTodayChallenge", "ClearStudyConfiguration"]),
  reason: z.string().trim().min(3).max(400).optional(),
});

export function getDisciplineCatalog() {
  return disciplineCatalog;
}

export async function getStudyProfile(user: User) {
  const profile = await safeFindStudyProfile(user.id);
  return {
    onboardingRequired: !profile?.completedAt,
    studyProfile: profile,
    activeDiscipline: profile ? snapshotFromProfile(profile) : defaultDisciplineSnapshot(),
  };
}

export async function updateStudyProfile(
  user: User,
  input: z.infer<typeof studyProfileSchema>,
) {
  const template = getDiscipline(input.primaryDiscipline);
  const customStatus = input.customDiscipline ? "Draft" : null;
  const profile = await prisma.userStudyProfile.upsert({
    where: { userId: user.id },
    update: {
      primaryDiscipline: template.id,
      secondaryInterests: input.secondaryInterests,
      rankedTopics: input.rankedTopics,
      currentLevel: input.currentLevel,
      preferredFormats: input.preferredFormats,
      evidenceTypes: input.evidenceTypes,
      weeklyTimeBudgetHours: input.weeklyTimeBudgetHours,
      targetDifficulty: input.targetDifficulty,
      weakAreas: input.weakAreas,
      avoidAreas: input.avoidAreas,
      goals: input.goals,
      customDiscipline: input.customDiscipline,
      customStatus,
      preferenceNotes: input.preferenceNotes,
      completedAt: new Date(),
    },
    create: {
      userId: user.id,
      primaryDiscipline: template.id,
      secondaryInterests: input.secondaryInterests,
      rankedTopics: input.rankedTopics,
      currentLevel: input.currentLevel,
      preferredFormats: input.preferredFormats,
      evidenceTypes: input.evidenceTypes,
      weeklyTimeBudgetHours: input.weeklyTimeBudgetHours,
      targetDifficulty: input.targetDifficulty,
      weakAreas: input.weakAreas,
      avoidAreas: input.avoidAreas,
      goals: input.goals,
      customDiscipline: input.customDiscipline,
      customStatus,
      preferenceNotes: input.preferenceNotes,
      completedAt: new Date(),
    },
  });
  const mapped = fromDbStudyProfile(profile);
  await updateChallengeSettings(user, {
    track: mapped.primaryDiscipline as DisciplineId,
    durationMinutes: Math.max(15, Math.min(180, Math.round((mapped.weeklyTimeBudgetHours * 60) / 5))),
    difficultyFloor: mapped.targetDifficulty,
    topicFocus: mapped.rankedTopics[0] ?? "",
    recoveryMode: false,
    teamMode: false,
  });
  return {
    onboardingRequired: false,
    studyProfile: mapped,
    activeDiscipline: snapshotFromProfile(mapped),
  };
}

export async function getDashboard(user: User) {
  await ensureMissedPreviousChallenge(user);
  const today = await getOrCreateTodayChallenge(user);
  await ensureMarketplaceCatalog();

  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const currentUser = fromDbUser(dbUser);
  const profileState = await getStudyProfile(currentUser);
  const timezone = getUserTimezone(currentUser.timezone);
  const [submissions, grades, notebookEntries, redemptions, challenges, gradedChallenges, todayNotice, challengeSettings, cohorts, socialData] =
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
      prisma.challenge.findMany({
        where: { userId: user.id, grades: { some: {} } },
        orderBy: { createdAt: "desc" },
        take: 12,
      }),
      findLatestChallengeNotice(user.id, today.id),
      getChallengeSettings(currentUser),
      getCohortSnapshot(currentUser),
      getSocialData(user.id),
    ]);

  const todaySubmissionDb =
    submissions.find((item) => item.challengeId === today.id) ?? null;
  const todaySubmission = todaySubmissionDb
    ? submissionWithAttachments(todaySubmissionDb)
    : null;
  const todayGradeDb = grades.find((item) => item.challengeId === today.id) ?? null;
  const progressChallenges = Array.from(
    new Map([...challenges, ...gradedChallenges].map((challenge) => [challenge.id, challenge])).values(),
  )
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 14);

  return {
    user: currentUser,
    today,
    todayNotice: todayNotice
      ? {
          id: todayNotice.id,
          kind: todayNotice.kind,
          reason: todayNotice.reason,
          accepted: todayNotice.accepted,
          reply: todayNotice.reply,
          createdAt: todayNotice.createdAt.toISOString(),
        }
      : null,
    challengeSettings,
    cohorts,
    onboardingRequired: profileState.onboardingRequired,
    studyProfile: profileState.studyProfile,
    activeDiscipline: profileState.activeDiscipline,
    nextChallengeUnlockAt: nextChallengeUnlockIso(today.dateKey, timezone),
    todaySubmission,
    todayGrade: todayGradeDb ? fromDbGrade(todayGradeDb) : null,
    progress: progressChallenges.map((challenge) => {
      const grade = grades.find((item) => item.challengeId === challenge.id);
      const submission = submissions.find((item) => item.challengeId === challenge.id);
      return {
        id: challenge.id,
        date: challenge.dateKey,
        challenge: challenge.title,
        difficulty: challenge.difficulty,
        status: fromDbStatus(challenge.status),
        submittedAt: submission?.submittedAt.toISOString() ?? null,
        deadlineAt: challenge.deadlineAt.toISOString(),
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
    include: { submissions: true, grades: true },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    const normalized = await normalizeActiveChallengeDeadline(currentUser, existing);
    return fromDbChallenge(normalized);
  }

  const [records, recentGrades] = await Promise.all([
    prisma.weeklyDisciplineRecord.findMany({ where: { userId: user.id } }),
    prisma.grade.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { nextImprovementTarget: true, createdAt: true },
    }),
  ]);
  const settings = await getChallengeSettings(currentUser);
  const profileState = await getStudyProfile(currentUser);
  const discipline = profileState.activeDiscipline;

  const challenge = createDailyChallenge(currentUser, {
    dateKey: today,
    recovery: settings.recoveryMode || needsRecovery(records.map(fromDbDisciplineRecord), currentUser),
    pressure: false,
    recentWeaknesses: recentGrades.map((grade) => grade.nextImprovementTarget),
    settings,
    discipline,
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
      disciplineSnapshot: discipline,
      createdAt: new Date(challenge.createdAt),
    },
  });

  await enqueueAiJob("ChallengeGeneration", `challenge:${user.id}:${today}`, {
    userId: user.id,
    challengeId: created.id,
    dateKey: today,
    difficulty: difficultyForPis(currentUser.pisScore),
    track: settings.track,
    topicFocus: settings.topicFocus,
    durationMinutes: settings.durationMinutes,
    disciplineSnapshot: discipline,
  });

  return fromDbChallenge(created);
}

export async function forceGenerateChallenge(user: User) {
  return getOrCreateTodayChallenge(user);
}

export async function getSupportUserSnapshot(input: z.infer<typeof supportUserLookupSchema>) {
  const target = await findSupportTargetUser(input);
  const user = fromDbUser(target);
  const [profileState, settings, latestChallenges, supportActions] = await Promise.all([
    getStudyProfile(user),
    getChallengeSettings(user),
    prisma.challenge.findMany({
      where: { userId: user.id },
      include: { submissions: true, grades: true },
      orderBy: { createdAt: "desc" },
      take: 5,
    }),
    prisma.supportAction.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
  ]);

  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      timezone: user.timezone,
      pisScore: user.pisScore,
      ertBalance: user.ertBalance,
      currentStreak: user.currentStreak,
    },
    studyProfile: profileState.studyProfile,
    activeDiscipline: profileState.activeDiscipline,
    challengeSettings: settings,
    latestChallenges: latestChallenges.map((challenge) => ({
      id: challenge.id,
      dateKey: challenge.dateKey,
      title: challenge.title,
      topic: challenge.topic,
      status: fromDbStatus(challenge.status),
      difficulty: challenge.difficulty,
      submissions: challenge.submissions.length,
      grades: challenge.grades.length,
      preferredFormat: fromDbChallenge(challenge).disciplineSnapshot?.formats?.[0] ?? null,
      createdAt: challenge.createdAt.toISOString(),
    })),
    supportActions: supportActions.map((action) => ({
      id: action.id,
      type: action.type,
      actor: action.actor,
      reason: action.reason,
      createdAt: action.createdAt.toISOString(),
    })),
  };
}

export async function runSupportAction(
  actor: string,
  input: z.infer<typeof supportActionSchema>,
) {
  const target = await findSupportTargetUser(input);
  const user = fromDbUser(target);
  if (input.action === "RegenerateTodayChallenge") {
    return regenerateTodayChallengeOnce(actor, user, input.reason);
  }
  return clearStudyConfiguration(actor, user, input.reason);
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
  if (challenge.status === "Excused") {
    throw new Response("This challenge has been excused. Generate or wait for the next challenge instead.", { status: 409 });
  }
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

export async function recordChallengeNotice(
  user: User,
  challengeId: string,
  input: z.infer<typeof challengeNoticeSchema>,
) {
  const challenge = await prisma.challenge.findFirst({
    where: { id: challengeId, userId: user.id },
  });
  if (!challenge) throw new Response("Challenge not found", { status: 404 });
  const domainChallenge = fromDbChallenge(challenge);
  const accepted = input.kind === "excuse" && isValidExcuseReason(input.reason);
  const reply = await generateDisciplineNoticeReply({
    user,
    challenge: domainChallenge,
    kind: input.kind,
    reason: input.reason,
    accepted,
  });

  const notice = await prisma.$transaction(async (tx) => {
    if (accepted && challenge.status !== "Submitted" && challenge.status !== "Late") {
      await tx.challenge.update({
        where: { id: challenge.id },
        data: { status: "Excused" },
      });
    }
    return tx.challengeNotice.create({
      data: {
        id: createId("ntc"),
        challengeId: challenge.id,
        userId: user.id,
        kind: input.kind,
        reason: input.reason,
        accepted,
        reply,
      },
    });
  });

  return {
    id: notice.id,
    kind: notice.kind,
    reason: notice.reason,
    accepted: notice.accepted,
    reply: notice.reply,
    createdAt: notice.createdAt.toISOString(),
  };
}

export async function getExaminerMessages(user: User) {
  const delegate = (prisma as unknown as {
    examinerMessage?: {
      findMany: (args: {
        where: { userId: string };
        orderBy: { createdAt: "asc" };
        take: number;
      }) => Promise<
        {
          id: string;
          role: string;
          content: string;
          actions: unknown;
          createdAt: Date;
        }[]
      >;
    };
  }).examinerMessage;
  if (!delegate) return [];
  try {
    const rows = await delegate.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "asc" },
      take: 40,
    });
    return rows.map((message) => ({
      id: message.id,
      role: message.role,
      content: message.content,
      actions: message.actions,
      createdAt: message.createdAt.toISOString(),
    }));
  } catch {
    return [];
  }
}

export async function sendExaminerMessage(
  user: User,
  input: z.infer<typeof examinerChatSchema>,
) {
  const challenge =
    input.challengeId
      ? await prisma.challenge.findFirst({ where: { id: input.challengeId, userId: user.id } })
      : await prisma.challenge.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: "desc" },
        });
  if (!challenge) throw new Response("Challenge not found", { status: 404 });

  const currentUser = fromDbUser(await prisma.user.findUniqueOrThrow({ where: { id: user.id } }));
  const settings = await getChallengeSettings(currentUser);
  const recentMessages = await getExaminerMessages(currentUser);
  const appliedActions = await applyExaminerActions(currentUser, fromDbChallenge(challenge), input.message, settings);
  const reply = await generateExaminerChatReply({
    user: currentUser,
    challenge: fromDbChallenge(challenge),
    message: input.message,
    recentMessages: recentMessages.map((message) => ({
      role: message.role,
      content: message.content,
    })),
    appliedActions,
    settings: await getChallengeSettings(currentUser),
  });

  const delegate = (prisma as unknown as {
    examinerMessage?: {
      create: (args: {
        data: {
          id: string;
          userId: string;
          challengeId: string;
          role: string;
          content: string;
          actions?: unknown;
        };
      }) => Promise<{
        id: string;
        role: string;
        content: string;
        actions: unknown;
        createdAt: Date;
      }>;
    };
  }).examinerMessage;
  if (!delegate) {
    return {
      reply: {
        id: createId("xmsg"),
        role: "assistant",
        content: reply,
        actions: appliedActions,
        createdAt: new Date().toISOString(),
      },
    };
  }

  await delegate.create({
    data: {
      id: createId("xmsg"),
      userId: user.id,
      challengeId: challenge.id,
      role: "user",
      content: input.message,
      actions: appliedActions,
    },
  });
  const assistant = await delegate.create({
    data: {
      id: createId("xmsg"),
      userId: user.id,
      challengeId: challenge.id,
      role: "assistant",
      content: reply,
      actions: appliedActions,
    },
  });

  return {
    reply: {
      id: assistant.id,
      role: assistant.role,
      content: assistant.content,
      actions: assistant.actions,
      createdAt: assistant.createdAt.toISOString(),
    },
  };
}

async function applyExaminerActions(
  user: User,
  challenge: ReturnType<typeof fromDbChallenge>,
  message: string,
  settings: Awaited<ReturnType<typeof getChallengeSettings>>,
) {
  const actions: { type: string; summary: string }[] = [];
  const lower = message.toLowerCase();
  const nextSettings = { ...settings };
  let settingsChanged = false;

  const track = inferTrack(lower);
  if (track) {
    nextSettings.track = track;
    settingsChanged = true;
    actions.push({ type: "settings.track", summary: `Future challenge track set to ${trackLabel(track)}.` });
    const profile = await safeFindStudyProfile(user.id);
    if (profile) {
      await prisma.userStudyProfile.update({
        where: { userId: user.id },
        data: { primaryDiscipline: track },
      });
      actions.push({ type: "profile.discipline", summary: `Study profile discipline updated to ${trackLabel(track)}.` });
    }
  }

  const duration = lower.match(/\b(\d{2,3})\s*(min|minute|minutes)\b/);
  if (duration) {
    nextSettings.durationMinutes = Math.max(15, Math.min(180, Number(duration[1])));
    settingsChanged = true;
    actions.push({ type: "settings.duration", summary: `Future challenge duration set to ${nextSettings.durationMinutes} minutes.` });
  }

  const difficulty = inferDifficulty(message);
  if (difficulty) {
    nextSettings.difficultyFloor = difficulty;
    settingsChanged = true;
    actions.push({ type: "settings.difficultyFloor", summary: `Difficulty floor set to ${difficulty}.` });
  }

  if (/\b(recovery mode|recovery challenge|need recovery)\b/i.test(message)) {
    nextSettings.recoveryMode = true;
    settingsChanged = true;
    actions.push({ type: "settings.recoveryMode", summary: "Recovery mode enabled for future challenge generation." });
  }
  if (/\b(team mode|cohort mode|group mode)\b/i.test(message)) {
    nextSettings.teamMode = true;
    settingsChanged = true;
    actions.push({ type: "settings.teamMode", summary: "Team/cohort mode enabled." });
  }

  if (settingsChanged) {
    await updateChallengeSettings(user, challengeSettingsSchema.parse(nextSettings));
  }

  if (/\b(late|delay|delayed|after deadline|cannot submit on time|won't submit on time|will submit later)\b/i.test(message)) {
    const notice = await recordChallengeNotice(user, challenge.id, {
      kind: "late",
      reason: message,
    });
    actions.push({ type: "late_notice", summary: notice.reply });
  } else if (/\b(excuse|excused|sick|ill|hospital|doctor|emergency|travel|flight|work outage|real work|unavoidable|duty|load shedding|power outage)\b/i.test(message)) {
    const notice = await recordChallengeNotice(user, challenge.id, {
      kind: "excuse",
      reason: message,
    });
    actions.push({ type: notice.accepted ? "excuse_accepted" : "excuse_reviewed", summary: notice.reply });
  }

  return actions;
}

function inferTrack(lower: string) {
  if (/\b(linux|systemd|journalctl|bash|zsh)\b/.test(lower)) return "linux_systems";
  if (/\b(security|cyber|incident response|hardening|auth|forensic)\b/.test(lower)) return "cybersecurity";
  if (/\b(automation|script|python|ansible|terraform)\b/.test(lower)) return "automation_scripting";
  if (/\b(cloud|aws|azure|gcp|vpc|iam|devops|kubernetes|kubectl)\b/.test(lower)) return "cloud_devops";
  if (/\b(data|ai|model|dataset|analysis|metric)\b/.test(lower)) return "data_ai";
  if (/\b(software|code|api|typescript|react|testing)\b/.test(lower)) return "software_engineering";
  if (/\b(documentation|runbook|postmortem|report|writing)\b/.test(lower)) return "technical_writing";
  if (/\b(network|networking|routing|switching|ospf|bgp|vlan|stp|firewall)\b/.test(lower)) return "networking";
  return null;
}

function inferDifficulty(message: string): Difficulty | null {
  for (const item of ["Guided", "Normal", "Advanced", "Production", "Expert"] as const) {
    if (new RegExp(`\\b${item}\\b`, "i").test(message)) return item;
  }
  return null;
}

async function findLatestChallengeNotice(userId: string, challengeId: string) {
  const delegate = (prisma as unknown as {
    challengeNotice?: {
      findFirst: (args: {
        where: { userId: string; challengeId: string };
        orderBy: { createdAt: "desc" };
      }) => Promise<{
        id: string;
        kind: string;
        reason: string;
        accepted: boolean;
        reply: string;
        createdAt: Date;
      } | null>;
    };
  }).challengeNotice;
  if (!delegate) return null;

  try {
    return await delegate.findFirst({
      where: { userId, challengeId },
      orderBy: { createdAt: "desc" },
    });
  } catch {
    return null;
  }
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
  const rubricSnapshot =
    domainChallenge.disciplineSnapshot?.rubric ?? defaultDisciplineSnapshot().rubric;
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
        rubricSnapshot,
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

  await enqueueAiJob("NotebookSummary", `notebook:${submission.id}`, {
    submissionId: submission.id,
    challengeId: challenge.id,
    gradeId: created.id,
    userId: user.id,
  });

  if (shouldEscalateToStrictCritique(grade, domainSubmission.content)) {
    await enqueueAiJob("StrictCritique", `critique:${submission.id}`, {
      submissionId: submission.id,
      challengeId: challenge.id,
      gradeId: created.id,
      userId: user.id,
    });
  }

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

export async function updateChallengeSettings(
  user: User,
  input: z.infer<typeof challengeSettingsSchema>,
) {
  const settings = await prisma.userChallengeSettings.upsert({
    where: { userId: user.id },
    update: {
      track: input.track,
      durationMinutes: input.durationMinutes,
      difficultyFloor: input.difficultyFloor,
      topicFocus: input.topicFocus || null,
      recoveryMode: input.recoveryMode ?? false,
      teamMode: input.teamMode ?? false,
    },
    create: {
      userId: user.id,
      track: input.track,
      durationMinutes: input.durationMinutes,
      difficultyFloor: input.difficultyFloor,
      topicFocus: input.topicFocus || null,
      recoveryMode: input.recoveryMode ?? false,
      teamMode: input.teamMode ?? false,
    },
  });
  return mapChallengeSettings(settings);
}

export async function createCohortChallenge(
  user: User,
  input: z.infer<typeof cohortCreateSchema>,
) {
  const cohort = await prisma.$transaction(async (tx) => {
    const created = await tx.cohortChallenge.create({
      data: {
        id: createId("coh"),
        ownerId: user.id,
        name: input.name,
        track: input.track,
        difficulty: input.difficulty,
        completionWindowHours: input.completionWindowHours,
        inviteCode: createInviteCode(),
      },
    });
    await tx.cohortEnrollment.create({
      data: {
        id: createId("cen"),
        cohortChallengeId: created.id,
        userId: user.id,
      },
    });
    return created;
  });
  return cohort;
}

export async function joinCohortChallenge(
  user: User,
  input: z.infer<typeof cohortJoinSchema>,
) {
  const cohort = await prisma.cohortChallenge.findUnique({
    where: { inviteCode: input.inviteCode },
  });
  if (!cohort) throw new Response("Invite code not found", { status: 404 });
  return prisma.cohortEnrollment.upsert({
    where: {
      cohortChallengeId_userId: {
        cohortChallengeId: cohort.id,
        userId: user.id,
      },
    },
    update: {},
    create: {
      id: createId("cen"),
      cohortChallengeId: cohort.id,
      userId: user.id,
    },
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
    settings?: Awaited<ReturnType<typeof getChallengeSettings>>;
    discipline?: DisciplineSnapshot;
  },
) {
  const challenge = templateFallbackChallenge(user, options.recovery, options.pressure, options.dateKey);
  if (!options.settings && !options.discipline) return challenge;
  const discipline = options.discipline ?? defaultDisciplineSnapshot();
  const preferredFormat = discipline.formats[0] ?? "Practical assessment";
  const isLab = /\blab|hands-on|practical|exercise\b/i.test(preferredFormat);
  return {
    ...challenge,
    topic: discipline.label,
    title: isLab ? `${discipline.label} lab: ${challenge.title}` : `${preferredFormat}: ${challenge.title}`,
    difficulty: higherDifficulty(challenge.difficulty, options.settings?.difficultyFloor ?? discipline.targetDifficulty),
    objective: options.settings?.topicFocus
      ? `${challenge.objective} Focus the work on: ${options.settings.topicFocus}.`
      : discipline.topics.length
        ? `${challenge.objective} Focus area: ${discipline.topics[0]}.`
      : challenge.objective,
    constraints: [
      ...challenge.constraints,
      `Preferred challenge format: ${preferredFormat}.`,
      ...(isLab
        ? [
            "Frame this as a lab-style exercise with a concrete setup, task, evidence capture, and validation step.",
          ]
        : []),
      ...(discipline.preferenceNotes
        ? [`User preference notes: ${discipline.preferenceNotes}.`]
        : []),
      `Target completion time: ${options.settings?.durationMinutes ?? Math.max(30, Math.min(120, discipline.weeklyTimeBudgetHours * 12))} minutes.`,
      `Expected evidence style: ${discipline.evidenceTypes.join(", ")}.`,
    ],
    expectedAnswerFormat: `${preferredFormat}. ${discipline.responseSections.join(" -> ")}`,
    submissionRequirements: discipline.evidenceTypes.slice(0, 5),
  };
}

function isValidExcuseReason(reason: string) {
  return /\b(work|shift|outage|incident|travel|flight|sick|sickness|ill|hospital|doctor|emergency|family emergency|duty|unavoidable|power outage|load shedding|bereavement)\b/i.test(
    reason,
  );
}

function shouldEscalateToStrictCritique(
  grade: ReturnType<typeof gradeSubmission>,
  content: string,
) {
  if (process.env.AI_STRICT_CRITIQUE_ALWAYS === "true") return true;
  if (grade.technicalCap !== "NONE") return true;
  if (grade.finalScore >= 9 && grade.finalScore <= 17) return true;
  if (grade.latePenalty > 0) return true;
  if (grade.contentionNotes.length > 0) return true;
  if (/\b(ai|chatgpt|copilot|generated)\b/i.test(content)) return true;
  return false;
}

async function getChallengeSettings(user: User) {
  const fallback = defaultChallengeSettings(user);
  const delegate = (prisma as unknown as {
    userChallengeSettings?: {
      upsert: (args: {
        where: { userId: string };
        update: Record<string, never>;
        create: {
          userId: string;
          track: string;
          durationMinutes: number;
          difficultyFloor: Difficulty;
        };
      }) => Promise<{
        track: string;
        durationMinutes: number;
        difficultyFloor: string;
        topicFocus: string | null;
        recoveryMode: boolean;
        teamMode: boolean;
      }>;
    };
  }).userChallengeSettings;
  if (!delegate) return fallback;
  try {
    const settings = await delegate.upsert({
      where: { userId: user.id },
      update: {},
      create: {
        userId: user.id,
        track: fallback.track,
        durationMinutes: fallback.durationMinutes,
        difficultyFloor: fallback.difficultyFloor as Difficulty,
      },
    });
    return mapChallengeSettings(settings);
  } catch {
    return fallback;
  }
}

async function safeFindStudyProfile(userId: string): Promise<StudyProfile | null> {
  const delegate = (prisma as unknown as {
    userStudyProfile?: {
      findUnique: (args: { where: { userId: string } }) => Promise<Parameters<typeof fromDbStudyProfile>[0] | null>;
    };
  }).userStudyProfile;
  if (!delegate) return null;
  try {
    const profile = await delegate.findUnique({ where: { userId } });
    return profile ? fromDbStudyProfile(profile) : null;
  } catch {
    return null;
  }
}

function snapshotFromProfile(profile: StudyProfile) {
  return disciplineSnapshot({
    disciplineId: profile.primaryDiscipline,
    rankedTopics: profile.rankedTopics,
    preferredFormats: profile.preferredFormats,
    evidenceTypes: profile.evidenceTypes,
    targetDifficulty: profile.targetDifficulty,
    weeklyTimeBudgetHours: profile.weeklyTimeBudgetHours,
    preferenceNotes: profile.preferenceNotes,
  });
}

async function getCohortSnapshot(user: User) {
  const cohortDelegate = (prisma as unknown as { cohortChallenge?: unknown }).cohortChallenge;
  const enrollmentDelegate = (prisma as unknown as { cohortEnrollment?: unknown }).cohortEnrollment;
  if (!cohortDelegate || !enrollmentDelegate) return [];

  type CohortWithEnrollments = {
    id: string;
    ownerId: string;
    name: string;
    track: string;
    difficulty: string;
    completionWindowHours: number;
    inviteCode: string;
    createdAt: Date;
    enrollments: { userId: string }[];
  };
  let owned: CohortWithEnrollments[];
  let joined: { cohortChallenge: CohortWithEnrollments }[];
  let allUsers: Awaited<ReturnType<typeof prisma.user.findMany>>;
  let grades: Awaited<ReturnType<typeof prisma.grade.findMany>>;
  try {
    [owned, joined, allUsers, grades] = await Promise.all([
      prisma.cohortChallenge.findMany({
        where: { ownerId: user.id },
        include: { enrollments: true },
        orderBy: { createdAt: "desc" },
        take: 4,
      }),
      prisma.cohortEnrollment.findMany({
        where: { userId: user.id },
        include: {
          cohortChallenge: {
            include: { enrollments: true },
          },
        },
        orderBy: { createdAt: "desc" },
        take: 6,
      }),
      prisma.user.findMany(),
      prisma.grade.findMany({ orderBy: { createdAt: "desc" } }),
    ]);
  } catch {
    return [];
  }
  const userMap = new Map(allUsers.map((item) => [item.id, fromDbUser(item)]));
  const latestGradeByUser = new Map<string, number>();
  for (const grade of grades) {
    if (!latestGradeByUser.has(grade.userId)) latestGradeByUser.set(grade.userId, grade.finalScore);
  }
  const byId = new Map<string, ReturnType<typeof mapCohort>>();
  for (const cohort of owned) byId.set(cohort.id, mapCohort(cohort, userMap, latestGradeByUser, user.id));
  for (const enrollment of joined) {
    byId.set(
      enrollment.cohortChallenge.id,
      mapCohort(enrollment.cohortChallenge, userMap, latestGradeByUser, user.id),
    );
  }
  return Array.from(byId.values()).slice(0, 6);
}

function defaultChallengeSettings(user: User) {
  return {
    track: "networking",
    durationMinutes: 45,
    difficultyFloor: difficultyForPis(user.pisScore),
    topicFocus: "",
    recoveryMode: false,
    teamMode: false,
  };
}

function mapChallengeSettings(settings: {
  track: string;
  durationMinutes: number;
  difficultyFloor: string;
  topicFocus: string | null;
  recoveryMode: boolean;
  teamMode: boolean;
}) {
  return {
    track: settings.track,
    durationMinutes: settings.durationMinutes,
    difficultyFloor: settings.difficultyFloor,
    topicFocus: settings.topicFocus ?? "",
    recoveryMode: settings.recoveryMode,
    teamMode: settings.teamMode,
  };
}

function mapCohort(
  cohort: {
    id: string;
    ownerId: string;
    name: string;
    track: string;
    difficulty: string;
    completionWindowHours: number;
    inviteCode: string;
    createdAt: Date;
    enrollments: { userId: string }[];
  },
  userMap: Map<string, User>,
  latestGradeByUser: Map<string, number>,
  viewerId: string,
) {
  const leaderboard = cohort.enrollments
    .map((enrollment) => {
      const member = userMap.get(enrollment.userId);
      return member
        ? {
            id: member.id,
            name: member.name,
            pisScore: member.pisScore,
            currentStreak: member.currentStreak,
            latestScore: latestGradeByUser.get(member.id) ?? null,
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort(
      (a, b) =>
        b.pisScore - a.pisScore ||
        b.currentStreak - a.currentStreak ||
        (b.latestScore ?? -1) - (a.latestScore ?? -1),
    )
    .slice(0, 5)
    .map((item, index) => ({ ...item, rank: index + 1 }));

  return {
    id: cohort.id,
    name: cohort.name,
    track: cohort.track,
    difficulty: cohort.difficulty,
    completionWindowHours: cohort.completionWindowHours,
    inviteCode: cohort.inviteCode,
    memberCount: cohort.enrollments.length,
    isOwner: cohort.ownerId === viewerId,
    createdAt: cohort.createdAt.toISOString(),
    leaderboard,
  };
}

function createInviteCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

function trackLabel(track: string) {
  return getDiscipline(oldTrackToDiscipline[track] ?? track).label;
}

function higherDifficulty(current: string, floor: string) {
  const order = ["Guided", "Normal", "Advanced", "Production", "Expert"];
  return order[Math.max(order.indexOf(current), order.indexOf(floor))] as Difficulty;
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

async function normalizeActiveChallengeDeadline<T extends {
  id: string;
  dateKey: string;
  deadlineAt: Date;
  status: string;
  submissions: unknown[];
  grades: unknown[];
}>(
  user: User,
  challenge: T,
) {
  if (
    challenge.submissions.length > 0 ||
    challenge.grades.length > 0 ||
    !["Active", "RecoveryChallenge", "PressureChallenge"].includes(challenge.status)
  ) {
    return challenge;
  }
  const expected = new Date(localDeadlineIso(challenge.dateKey, getUserTimezone(user.timezone), 15));
  if (Math.abs(challenge.deadlineAt.getTime() - expected.getTime()) < 60000) {
    return challenge;
  }
  const updated = await prisma.challenge.update({
    where: { id: challenge.id },
    data: { deadlineAt: expected },
  });
  return { ...challenge, deadlineAt: updated.deadlineAt };
}

async function findSupportTargetUser(input: { email?: string; userId?: string }) {
  const user = await prisma.user.findFirst({
    where: input.userId
      ? { id: input.userId }
      : { email: input.email?.toLowerCase() },
  });
  if (!user) throw new Response("User not found", { status: 404 });
  return user;
}

async function regenerateTodayChallengeOnce(actor: string, user: User, reason?: string) {
  const existingChallenges = await prisma.challenge.findMany({
    where: { userId: user.id },
    select: { userId: true, dateKey: true, createdAt: true },
  });
  const today = currentChallengeDateKey(user, existingChallenges);
  const challenge = await prisma.challenge.findFirst({
    where: { userId: user.id, dateKey: today },
    include: { submissions: true, grades: true },
    orderBy: { createdAt: "desc" },
  });
  if (!challenge) throw new Response("No challenge exists for today yet", { status: 404 });
  if (challenge.submissions.length > 0 || challenge.grades.length > 0) {
    throw new Response("Today challenge cannot be regenerated after submission or grading", { status: 409 });
  }

  const dedupeKey = `support:regen:${user.id}:${today}`;
  const [records, recentGrades, settings, profileState] = await Promise.all([
    prisma.weeklyDisciplineRecord.findMany({ where: { userId: user.id } }),
    prisma.grade.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { nextImprovementTarget: true },
    }),
    getChallengeSettings(user),
    getStudyProfile(user),
  ]);
  const next = createDailyChallenge(user, {
    dateKey: today,
    recovery: settings.recoveryMode || needsRecovery(records.map(fromDbDisciplineRecord), user),
    pressure: false,
    recentWeaknesses: recentGrades.map((grade) => grade.nextImprovementTarget),
    settings,
    discipline: profileState.activeDiscipline,
  });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      await tx.supportAction.create({
        data: {
          id: createId("sup"),
          userId: user.id,
          actor,
          type: "RegenerateTodayChallenge",
          dedupeKey,
          reason,
        },
      });
      return tx.challenge.update({
        where: { id: challenge.id },
        data: {
          title: next.title,
          difficulty: next.difficulty,
          topic: next.topic,
          scenario: next.scenario,
          objective: next.objective,
          constraints: next.constraints,
          allowedTools: next.allowedTools,
          expectedAnswerFormat: next.expectedAnswerFormat,
          submissionRequirements: next.submissionRequirements,
          deadlineAt: new Date(next.deadlineAt),
          solution: next.solution,
          antiGenericRequirement: next.antiGenericRequirement,
          status: toDbStatus(next.status),
          isRecovery: next.isRecovery,
          isPressure: next.isPressure,
          disciplineSnapshot: profileState.activeDiscipline,
          createdAt: new Date(),
        },
      });
    });

    await enqueueAiJob("ChallengeGeneration", `challenge-regenerate:${user.id}:${today}`, {
      userId: user.id,
      challengeId: updated.id,
      dateKey: today,
      difficulty: difficultyForPis(user.pisScore),
      track: settings.track,
      topicFocus: settings.topicFocus,
      durationMinutes: settings.durationMinutes,
      disciplineSnapshot: profileState.activeDiscipline,
    });

    return {
      action: "RegenerateTodayChallenge",
      remainingToday: 0,
      challenge: fromDbChallenge(updated),
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Response("Today challenge has already been regenerated once", { status: 409 });
    }
    throw error;
  }
}

async function clearStudyConfiguration(actor: string, user: User, reason?: string) {
  const timezone = getUserTimezone(user.timezone);
  const today = dateKeyFor(new Date(), timezone);
  const dedupeKey = `support:clear-config:${user.id}:${today}`;
  try {
    await prisma.$transaction(async (tx) => {
      await tx.supportAction.create({
        data: {
          id: createId("sup"),
          userId: user.id,
          actor,
          type: "ClearStudyConfiguration",
          dedupeKey,
          reason,
        },
      });
      await tx.userStudyProfile.deleteMany({ where: { userId: user.id } });
      await tx.userChallengeSettings.deleteMany({ where: { userId: user.id } });
    });
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Response("Configuration has already been cleared once today", { status: 409 });
    }
    throw error;
  }
  return {
    action: "ClearStudyConfiguration",
    onboardingRequired: true,
  };
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function getSocialData(userId: string) {
  const [users, grades, challenges, friendships, marketplaceChallenges, challengeEnrollments, studyProfiles] =
    await Promise.all([
      prisma.user.findMany(),
      prisma.grade.findMany(),
      prisma.challenge.findMany({ select: { userId: true } }),
      prisma.friendship.findMany({
        where: { OR: [{ userId }, { friendId: userId }] },
      }),
      prisma.marketplaceChallenge.findMany({ orderBy: { createdAt: "asc" } }),
      prisma.challengeEnrollment.findMany(),
      prisma.userStudyProfile.findMany(),
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
    studyProfiles: studyProfiles.map(fromDbStudyProfile),
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
    studyProfiles: StudyProfile[];
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
    preferredProfession: preferredProfessionFor(
      data.studyProfiles.find((profile) => profile.userId === item.id),
    ),
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

function preferredProfessionFor(profile?: StudyProfile) {
  if (!profile) return "Not configured";
  if (profile.customDiscipline && profile.customStatus === "Validated") return profile.customDiscipline;
  return getDiscipline(profile.primaryDiscipline).label;
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
