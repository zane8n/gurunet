import type {
  Challenge as DbChallenge,
  Grade as DbGrade,
  LedgerEvent as DbLedgerEvent,
  LocalSession as DbLocalSession,
  MarketplaceChallenge as DbMarketplaceChallenge,
  NotebookEntry as DbNotebookEntry,
  Redemption as DbRedemption,
  Submission as DbSubmission,
  SubmissionAttachment as DbSubmissionAttachment,
  User as DbUser,
  UserStudyProfile as DbUserStudyProfile,
  WeeklyDisciplineRecord as DbDisciplineRecord,
} from "@prisma/client";
import type {
  Challenge,
  ChallengeStatus,
  DisciplineRecord,
  DisciplineSnapshot,
  Grade,
  LedgerEvent,
  MarketplaceChallenge,
  NotebookEntry,
  Redemption,
  Session,
  StudyProfile,
  Submission,
  User,
} from "@/lib/domain";
import type { SubmissionAttachment } from "@/lib/submission-content";

export function fromDbUser(user: DbUser): User {
  return {
    id: user.id,
    name: user.name ?? "",
    email: user.email ?? "",
    passwordHash: user.passwordHash ?? "",
    timezone: user.timezone,
    pisScore: user.pisScore,
    ertBalance: user.ertBalance,
    currentStreak: user.currentStreak,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  };
}

export function fromDbSession(session: DbLocalSession): Session {
  return {
    id: session.id,
    userId: session.userId,
    expiresAt: session.expiresAt.toISOString(),
    createdAt: session.createdAt.toISOString(),
  };
}

export function fromDbChallenge(challenge: DbChallenge): Challenge {
  return {
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
    deadlineAt: challenge.deadlineAt.toISOString(),
    solution: challenge.solution,
    antiGenericRequirement: challenge.antiGenericRequirement,
    status: fromDbStatus(challenge.status),
    isRecovery: challenge.isRecovery,
    isPressure: challenge.isPressure,
    disciplineSnapshot: parseDisciplineSnapshot(challenge.disciplineSnapshot),
    createdAt: challenge.createdAt.toISOString(),
  };
}

export function fromDbSubmission(submission: DbSubmission): Submission {
  return {
    id: submission.id,
    challengeId: submission.challengeId,
    userId: submission.userId,
    content: submission.content,
    submittedAt: submission.submittedAt.toISOString(),
    isLate: submission.isLate,
    requiresVerification: submission.requiresVerification,
    verificationQuestion: submission.verificationQuestion ?? undefined,
    verificationAnswer: submission.verificationAnswer ?? undefined,
    createdAt: submission.createdAt.toISOString(),
  };
}

export function fromDbGrade(grade: DbGrade): Grade {
  return {
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
    verdict: grade.verdict as Grade["verdict"],
    correction: grade.correction,
    contentionNotes: grade.contentionNotes,
    nextImprovementTarget: grade.nextImprovementTarget,
    rubricSnapshot: parseRubricSnapshot(grade.rubricSnapshot),
    pisChange: grade.pisChange,
    previousPis: grade.previousPis,
    updatedPis: grade.updatedPis,
    ertEarned: grade.ertEarned,
    ertBalance: grade.ertBalance,
    createdAt: grade.createdAt.toISOString(),
  };
}

export function fromDbStudyProfile(profile: DbUserStudyProfile): StudyProfile {
  return {
    userId: profile.userId,
    primaryDiscipline: profile.primaryDiscipline,
    secondaryInterests: profile.secondaryInterests,
    rankedTopics: profile.rankedTopics,
    currentLevel: profile.currentLevel,
    preferredFormats: profile.preferredFormats,
    evidenceTypes: profile.evidenceTypes,
    weeklyTimeBudgetHours: profile.weeklyTimeBudgetHours,
    targetDifficulty: profile.targetDifficulty,
    weakAreas: profile.weakAreas,
    avoidAreas: profile.avoidAreas,
    goals: profile.goals,
    customDiscipline: profile.customDiscipline ?? undefined,
    customStatus: profile.customStatus ?? undefined,
    preferenceNotes: profile.preferenceNotes ?? undefined,
    completedAt: profile.completedAt?.toISOString(),
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString(),
  };
}

function parseDisciplineSnapshot(value: unknown): DisciplineSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  return value as DisciplineSnapshot;
}

function parseRubricSnapshot(value: unknown): Grade["rubricSnapshot"] {
  if (!value || typeof value !== "object") return undefined;
  return value as Grade["rubricSnapshot"];
}

export function fromDbLedgerEvent(event: DbLedgerEvent): LedgerEvent {
  return {
    id: event.id,
    userId: event.userId,
    type: event.type,
    amount: event.amount,
    reason: event.reason,
    balanceAfter: event.balanceAfter,
    createdAt: event.createdAt.toISOString(),
  };
}

export function fromDbRedemption(redemption: DbRedemption): Redemption {
  return {
    id: redemption.id,
    userId: redemption.userId,
    rewardName: redemption.rewardName,
    cost: redemption.cost,
    date: redemption.date,
    note: redemption.note ?? undefined,
    balanceAfter: redemption.balanceAfter,
    createdAt: redemption.createdAt.toISOString(),
  };
}

export function fromDbNotebookEntry(entry: DbNotebookEntry): NotebookEntry {
  return {
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
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

export function fromDbDisciplineRecord(record: DbDisciplineRecord): DisciplineRecord {
  return {
    userId: record.userId,
    weekKey: record.weekKey,
    missedCount: record.missedCount,
    pisGainCapMultiplier: record.pisGainCapMultiplier,
    weekendRecoveryRequired: record.weekendRecoveryRequired,
  };
}

export function fromDbMarketplaceChallenge(
  challenge: DbMarketplaceChallenge,
): MarketplaceChallenge {
  return {
    id: challenge.id,
    title: challenge.title,
    topic: challenge.topic,
    difficulty: challenge.difficulty,
    summary: challenge.summary,
    estimatedMinutes: challenge.estimatedMinutes,
    enrollmentCount: challenge.enrollmentCount,
    createdAt: challenge.createdAt.toISOString(),
  };
}

export function fromDbAttachment(attachment: DbSubmissionAttachment): SubmissionAttachment {
  return {
    id: attachment.id,
    name: attachment.filename,
    type: attachment.mimeType,
    size: attachment.byteSize,
    kind: attachment.kind,
  };
}

export function toDbStatus(status: ChallengeStatus) {
  if (status === "Recovery Challenge") return "RecoveryChallenge";
  if (status === "Pressure Challenge") return "PressureChallenge";
  return status;
}

export function fromDbStatus(status: string): ChallengeStatus {
  if (status === "RecoveryChallenge") return "Recovery Challenge";
  if (status === "PressureChallenge") return "Pressure Challenge";
  return status as ChallengeStatus;
}
