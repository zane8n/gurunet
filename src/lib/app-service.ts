import { Prisma } from "@prisma/client";
import { z } from "zod";
import type {
  Challenge,
  DisciplineRecord,
  DisciplineSnapshot,
  Difficulty,
  Grade,
  MarketplaceChallenge,
  RetentionSnapshot,
  StudyProfile,
  User,
} from "@/lib/domain";
import { difficultyForPis } from "@/lib/challenges";
import {
  gradeSubmission,
  createNotebookEntry,
  needsVerification,
  recalculateGradeFromReview,
} from "@/lib/scoring";
import {
  generateDisciplineNoticeReply,
  generateExaminerChatReply,
  generateGradeReview,
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
  disciplineProfileFingerprint,
  disciplineProfileKey,
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

const governedGoals = [
  "Stronger troubleshooting discipline",
  "Better technical communication",
  "Production-ready judgment",
  "Broader STEM fluency",
  "Interview/certification readiness",
  "Build a reusable notebook",
] as const;

const baseStudyProfileSchema = z.object({
  primaryDiscipline: disciplineIdSchema,
  secondaryInterests: z.array(disciplineIdSchema).max(4).default([]),
  rankedTopics: z.array(z.string().trim().min(2).max(80)).min(3).max(8),
  currentLevel: z.enum(["Beginner", "Intermediate", "Advanced", "Production", "Expert"]),
  preferredFormats: z.array(z.string().trim().min(3).max(80)).min(2).max(6),
  evidenceTypes: z.array(z.string().trim().min(3).max(80)).min(2).max(8),
  weeklyTimeBudgetHours: z.coerce.number().int().min(1).max(40),
  restDay: z.coerce.number().int().min(0).max(6),
  targetDifficulty: z.enum(["Guided", "Normal", "Advanced", "Production", "Expert"]),
  weakAreas: z.array(z.string().trim().min(2).max(80)).min(1).max(8),
  avoidAreas: z.array(z.string().trim().min(2).max(80)).max(8).default([]),
  goals: z.array(z.string().trim().min(5).max(140)).min(1).max(6),
  customDiscipline: z.string().trim().min(3).max(80).optional(),
  preferenceNotes: z.string().trim().max(1000).optional(),
});

export const studyProfileSchema = baseStudyProfileSchema.superRefine((input, ctx) => {
  const template = getDiscipline(input.primaryDiscipline);
  const topicSet = new Set(template.topics);
  const formatSet = new Set(template.formats);
  const evidenceSet = new Set(template.evidenceTypes);
  const goalSet = new Set<string>(governedGoals);

  addUniqueArrayIssue(ctx, input.secondaryInterests, "secondaryInterests", "Secondary interests must not contain duplicates.");
  addUniqueArrayIssue(ctx, input.rankedTopics, "rankedTopics", "Ranked topic interests must not contain duplicates.");
  addUniqueArrayIssue(ctx, input.preferredFormats, "preferredFormats", "Preferred challenge formats must not contain duplicates.");
  addUniqueArrayIssue(ctx, input.evidenceTypes, "evidenceTypes", "Expected evidence/output choices must not contain duplicates.");
  addUniqueArrayIssue(ctx, input.weakAreas, "weakAreas", "Weak areas must not contain duplicates.");
  addUniqueArrayIssue(ctx, input.avoidAreas, "avoidAreas", "Avoid areas must not contain duplicates.");
  addUniqueArrayIssue(ctx, input.goals, "goals", "Professional goals must not contain duplicates.");

  if (input.secondaryInterests.includes(input.primaryDiscipline)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["secondaryInterests"],
      message: "Secondary interests must be adjacent areas, not the same as the primary discipline.",
    });
  }

  addCatalogIssue(ctx, input.rankedTopics, topicSet, "rankedTopics", `${template.label} topic interests must come from the governed catalog.`);
  addCatalogIssue(ctx, input.preferredFormats, formatSet, "preferredFormats", `${template.label} challenge formats must come from the governed catalog.`);
  addCatalogIssue(ctx, input.evidenceTypes, evidenceSet, "evidenceTypes", `${template.label} evidence/output choices must come from the governed catalog.`);
  addCatalogIssue(ctx, input.weakAreas, topicSet, "weakAreas", `${template.label} weak areas must come from the governed topic catalog.`);
  addCatalogIssue(ctx, input.avoidAreas, topicSet, "avoidAreas", `${template.label} avoid areas must come from the governed topic catalog.`);
  addCatalogIssue(ctx, input.goals, goalSet, "goals", "Professional goals must come from the governed goal list.");

  const overlap = input.weakAreas.filter((item) => input.avoidAreas.includes(item));
  if (overlap.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["avoidAreas"],
      message: `Avoid areas cannot also be weak-area targets: ${overlap.join(", ")}.`,
    });
  }

  const custom = input.customDiscipline?.trim();
  if (custom) {
    if (/\b(anything|everything|tech|technology|stem|computer|computers|general|misc|stuff|whatever|make me better)\b/i.test(custom)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["customDiscipline"],
        message: "Custom discipline requests must be specific. Use the governed primary discipline as the fallback and describe the specialty precisely.",
      });
    }
    if ((input.preferenceNotes?.trim().length ?? 0) < 60) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["preferenceNotes"],
        message: "Custom discipline requests need at least 60 characters of preference notes so the system can keep rigor without inventing standards.",
      });
    }
  }
});

function addUniqueArrayIssue(
  ctx: z.RefinementCtx,
  values: string[],
  path: string,
  message: string,
) {
  if (new Set(values).size !== values.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  }
}

function addCatalogIssue(
  ctx: z.RefinementCtx,
  values: string[],
  allowed: Set<string>,
  path: string,
  message: string,
) {
  if (values.some((value) => !allowed.has(value))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: [path], message });
  }
}

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
      restDay: input.restDay,
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
      restDay: input.restDay,
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
    topicFocus: "",
    recoveryMode: false,
    teamMode: false,
  });
  await getOrCreateTodayChallenge(user);
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
  const currentWeekKey = weekKeyFor(new Date(), timezone);
  const [
    submissions,
    grades,
    notebookEntries,
    redemptions,
    challenges,
    gradedChallenges,
    todayNotice,
    challengeSettings,
    cohorts,
    socialData,
    weeklyRecord,
  ] =
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
      prisma.weeklyDisciplineRecord.findUnique({
        where: { userId_weekKey: { userId: user.id, weekKey: currentWeekKey } },
      }),
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
  const progress = progressChallenges.map((challenge) => {
    const grade = grades.find((item) => item.challengeId === challenge.id);
    const submission = submissions.find((item) => item.challengeId === challenge.id);
    return {
      id: challenge.id,
      date: challenge.dateKey,
      challenge: challenge.title,
      topic: challenge.topic,
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
  });
  const retention = buildRetentionSnapshot({
    user: currentUser,
    today,
    todayGrade: todayGradeDb ? fromDbGrade(todayGradeDb) : null,
    progress,
    discipline: profileState.activeDiscipline,
    settings: challengeSettings,
    weeklyRecord,
    timezone,
  });

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
    progress,
    retention,
    notebookEntries: notebookEntries.map(fromDbNotebookEntry),
    redemptions: redemptions.map(fromDbRedemption),
    social: buildSocialSnapshot(currentUser, socialData),
  };
}

type RetentionProgressRow = {
  date: string;
  status: string;
  submittedAt: string | null;
  deadlineAt: string;
  finalScore: number | null;
};

function buildRetentionSnapshot(input: {
  user: User;
  today: Challenge;
  todayGrade: Grade | null;
  progress: RetentionProgressRow[];
  discipline: DisciplineSnapshot;
  settings: Awaited<ReturnType<typeof getChallengeSettings>>;
  weeklyRecord: { completedCount: number; continuityCreditEarned: boolean } | null;
  timezone: string;
}): RetentionSnapshot {
  const calendarToday = dateKeyFor(new Date(), input.timezone);
  const weekDates = dateKeysForCurrentWeek(calendarToday);
  const weekRows = input.progress.filter((row) => weekDates.includes(row.date));
  const completedFromRows = weekRows.filter((row) => row.finalScore !== null).length;
  const completedDays = Math.max(completedFromRows, input.weeklyRecord?.completedCount ?? 0);
  const targetDays = 4;
  const scores = weekRows
    .map((row) => row.finalScore)
    .filter((score): score is number => score !== null);
  const averageScore = scores.length
    ? Number((scores.reduce((sum, score) => sum + score, 0) / scores.length).toFixed(1))
    : null;
  const bestScore = scores.length ? Math.max(...scores) : null;
  const earlySubmissions = weekRows.filter(
    (row) =>
      row.submittedAt &&
      Date.parse(row.submittedAt) <= Date.parse(row.deadlineAt),
  ).length;
  const dayOfWeek = new Date(`${calendarToday}T12:00:00.000Z`).getUTCDay();
  const revealUnlocked = completedDays >= targetDays || (dayOfWeek === 0 && scores.length > 0);
  const nextDateKey = addDaysToDateKey(input.today.dateKey, 1);
  const restDay = input.discipline.restDay ?? 0;
  const nextIsRestDay = isScheduledRestDay(nextDateKey, restDay);
  const nextIsRecoveryDay = isDayAfterScheduledRest(nextDateKey, restDay);
  const previewFocus =
    profileFocusForChallenge(
      input.user.id,
      nextDateKey,
      input.discipline,
      input.settings.topicFocus,
    ) ??
    input.discipline.topics[0] ??
    input.discipline.label;
  const previewFormat =
    profileFormatForChallenge(input.user.id, nextDateKey, input.discipline) ??
    input.discipline.formats[0] ??
    "Practical assessment";

  return {
    targetDays,
    completedDays,
    continuityCredits: input.user.continuityCredits,
    creditEarnedThisWeek: input.weeklyRecord?.continuityCreditEarned ?? false,
    days: weekDates.map((date, index) => {
      const row = weekRows.find((item) => item.date === date);
      let state: RetentionSnapshot["days"][number]["state"];
      if (row?.finalScore !== null && row?.finalScore !== undefined) state = "completed";
      else if (row?.status === "Protected") state = "protected";
      else if (row?.status === "Missed") state = "missed";
      else if (row?.status === "RestDay") state = "rest";
      else if (date === calendarToday) state = "today";
      else if (date > calendarToday) state = "upcoming";
      else state = "open";
      return {
        date,
        label: ["M", "T", "W", "T", "F", "S", "S"][index],
        state,
        score: row?.finalScore ?? null,
      };
    }),
    preview: {
      available: Boolean(input.todayGrade) || input.today.status === "RestDay",
      unlockAt: nextChallengeUnlockIso(input.today.dateKey, input.timezone),
      discipline: input.discipline.label,
      focus: nextIsRestDay ? "Scheduled weekly rest day" : previewFocus,
      format: nextIsRestDay
        ? "No assessment"
        : nextIsRecoveryDay
          ? `${previewFormat} + recovery task`
          : previewFormat,
      durationMinutes: nextIsRestDay ? 0 : input.settings.durationMinutes,
      difficulty: higherDifficulty(
        difficultyForPis(input.user.pisScore),
        input.settings.difficultyFloor,
      ),
    },
    weeklyReveal: {
      unlocked: revealUnlocked,
      averageScore,
      bestScore,
      earlySubmissions,
      message: revealUnlocked
        ? weeklyRevealMessage(averageScore, completedDays)
        : `${Math.max(0, targetDays - completedDays)} more completed ${targetDays - completedDays === 1 ? "day" : "days"} unlocks the weekly reveal. Sunday also closes the week without requiring seven submissions.`,
    },
  };
}

function dateKeysForCurrentWeek(dateKey: string) {
  const current = new Date(`${dateKey}T12:00:00.000Z`);
  const daysSinceMonday = (current.getUTCDay() + 6) % 7;
  const monday = addDaysToDateKey(dateKey, -daysSinceMonday);
  return Array.from({ length: 7 }, (_, index) => addDaysToDateKey(monday, index));
}

function addDaysToDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekDayForDateKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
}

function isScheduledRestDay(dateKey: string, restDay: number) {
  return weekDayForDateKey(dateKey) === restDay;
}

function isDayAfterScheduledRest(dateKey: string, restDay: number) {
  return weekDayForDateKey(addDaysToDateKey(dateKey, -1)) === restDay;
}

function weeklyRevealMessage(averageScore: number | null, completedDays: number) {
  if (averageScore === null) return `${completedDays} learning days were protected this week.`;
  if (averageScore >= 15) return `Strong week: ${completedDays} completed days with precise, defensible work.`;
  if (averageScore >= 11) return `Solid continuity: ${completedDays} completed days with a clear next layer to strengthen.`;
  return `You kept the learning loop active for ${completedDays} days. Use the correction themes as next week's starting point.`;
}

export async function getOrCreateTodayChallenge(user: User) {
  const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  const currentUser = fromDbUser(dbUser);
  const existingChallenges = await prisma.challenge.findMany({
    where: { userId: user.id },
    select: { userId: true, dateKey: true, createdAt: true },
  });
  const today = currentChallengeDateKey(currentUser, existingChallenges);
  const settings = await getChallengeSettings(currentUser);
  const profileState = await getStudyProfile(currentUser);
  const restDay = profileState.studyProfile?.restDay ?? profileState.activeDiscipline.restDay ?? 0;
  const scheduledRecovery = isDayAfterScheduledRest(today, restDay);
  const discipline = challengeDisciplineSnapshot(
    profileState.activeDiscipline,
    settings,
    currentUser.id,
    today,
    scheduledRecovery,
  );

  const existing = await prisma.challenge.findFirst({
    where: { userId: user.id, dateKey: today },
    include: { submissions: true, grades: true },
    orderBy: { createdAt: "desc" },
  });
  if (isScheduledRestDay(today, restDay)) {
    const restChallenge = createRestDayChallenge(currentUser, today, discipline);
    if (existing?.submissions.length || existing?.grades.length) {
      return fromDbChallenge(existing);
    }
    const stored = existing
      ? await prisma.challenge.update({
          where: { id: existing.id },
          data: {
            title: restChallenge.title,
            difficulty: restChallenge.difficulty,
            topic: restChallenge.topic,
            scenario: restChallenge.scenario,
            objective: restChallenge.objective,
            constraints: restChallenge.constraints,
            allowedTools: restChallenge.allowedTools,
            expectedAnswerFormat: restChallenge.expectedAnswerFormat,
            submissionRequirements: restChallenge.submissionRequirements,
            deadlineAt: new Date(restChallenge.deadlineAt),
            solution: restChallenge.solution,
            antiGenericRequirement: restChallenge.antiGenericRequirement,
            status: "RestDay",
            isRecovery: false,
            isPressure: false,
            disciplineSnapshot: discipline,
          },
        })
      : await prisma.challenge.create({
          data: {
            id: restChallenge.id,
            userId: restChallenge.userId,
            dateKey: restChallenge.dateKey,
            title: restChallenge.title,
            difficulty: restChallenge.difficulty,
            topic: restChallenge.topic,
            scenario: restChallenge.scenario,
            objective: restChallenge.objective,
            constraints: restChallenge.constraints,
            allowedTools: restChallenge.allowedTools,
            expectedAnswerFormat: restChallenge.expectedAnswerFormat,
            submissionRequirements: restChallenge.submissionRequirements,
            deadlineAt: new Date(restChallenge.deadlineAt),
            solution: restChallenge.solution,
            antiGenericRequirement: restChallenge.antiGenericRequirement,
            status: "RestDay",
            isRecovery: false,
            isPressure: false,
            disciplineSnapshot: discipline,
            createdAt: new Date(restChallenge.createdAt),
          },
        });
    return fromDbChallenge(stored);
  }
  if (existing) {
    const existingDomain = fromDbChallenge(existing);
    const canRefreshForProfile =
      existing.submissions.length === 0 &&
      existing.grades.length === 0 &&
      disciplineProfileKey(existingDomain.disciplineSnapshot) !== disciplineProfileKey(discipline);

    if (canRefreshForProfile) {
      const recentGrades = await prisma.grade.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: "desc" },
        take: 3,
        select: { nextImprovementTarget: true },
      });
      const recentWeaknesses = recentGrades.map((grade) => grade.nextImprovementTarget);
      const refreshed = createDailyChallenge(currentUser, {
        dateKey: today,
        recovery: scheduledRecovery || existing.isRecovery || settings.recoveryMode,
        pressure: existing.isPressure,
        recentWeaknesses,
        settings,
        discipline,
      });
      const updated = await prisma.challenge.update({
        where: { id: existing.id },
        data: {
          title: refreshed.title,
          difficulty: refreshed.difficulty,
          topic: refreshed.topic,
          scenario: refreshed.scenario,
          objective: refreshed.objective,
          constraints: refreshed.constraints,
          allowedTools: refreshed.allowedTools,
          expectedAnswerFormat: refreshed.expectedAnswerFormat,
          submissionRequirements: refreshed.submissionRequirements,
          solution: refreshed.solution,
          antiGenericRequirement: refreshed.antiGenericRequirement,
          deadlineAt: new Date(refreshed.deadlineAt),
          status: toDbStatus(refreshed.status),
          isRecovery: refreshed.isRecovery,
          isPressure: refreshed.isPressure,
          disciplineSnapshot: discipline,
        },
      });
      await enqueueAiJob(
        "ChallengeGeneration",
        `challenge-profile:${user.id}:${today}:${disciplineProfileFingerprint(discipline)}`,
        {
          userId: user.id,
          challengeId: updated.id,
          dateKey: today,
          difficulty: difficultyForPis(currentUser.pisScore),
          track: discipline.id,
          topicFocus: discipline.generationContext?.topicFocus,
          durationMinutes: settings.durationMinutes,
          disciplineSnapshot: discipline,
          recentWeaknesses,
        },
      );
      return fromDbChallenge(updated);
    }

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
  const challenge = createDailyChallenge(currentUser, {
    dateKey: today,
    recovery:
      scheduledRecovery ||
      settings.recoveryMode ||
      needsRecovery(records.map(fromDbDisciplineRecord), currentUser),
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
    track: discipline.id,
    topicFocus: discipline.generationContext?.topicFocus,
    durationMinutes: settings.durationMinutes,
    disciplineSnapshot: discipline,
    recentWeaknesses: recentGrades.map((grade) => grade.nextImprovementTarget),
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
      continuityCredits: user.continuityCredits,
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
    orderBy: { dateKey: "desc" },
  });

  for (const challenge of candidates) {
    await prisma.$transaction(async (tx) => {
      const storedUser = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
      if (storedUser.continuityCredits > 0) {
        const balanceAfter = storedUser.continuityCredits - 1;
        await tx.challenge.update({
          where: { id: challenge.id },
          data: { status: "Protected" },
        });
        await tx.user.update({
          where: { id: user.id },
          data: { continuityCredits: balanceAfter },
        });
        await tx.ledgerEvent.create({
          data: {
            id: createId("cnt"),
            userId: user.id,
            type: "CONTINUITY",
            amount: -1,
            reason: `Protected absence: ${challenge.title}`,
            balanceAfter,
          },
        });
        return;
      }

      const weekKey = weekKeyFor(new Date(`${challenge.dateKey}T12:00:00.000Z`), timezone);
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
          pisGainCapMultiplier: record.missedCount >= 2 ? 0.5 : record.pisGainCapMultiplier,
          weekendRecoveryRequired:
            record.missedCount >= 3 ? true : record.weekendRecoveryRequired,
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
  if (["Excused", "Protected", "RestDay"].includes(challenge.status)) {
    throw new Response(
      challenge.status === "RestDay"
        ? "No submission is required on the selected weekly rest day."
        : challenge.status === "Protected"
        ? "This absence was already protected by a continuity credit. Continue with the current challenge."
        : "This challenge has been excused. Generate or wait for the next challenge instead.",
      { status: 409 },
    );
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
    if (
      accepted &&
      challenge.status !== "Submitted" &&
      challenge.status !== "Late" &&
      challenge.status !== "RestDay"
    ) {
      if (challenge.status === "Protected") {
        const storedUser = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
        if (storedUser.continuityCredits < 3) {
          const balanceAfter = storedUser.continuityCredits + 1;
          await tx.user.update({
            where: { id: user.id },
            data: { continuityCredits: { increment: 1 } },
          });
          await tx.ledgerEvent.create({
            data: {
              id: createId("cnt"),
              userId: user.id,
              type: "CONTINUITY",
              amount: 1,
              reason: `Continuity credit returned after accepted excuse: ${challenge.title}`,
              balanceAfter,
            },
          });
        }
      }
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

export async function getExaminerMessages(user: User, challengeId?: string) {
  if (challengeId) {
    const owned = await prisma.challenge.count({ where: { id: challengeId, userId: user.id } });
    if (!owned) throw new Response("Examiner session not found", { status: 404 });
  }
  const rows = await prisma.examinerMessage.findMany({
    where: {
      userId: user.id,
      ...(challengeId ? { challengeId } : {}),
    },
    orderBy: { createdAt: "asc" },
    take: 80,
  });
  return rows.map((message) => ({
    id: message.id,
    challengeId: message.challengeId,
    role: message.role,
    content: message.content,
    actions: message.actions,
    createdAt: message.createdAt.toISOString(),
  }));
}

export async function getExaminerSessions(user: User, activeChallengeId?: string) {
  const challenges = await prisma.challenge.findMany({
    where: {
      userId: user.id,
      OR: [
        { examinerMessages: { some: { userId: user.id } } },
        ...(activeChallengeId ? [{ id: activeChallengeId }] : []),
      ],
    },
    include: { _count: { select: { examinerMessages: true } } },
    orderBy: [{ dateKey: "desc" }, { createdAt: "desc" }],
    take: 30,
  });
  return challenges.map((challenge) => ({
    id: challenge.id,
    dateKey: challenge.dateKey,
    title: challenge.title,
    status: fromDbStatus(challenge.status),
    messageCount: challenge._count.examinerMessages,
    active: challenge.id === activeChallengeId,
  }));
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
  const recentMessages = await getExaminerMessages(currentUser, challenge.id);
  const appliedActions = await applyExaminerActions(currentUser, fromDbChallenge(challenge), input.message, settings);
  const updatedUser = fromDbUser(
    await prisma.user.findUniqueOrThrow({ where: { id: user.id } }),
  );
  const updatedChallenge = fromDbChallenge(
    await prisma.challenge.findUniqueOrThrow({ where: { id: challenge.id } }),
  );
  const reply = await generateExaminerChatReply({
    user: updatedUser,
    challenge: updatedChallenge,
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
        challengeId: challenge.id,
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
      challengeId: challenge.id,
      role: assistant.role,
      content: assistant.content,
      actions: assistant.actions,
      createdAt: assistant.createdAt.toISOString(),
    },
  };
}

type ExaminerAction = { type: string; summary: string };

async function reviewGradeDispute(
  user: User,
  challenge: Challenge,
  dispute: string,
): Promise<ExaminerAction> {
  const submission = await prisma.submission.findFirst({
    where: { userId: user.id, challengeId: challenge.id },
    include: { attachments: true, grade: true },
  });
  if (!submission?.grade) {
    return {
      type: "grade_review_unavailable",
      summary: "No completed grade exists for this challenge yet, so there is nothing to adjust.",
    };
  }

  const reviews = await prisma.gradeReview.findMany({
    where: { gradeId: submission.grade.id },
    orderBy: { createdAt: "desc" },
    take: 3,
  });
  if (reviews.some((review) => review.outcome === "Adjusted")) {
    return {
      type: "grade_review_already_adjusted",
      summary: "This grade has already received an examiner adjustment. The recorded adjustment remains authoritative; a further change requires an administrator audit.",
    };
  }
  if (reviews.length >= 2) {
    return {
      type: "grade_review_limit",
      summary: "Two examiner reviews have already been recorded for this grade. The grade is locked for automatic review and now requires an administrator audit.",
    };
  }

  const domainSubmission = submissionWithAttachments(submission);
  const existingGrade = fromDbGrade(submission.grade);
  const review = await generateGradeReview({
    challenge,
    submission: domainSubmission,
    grade: existingGrade,
    dispute,
  });
  const before = gradeReviewSnapshot(existingGrade);

  if (!review) {
    await prisma.gradeReview.create({
      data: {
        id: createId("grev"),
        gradeId: existingGrade.id,
        userId: user.id,
        dispute,
        outcome: "Unavailable",
        rationale: "The authoritative review model was unavailable. No score or account balance was changed.",
        before: before as Prisma.InputJsonValue,
      },
    });
    return {
      type: "grade_review_unavailable",
      summary: "I could not complete an authoritative review in this turn, so I made no grade change. I have recorded the failed review without claiming an escalation or delayed update.",
    };
  }

  const reviewed = recalculateGradeFromReview({
    existing: existingGrade,
    challenge,
    submission: domainSubmission,
    scores: review.correctedScores,
    technicalCap: review.correctedTechnicalCap,
  });
  reviewed.pisChange = Math.max(reviewed.pisChange, existingGrade.pisChange);
  reviewed.updatedPis = Number(
    Math.max(0, Math.min(100, existingGrade.previousPis + reviewed.pisChange)).toFixed(1),
  );
  reviewed.ertEarned = Math.max(reviewed.ertEarned, existingGrade.ertEarned);
  reviewed.ertBalance =
    existingGrade.ertBalance - existingGrade.ertEarned + reviewed.ertEarned;
  const shouldAdjust =
    review.decision === "Adjust" && reviewed.finalScore >= existingGrade.finalScore;

  if (!shouldAdjust) {
    await prisma.gradeReview.create({
      data: {
        id: createId("grev"),
        gradeId: existingGrade.id,
        userId: user.id,
        dispute,
        outcome: "Upheld",
        rationale: review.rationale,
        before: before as Prisma.InputJsonValue,
        after: before as Prisma.InputJsonValue,
      },
    });
    return {
      type: "grade_review_upheld",
      summary: `I reviewed the complete response against the challenge and rubric. The grade remains ${existingGrade.finalScore}/20. ${review.rationale}`,
    };
  }

  const correction = `${review.holisticAssessment}\n\n${review.correction}`;
  const after = {
    ...reviewed,
    correction,
    nextImprovementTarget: review.nextImprovementTarget,
  };
  const pisDifference = Number((reviewed.pisChange - existingGrade.pisChange).toFixed(1));
  const ertDifference = reviewed.ertEarned - existingGrade.ertEarned;

  await prisma.$transaction(async (tx) => {
    const currentUser = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    const nextPis = Number(
      Math.max(0, Math.min(100, currentUser.pisScore + pisDifference)).toFixed(1),
    );
    const nextErt = Math.max(0, currentUser.ertBalance + ertDifference);

    await tx.grade.update({
      where: { id: existingGrade.id },
      data: {
        creativity: reviewed.creativity,
        ingenuity: reviewed.ingenuity,
        reporting: reviewed.reporting,
        alienness: reviewed.alienness,
        neatness: reviewed.neatness,
        rawScore: reviewed.rawScore,
        balancePenalty: reviewed.balancePenalty,
        latePenalty: reviewed.latePenalty,
        technicalCap: reviewed.technicalCap,
        finalScore: reviewed.finalScore,
        verdict: reviewed.verdict,
        correction,
        nextImprovementTarget: review.nextImprovementTarget,
        pisChange: reviewed.pisChange,
        updatedPis: reviewed.updatedPis,
        ertEarned: reviewed.ertEarned,
        ertBalance: reviewed.ertBalance,
      },
    });
    await tx.user.update({
      where: { id: user.id },
      data: { pisScore: nextPis, ertBalance: nextErt },
    });
    if (pisDifference !== 0) {
      await tx.ledgerEvent.create({
        data: {
          id: createId("pis"),
          userId: user.id,
          type: "PIS",
          amount: pisDifference,
          reason: `Examiner grade review: ${challenge.title}`,
          balanceAfter: nextPis,
        },
      });
    }
    if (ertDifference !== 0) {
      await tx.ledgerEvent.create({
        data: {
          id: createId("ert"),
          userId: user.id,
          type: "ERT",
          amount: ertDifference,
          reason: `Examiner grade review: ${challenge.title}`,
          balanceAfter: nextErt,
        },
      });
    }
    await tx.gradeReview.create({
      data: {
        id: createId("grev"),
        gradeId: existingGrade.id,
        userId: user.id,
        dispute,
        outcome: "Adjusted",
        rationale: review.rationale,
        before: before as Prisma.InputJsonValue,
        after: after as Prisma.InputJsonValue,
      },
    });
  });

  return {
    type: "grade_adjusted",
    summary: `I reviewed the complete response and adjusted the grade immediately from ${existingGrade.finalScore}/20 to ${reviewed.finalScore}/20. PIS and ERT were reconciled in the ledger. ${review.rationale}`,
  };
}

function gradeReviewSnapshot(grade: Grade) {
  return {
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
    pisChange: grade.pisChange,
    ertEarned: grade.ertEarned,
  };
}

async function applyExaminerActions(
  user: User,
  challenge: ReturnType<typeof fromDbChallenge>,
  message: string,
  settings: Awaited<ReturnType<typeof getChallengeSettings>>,
) {
  const actions: ExaminerAction[] = [];
  const lower = message.toLowerCase();
  const nextSettings = { ...settings };
  let settingsChanged = false;
  const preferenceIntent =
    /\b(prefer|set|switch|change|make|future|next challenge|focus my|study|configure)\b/i.test(message);

  const track = preferenceIntent ? inferTrack(lower) : null;
  if (track) {
    nextSettings.track = track;
    settingsChanged = true;
    actions.push({ type: "settings.track", summary: `Future challenge track set to ${trackLabel(track)}.` });
    const profile = await safeFindStudyProfile(user.id);
    if (profile) {
      const template = getDiscipline(track);
      await prisma.userStudyProfile.update({
        where: { userId: user.id },
        data: {
          primaryDiscipline: track,
          rankedTopics: template.topics.slice(0, 4),
          preferredFormats: template.formats.slice(0, 3),
          evidenceTypes: template.evidenceTypes,
          weakAreas: template.topics.slice(0, 1),
          avoidAreas: [],
        },
      });
      actions.push({
        type: "profile.discipline",
        summary: `Study profile discipline updated to ${trackLabel(track)} with governed topics, formats, and evidence standards reset for that domain.`,
      });
    }
  }

  if (preferenceIntent && /\b(lab|hands-on|practical exercise|practical lab)\b/i.test(message)) {
    const profile = await safeFindStudyProfile(user.id);
    if (profile) {
      const template = getDiscipline(profile.primaryDiscipline);
      const labFormat = template.formats.find((format) => /\blab|hands-on\b/i.test(format));
      if (labFormat && !profile.preferredFormats.includes(labFormat)) {
        await prisma.userStudyProfile.update({
          where: { userId: user.id },
          data: {
            preferredFormats: [labFormat, ...profile.preferredFormats].slice(0, 6),
          },
        });
        actions.push({
          type: "profile.format",
          summary: `${labFormat} added to the study profile. Future challenges will prefer practical setup, task, evidence capture, and validation when suitable.`,
        });
      }
    }
  }

  const duration = lower.match(/\b(\d{2,3})\s*(min|minute|minutes)\b/);
  if (duration) {
    nextSettings.durationMinutes = Math.max(15, Math.min(180, Number(duration[1])));
    settingsChanged = true;
    actions.push({ type: "settings.duration", summary: `Future challenge duration set to ${nextSettings.durationMinutes} minutes.` });
  }

  const difficulty = inferDifficulty(message);
  if (difficulty && preferenceIntent) {
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

  const requestedRestDay = inferRestDay(lower);
  if (requestedRestDay !== null) {
    const profile = await safeFindStudyProfile(user.id);
    if (profile && profile.restDay !== requestedRestDay) {
      await prisma.userStudyProfile.update({
        where: { userId: user.id },
        data: { restDay: requestedRestDay },
      });
      actions.push({
        type: "profile.restDay",
        summary: `Weekly rest day changed to ${weekDayName(requestedRestDay)}. No assessment will be due that day, and the following day will contain two tasks.`,
      });
    }
  }

  if (settingsChanged) {
    await updateChallengeSettings(user, challengeSettingsSchema.parse(nextSettings));
  }

  if (isGradeDispute(message)) {
    actions.push(await reviewGradeDispute(user, challenge, message));
  }

  if (isChallengeReformulationRequest(message)) {
    try {
      await regenerateTodayChallengeOnce("examiner", user, message);
      actions.push({
        type: "challenge_reformulated",
        summary: "I replaced today's unsubmitted challenge immediately. This is the one permitted examiner reformulation for the day.",
      });
    } catch (error) {
      actions.push({
        type: "challenge_reformulation_rejected",
        summary:
          error instanceof Response
            ? await error.text()
            : "The challenge could not be reformulated under the active safeguards.",
      });
    }
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
  if (/\b(applied engineering|troubleshooting|fault isolation|root cause|maintenance)\b/.test(lower)) return "applied_engineering";
  if (/\b(documentation|runbook|postmortem|report|writing)\b/.test(lower)) return "technical_writing";
  if (/\b(network|networking|routing|switching|ospf|bgp|vlan|stp|firewall)\b/.test(lower)) return "networking";
  return null;
}

function inferRestDay(lower: string) {
  if (!/\b(rest day|break day|day off|weekly break|weekly rest)\b/.test(lower)) return null;
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const index = days.findIndex((day) => new RegExp(`\\b${day}\\b`).test(lower));
  return index >= 0 ? index : null;
}

function weekDayName(day: number) {
  return ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day] ?? "the selected day";
}

function isGradeDispute(message: string) {
  return /\b(graded? (?:me )?wrong|grading (?:is|was) wrong|misgraded|wrongly graded|review (?:my|the) grade|appeal (?:my|the) grade|fix (?:my|the) grade|adjust (?:my|the) grade|score (?:is|was|seems) (?:wrong|incorrect)|you (?:said|claimed|mentioned).*(?:did not|didn't|missing))\b/i.test(message);
}

function isChallengeReformulationRequest(message: string) {
  return /\b(?:regenerate|replace|reformulate|rewrite|rephrase)\b.*\b(?:challenge|question|brief|task)\b/i.test(message);
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
  const completionDateKey = dateKeyFor(
    submission.submittedAt,
    getUserTimezone(fromDbUser(storedUser).timezone),
  );
  const completionWeekDates = dateKeysForCurrentWeek(completionDateKey);
  const completionWeekKey = weekKeyFor(
    submission.submittedAt,
    getUserTimezone(fromDbUser(storedUser).timezone),
  );

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
    const weeklyCompletionCount = await tx.grade.count({
      where: {
        userId: user.id,
        challenge: {
          dateKey: {
            gte: completionWeekDates[0],
            lte: completionWeekDates[completionWeekDates.length - 1],
          },
        },
      },
    });
    const completionRecord = await tx.weeklyDisciplineRecord.upsert({
      where: { userId_weekKey: { userId: user.id, weekKey: completionWeekKey } },
      update: { completedCount: weeklyCompletionCount },
      create: {
        id: createId("wdr"),
        userId: user.id,
        weekKey: completionWeekKey,
        completedCount: weeklyCompletionCount,
      },
    });
    const continuityCreditEarned =
      completionRecord.completedCount >= 4 &&
      !completionRecord.continuityCreditEarned &&
      storedUser.continuityCredits < 3;
    const continuityBalance = storedUser.continuityCredits + (continuityCreditEarned ? 1 : 0);

    await tx.user.update({
      where: { id: user.id },
      data: {
        pisScore: grade.updatedPis,
        ertBalance: grade.ertBalance,
        currentStreak: { increment: 1 },
        ...(continuityCreditEarned ? { continuityCredits: { increment: 1 } } : {}),
      },
    });
    if (continuityCreditEarned) {
      await tx.weeklyDisciplineRecord.update({
        where: { id: completionRecord.id },
        data: { continuityCreditEarned: true },
      });
      await tx.ledgerEvent.create({
        data: {
          id: createId("cnt"),
          userId: user.id,
          type: "CONTINUITY",
          amount: 1,
          reason: `Four completed challenges in ${completionWeekKey}`,
          balanceAfter: continuityBalance,
        },
      });
    }
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

function createRestDayChallenge(
  user: User,
  dateKey: string,
  discipline: DisciplineSnapshot,
): Challenge {
  return {
    id: createId("chl"),
    userId: user.id,
    dateKey,
    title: "Scheduled weekly rest day",
    difficulty: difficultyForPis(user.pisScore),
    topic: "Recovery and consolidation",
    scenario:
      "No assessment is scheduled today. Step away from the daily task, recover attention, and let recent corrections settle. Your next assessment will contain two tasks: the normal profile-specific challenge and a shorter retrieval task based on a recent weak area.",
    objective: "Rest without losing continuity. No response or evidence is required today.",
    constraints: [
      "No submission is required.",
      "No PIS, ERT, streak, or continuity-credit penalty applies.",
      "The following assessment includes a short recovery task in addition to the main challenge.",
    ],
    allowedTools: [],
    expectedAnswerFormat: "No response required.",
    submissionRequirements: [],
    deadlineAt: localDeadlineIso(dateKey, getUserTimezone(user.timezone), 15),
    solution: "Scheduled rest day completed automatically.",
    antiGenericRequirement: "No response required.",
    status: "RestDay",
    isRecovery: false,
    isPressure: false,
    disciplineSnapshot: discipline,
    createdAt: new Date().toISOString(),
  };
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
  const discipline: DisciplineSnapshot = options.discipline ?? defaultDisciplineSnapshot();
  const challenge = createDisciplineFallbackChallenge(user, {
    ...options,
    discipline,
  });
  if (!options.settings && !options.discipline) return challenge;
  const preferredFormat =
    discipline.generationContext?.preferredFormat ??
    discipline.formats[0] ??
    "Practical assessment";
  const isLab = /\blab|hands-on|practical|exercise\b/i.test(preferredFormat);
  const focus =
    discipline.generationContext?.topicFocus ??
    validFocus(options.settings?.topicFocus, discipline.topics) ??
    discipline.topics[0];
  return {
    ...challenge,
    difficulty: higherDifficulty(challenge.difficulty, options.settings?.difficultyFloor ?? discipline.targetDifficulty),
    objective: focus ? `${challenge.objective} Focus the work on: ${focus}.` : challenge.objective,
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
    expectedAnswerFormat: [
      challenge.expectedAnswerFormat,
      "",
      `Profile response lens: ${preferredFormat}. Include ${discipline.responseSections.join(" -> ")} where relevant.`,
    ].join("\n"),
    submissionRequirements: [
      ...challenge.submissionRequirements,
      ...discipline.evidenceTypes
        .slice(0, 5)
        .map((evidence) => `Profile evidence expectation: ${evidence}.`),
    ].slice(0, 10),
  };
}

function createDisciplineFallbackChallenge(
  user: User,
  options: {
    dateKey: string;
    recovery: boolean;
    pressure: boolean;
    recentWeaknesses: string[];
    settings?: Awaited<ReturnType<typeof getChallengeSettings>>;
    discipline: DisciplineSnapshot;
  },
) {
  const base = templateFallbackChallenge(user, options.recovery, options.pressure, options.dateKey);
  const discipline = options.discipline;
  if (discipline.id === "networking") return base;

  const focus =
    discipline.generationContext?.topicFocus ??
    validFocus(options.settings?.topicFocus, discipline.topics) ??
    discipline.topics[0] ??
    discipline.label;
  const preferredFormat =
    discipline.generationContext?.preferredFormat ??
    discipline.formats[0] ??
    "Practical assessment";
  const packet = fallbackPacketForDiscipline(discipline.id, focus);
  const recoveryTopic =
    options.recentWeaknesses[0] ?? discipline.weakAreas?.[0] ?? focus;
  const sections = discipline.responseSections.length
    ? discipline.responseSections
    : ["Observation", "Evidence", "Plan", "Validation", "Risk"];

  return {
    ...base,
    title: `${discipline.label}: ${packet.title}`,
    topic: focus,
    scenario: [
      "Task 1 - Main assessment",
      "Scenario / Background",
      packet.background,
      "",
      "Evidence Provided",
      ...packet.evidence,
      "",
      "Optional Lab",
      packet.lab,
      "",
      ...(options.recovery
        ? [
            "Task 2 - Recovery retrieval",
            `In 3-5 lines, explain one important failure mode or misconception related to ${recoveryTopic}. State the evidence that would expose it and one validation step.`,
            "",
          ]
        : []),
      "Submission Deadline",
      "15:00 local time. Do not reveal the solution until after submission.",
    ].join("\n"),
    objective: packet.objective,
    constraints: [
      "Do not invent evidence that is not present in the brief.",
      "Do not recommend destructive changes without verification and rollback.",
      `Use the active discipline context: ${discipline.label}.`,
      `Preferred challenge format: ${preferredFormat}.`,
      `Target completion time: ${options.settings?.durationMinutes ?? Math.max(30, Math.min(120, discipline.weeklyTimeBudgetHours * 12))} minutes.`,
      ...(discipline.preferenceNotes ? [`User preference notes: ${discipline.preferenceNotes}.`] : []),
    ].slice(0, 8),
    allowedTools: packet.allowedTools,
    expectedAnswerFormat: [
      ...sections.map((section, index) => `${index + 1}. ${section}`),
      ...(options.recovery ? [`${sections.length + 1}. Recovery task`] : []),
    ].join("\n"),
    submissionRequirements: [
      "Core answer or root cause.",
      "Evidence tied to the provided artifacts.",
      "Exact checks, commands, code, or work product.",
      "Verification method.",
      "Risk, rollback, limitation, or escalation note.",
      ...(options.recovery ? ["Recovery retrieval task answer."] : []),
      ...discipline.evidenceTypes.slice(0, 4).map((item) => `Profile evidence expectation: ${item}.`),
    ].slice(0, 10),
    solution: `${packet.solution}${options.recovery ? ` Recovery task: explain a concrete ${recoveryTopic} failure mode, the evidence that distinguishes it, and a validation step.` : ""}`,
    antiGenericRequirement:
      `Your answer must use ${discipline.label} evidence from the brief and follow the expected sections: ${sections.join(", ")}.`,
  };
}

function validFocus(value: string | null | undefined, topics: string[]) {
  if (!value) return null;
  return topics.includes(value) ? value : null;
}

function fallbackPacketForDiscipline(disciplineId: string, focus: string) {
  const packets: Record<string, {
    title: string;
    background: string;
    evidence: string[];
    objective: string;
    allowedTools: string[];
    lab: string;
    solution: string;
  }> = {
    linux_systems: {
      title: `Service Degradation After ${focus} Change`,
      background:
        "A production Linux host started returning intermittent 502 responses after a maintenance change. The application process is running, but users report slow responses and occasional failures. You have SSH access, but you must avoid unnecessary restarts because the host is serving active traffic.",
      evidence: [
        "systemctl status app.service: active (running), recent warning: worker timeout after 30s",
        "journalctl -u app.service --since -30m: repeated 'permission denied opening /var/lib/app/cache/session.db'",
        "ls -ld /var/lib/app/cache: drwx------ root root",
        "ss -ltnp: app is listening on 127.0.0.1:8080",
      ],
      objective:
        "Determine the most likely cause, propose a safe verification sequence, and provide the least disruptive correction and rollback plan.",
      allowedTools: ["systemctl status", "journalctl", "ls -l", "stat", "ss", "grep", "sudoedit", "chown/chmod with scope"],
      lab: "Create a service user, a cache directory with wrong ownership, and observe application permission errors before applying the narrow ownership fix.",
      solution:
        "The likely issue is a permissions regression on the application cache directory. The app is running and listening, so this is not primarily a down service or network listener failure. The journal permission errors and root-owned mode 700 cache directory are the decisive evidence. Verify the service user, inspect directory ownership and recent changes, apply the narrow ownership or mode fix required by the app, then confirm logs clear and responses stabilize. Roll back by restoring the previous permission state if the change creates broader access risk.",
    },
    cybersecurity: {
      title: `${focus} Investigation With Conflicting Login Signals`,
      background:
        "A security alert reports multiple failed logins followed by one successful internal login to a privileged service account. The business says automation may have run overnight, but there is no approved change ticket.",
      evidence: [
        "auth.log: Failed password for invalid user admin from 185.22.14.8",
        "auth.log: Accepted publickey for svc_deploy from 10.30.4.18",
        "last: svc_deploy pts/2 10.30.4.18 01:43 - 01:46",
        "authorized_keys modified 5 minutes before the accepted login",
      ],
      objective:
        "Classify the incident, separate noisy failures from the material signal, and propose containment that preserves evidence.",
      allowedTools: ["journalctl", "grep", "last", "lastlog", "audit logs", "authorized_keys review", "identity owner check"],
      lab: "Replay SSH auth log excerpts and build a timeline separating failed noise, successful access, and key-change evidence.",
      solution:
        "The failed external attempts are suspicious but not the strongest signal. The accepted service-account login from an internal host shortly after authorized_keys modification requires investigation. Preserve logs and key material, identify the owner of 10.30.4.18, validate whether deployment automation was expected, rotate or disable the specific service credential only if unauthorized, and avoid destroying evidence or blocking broad networks without business impact review.",
    },
    software_engineering: {
      title: `${focus} Regression With Incomplete Reproduction`,
      background:
        "A recent deployment introduced sporadic API failures. The error rate is low but rising. Product wants an immediate rollback, while engineering suspects a narrow input-validation edge case.",
      evidence: [
        "Error sample: POST /api/orders returns 500 when discountCode is an empty string",
        "Recent diff: validation moved from controller to shared schema",
        "Test output: order creation passes without discountCode but fails with discountCode: ''",
        "Logs: TypeError: cannot read properties of undefined (reading 'amount')",
      ],
      objective:
        "Diagnose the likely bug path, propose a minimal patch strategy, and define tests that prove the fix without an overbroad refactor.",
      allowedTools: ["read diff", "unit tests", "integration test", "structured logs", "schema validation", "feature flag rollback"],
      lab: "Write a failing unit test for empty-string discount codes, patch validation normalization, and verify no regression for absent discountCode.",
      solution:
        "The likely issue is a validation/normalization regression that treats an empty string differently from an absent optional field. A strong answer reproduces the exact failing input, avoids a broad rollback unless blast radius grows, patches schema normalization or guard logic, and adds tests for absent, empty, valid, and invalid discount codes. Verification should include the failing endpoint path and relevant integration coverage.",
    },
    automation_scripting: {
      title: `${focus} Script Safety Review Before Production Run`,
      background:
        "A shell automation script is ready to clean old log files across several servers. The script worked on a test directory, but production contains symlinks, spaces in paths, and mixed ownership.",
      evidence: [
        "Script excerpt: for f in $(find /var/log/app -mtime +14); do rm -rf $f; done",
        "Test output ignored paths containing spaces",
        "find output includes /var/log/app/current -> /mnt/shared/current",
        "Requirement: dry-run must show exact files before deletion",
      ],
      objective:
        "Identify unsafe script behavior and propose a safer, idempotent version with dry-run and validation.",
      allowedTools: ["bash", "find -print0", "xargs -0", "shellcheck reasoning", "dry-run output", "set -euo pipefail"],
      lab: "Create files with spaces and symlinks, run the unsafe loop in dry-run form, then rewrite with null-delimited paths and explicit file-type constraints.",
      solution:
        "The unsafe loop performs word splitting, lacks quoting, follows a dangerous rm pattern, and does not enforce dry-run visibility. A safer answer uses find predicates to constrain type and path, null-delimited output, quoted variables, a dry-run mode, explicit confirmation, logging, and rollback/restore assumptions. It should avoid deleting symlink targets or unreviewed directories.",
    },
    cloud_devops: {
      title: `${focus} Deployment Risk Review After IAM Change`,
      background:
        "A deployment pipeline began failing after an IAM policy cleanup. The service still runs, but new deployments cannot publish artifacts and an engineer proposes adding wildcard permissions.",
      evidence: [
        "Pipeline log: AccessDenied on s3:PutObject to arn:aws:s3:::app-artifacts/prod/*",
        "Recent IAM diff removed s3:PutObject from the deploy role",
        "CloudTrail shows denied action from role ci-prod-deploy",
        "Existing runtime role is unaffected",
      ],
      objective:
        "Identify the minimum IAM correction, verification steps, and rollback without broadening access unnecessarily.",
      allowedTools: ["IAM policy diff", "CloudTrail", "pipeline logs", "least-privilege policy", "staged deployment", "rollback plan"],
      lab: "Model a deploy role denied from one artifact prefix and write the minimum policy statement needed for the pipeline.",
      solution:
        "The failure is a deploy-role artifact permission regression, not a runtime outage. The correct response is to restore the narrow s3:PutObject permission for the required artifact prefix, validate with a staged pipeline run, and avoid wildcard permissions. Rollback is to reapply the prior deploy policy or pause deployments while preserving runtime stability.",
    },
    data_ai: {
      title: `${focus} Evaluation Drift in a Model Report`,
      background:
        "A weekly model report shows improved accuracy, but support tickets increased. The team suspects the evaluation sample no longer represents production traffic.",
      evidence: [
        "Offline accuracy: 91% this week, 86% last week",
        "Support tickets tagged 'wrong recommendation' increased 38%",
        "Evaluation sample excludes records with missing region",
        "Production logs show missing region in 22% of recent requests",
      ],
      objective:
        "Assess whether the reported improvement is trustworthy and propose a validation plan that catches the production failure mode.",
      allowedTools: ["metric comparison", "sample audit", "confusion matrix", "slice analysis", "baseline check", "data-quality report"],
      lab: "Compare aggregate accuracy with a slice containing missing-region records and report the difference in model behavior.",
      solution:
        "The aggregate metric is not trustworthy because the evaluation sample excludes a production-heavy slice. A strong answer calls for slice analysis, data-quality checks, comparison to a baseline, and support-ticket correlation. It should avoid claiming causal improvement from aggregate accuracy alone and should recommend adding missing-region cases back into evaluation before deployment decisions.",
    },
    applied_engineering: {
      title: `${focus} Fault Isolation Under Service Pressure`,
      background:
        "A field system intermittently overheats after a maintenance window. Operators report no full outage, but performance drops under load. You cannot shut down the whole system during business hours.",
      evidence: [
        "Temperature rises only when load exceeds 70%",
        "Recent maintenance replaced one cooling fan assembly",
        "Sensor B reports 12C higher than adjacent sensors",
        "No alarms when the system is idle",
      ],
      objective:
        "Build a safe fault-isolation plan with stop conditions, verification, and prevention.",
      allowedTools: ["sensor trend review", "maintenance log", "controlled load test", "visual checklist by remote hands", "rollback/stop criteria"],
      lab: "Simulate a load-dependent fault and write a decision tree that separates sensor error, cooling failure, and workload anomaly.",
      solution:
        "The evidence suggests a load-dependent cooling or sensor-placement issue after maintenance. A strong plan isolates with trend review, controlled load below safe thresholds, remote visual inspection, comparison across sensors, and explicit stop conditions. It should not recommend full shutdown or unsafe load testing without rollback and operator coordination.",
    },
    technical_writing: {
      title: `${focus} Runbook Fails During Incident Handoff`,
      background:
        "During an incident, a junior engineer followed a runbook but escalated late because the document lacked prerequisites, verification criteria, and stop conditions.",
      evidence: [
        "Runbook step: 'Restart the service if errors continue'",
        "Missing: how to identify the service owner",
        "Missing: expected healthy output after restart",
        "Incident note: restart was attempted twice before escalation",
      ],
      objective:
        "Rewrite the runbook structure so it is safer, auditable, and usable by a less experienced responder.",
      allowedTools: ["runbook outline", "prerequisite list", "verification criteria", "escalation matrix", "risk warning", "post-incident review"],
      lab: "Transform the vague restart step into a runbook section with prerequisites, exact command placeholders, validation, stop criteria, and escalation.",
      solution:
        "The runbook failed because it gave an action without prerequisites, owner context, verification, or stop conditions. A strong answer rewrites it with audience, scope, prerequisites, exact observable checks, a single controlled restart condition, expected healthy output, rollback/escalation path, and incident-note requirements.",
    },
  };

  return packets[disciplineId] ?? packets.applied_engineering;
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
    restDay: profile.restDay,
    preferenceNotes: profile.preferenceNotes,
    secondaryInterests: profile.secondaryInterests,
    currentLevel: profile.currentLevel,
    weakAreas: profile.weakAreas,
    avoidAreas: profile.avoidAreas,
    goals: profile.goals,
    customDiscipline: profile.customDiscipline,
  });
}

function challengeDisciplineSnapshot(
  discipline: DisciplineSnapshot,
  settings: Awaited<ReturnType<typeof getChallengeSettings>>,
  userId: string,
  dateKey: string,
  scheduledRecovery = false,
): DisciplineSnapshot {
  const topicFocus = profileFocusForChallenge(
    userId,
    dateKey,
    discipline,
    settings.topicFocus,
  );
  const preferredFormat = profileFormatForChallenge(userId, dateKey, discipline);
  return {
    ...discipline,
    generationContext: {
      durationMinutes: settings.durationMinutes,
      difficultyFloor: settings.difficultyFloor as Difficulty,
      recoveryMode: settings.recoveryMode,
      teamMode: settings.teamMode,
      scheduledRecovery,
      ...(topicFocus ? { topicFocus } : {}),
      ...(preferredFormat ? { preferredFormat } : {}),
    },
  };
}

function profileFocusForChallenge(
  userId: string,
  dateKey: string,
  discipline: DisciplineSnapshot,
  requested?: string | null,
) {
  const explicit = validFocus(requested, discipline.topics);
  if (explicit) return explicit;

  const avoid = new Set(discipline.avoidAreas ?? []);
  const topics = discipline.topics.filter((topic) => !avoid.has(topic));
  const weakAreas = (discipline.weakAreas ?? []).filter((topic) => !avoid.has(topic));
  const seed = `${userId}:${dateKey}:${discipline.id}`
    .split("")
    .reduce((total, character) => Math.imul(total ^ character.charCodeAt(0), 16777619), 2166136261);
  const pool = weakAreas.length > 0 && Math.abs(seed % 3) !== 0 ? weakAreas : topics;
  if (pool.length === 0) return undefined;
  return pool[Math.abs(seed) % pool.length];
}

function profileFormatForChallenge(
  userId: string,
  dateKey: string,
  discipline: DisciplineSnapshot,
) {
  if (discipline.formats.length === 0) return undefined;
  const seed = `${dateKey}:${discipline.id}:${userId}:format`
    .split("")
    .reduce((total, character) => Math.imul(total ^ character.charCodeAt(0), 16777619), 2166136261);
  return discipline.formats[Math.abs(seed) % discipline.formats.length];
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
  const restDay = profileState.studyProfile?.restDay ?? profileState.activeDiscipline.restDay ?? 0;
  const scheduledRecovery = isDayAfterScheduledRest(today, restDay);
  const discipline = challengeDisciplineSnapshot(
    profileState.activeDiscipline,
    settings,
    user.id,
    today,
    scheduledRecovery,
  );
  const recentWeaknesses = recentGrades.map((grade) => grade.nextImprovementTarget);
  const next = createDailyChallenge(user, {
    dateKey: today,
    recovery:
      scheduledRecovery ||
      settings.recoveryMode ||
      needsRecovery(records.map(fromDbDisciplineRecord), user),
    pressure: false,
    recentWeaknesses,
    settings,
    discipline,
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
          disciplineSnapshot: discipline,
          createdAt: new Date(),
        },
      });
    });

    await enqueueAiJob("ChallengeGeneration", `challenge-regenerate:${user.id}:${today}`, {
      userId: user.id,
      challengeId: updated.id,
      dateKey: today,
      difficulty: difficultyForPis(user.pisScore),
      track: discipline.id,
      topicFocus: discipline.generationContext?.topicFocus,
      durationMinutes: settings.durationMinutes,
      disciplineSnapshot: discipline,
      recentWeaknesses,
    });

    return {
      action: "RegenerateTodayChallenge",
      remainingToday: 0,
      challenge: fromDbChallenge(updated),
    };
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Response(
        "Today challenge has already been regenerated once by a support action. Recovery status does not count as regeneration.",
        { status: 409 },
      );
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
