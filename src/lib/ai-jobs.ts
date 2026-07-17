import type { Prisma } from "@prisma/client";
import type { DisciplineSnapshot } from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/store";
import { nowIso } from "@/lib/time";
import {
  generateAiChallenge,
  generateAiCritique,
  generateStandaloneNotebookSummary,
  generateVerificationQuestion,
} from "@/lib/openai-service";
import { buildChallengeFromAi, difficultyForPis } from "@/lib/challenges";
import {
  fromDbChallenge,
  fromDbGrade,
  fromDbSubmission,
  fromDbUser,
} from "@/lib/db-mappers";
import { buildSubmissionContent } from "@/lib/submission-content";
import { disciplineProfileKey } from "@/lib/disciplines";
import { blueprintFromSnapshot, type ChallengeHistorySignal } from "@/lib/challenge-blueprints";
import { challengeContentFingerprint } from "@/lib/challenge-fingerprint";

type AiJobType =
  | "ChallengeGeneration"
  | "VerificationQuestion"
  | "StrictCritique"
  | "NotebookSummary";

export type ChallengeGenerationStatus =
  | "Queued"
  | "Running"
  | "Succeeded"
  | "Failed"
  | "FallbackUsed";

export async function enqueueAiJob(
  type: AiJobType,
  dedupeKey: string,
  payload: Prisma.InputJsonValue,
) {
  return prisma.aiJob.upsert({
    where: { dedupeKey },
    update: {},
    create: {
      id: createId("job"),
      type,
      dedupeKey,
      payload,
      status: "Queued",
    },
  });
}

export async function markAiJobFallback(dedupeKey: string, payload: Prisma.InputJsonValue) {
  return prisma.aiJob.upsert({
    where: { dedupeKey },
    update: {
      status: "FallbackUsed",
      result: payload,
      completedAt: new Date(nowIso()),
    },
    create: {
      id: createId("job"),
      type: "ChallengeGeneration",
      dedupeKey,
      payload,
      result: payload,
      status: "FallbackUsed",
      completedAt: new Date(nowIso()),
    },
  });
}

export async function runDueAiJobs(limit = 3) {
  const jobs = await prisma.aiJob.findMany({
    where: { status: "Queued", runAfter: { lte: new Date() } },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  const results = [];

  for (const job of jobs) {
    const result = await runAiJobNow(job.id);
    if (result) results.push(result);
  }

  return results;
}

export async function getChallengeGenerationStatus(challengeId: string) {
  const job = await prisma.aiJob.findFirst({
    where: {
      type: "ChallengeGeneration",
      payload: { path: ["challengeId"], equals: challengeId },
    },
    orderBy: { createdAt: "desc" },
    select: { status: true },
  });
  return (job?.status ?? null) as ChallengeGenerationStatus | null;
}

export async function runQueuedChallengeGeneration(challengeId: string) {
  const job = await prisma.aiJob.findFirst({
    where: {
      type: "ChallengeGeneration",
      status: "Queued",
      payload: { path: ["challengeId"], equals: challengeId },
    },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return job ? runAiJobNow(job.id) : null;
}

export async function runAiJobNow(jobId: string) {
  const claimed = await prisma.aiJob.updateMany({
    where: { id: jobId, status: "Queued" },
    data: { status: "Running", startedAt: new Date(), attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return null;

  const job = await prisma.aiJob.findUniqueOrThrow({ where: { id: jobId } });
  try {
    const result = await runJob(job.type, job.payload as Record<string, unknown>);
    const status = result.fallback ? "FallbackUsed" : "Succeeded";
    await prisma.aiJob.update({
      where: { id: job.id },
      data: {
        status,
        result: result.output as Prisma.InputJsonValue,
        completedAt: new Date(),
        error: null,
      },
    });
    return { id: job.id, status };
  } catch (error) {
    await prisma.aiJob.update({
      where: { id: job.id },
      data: {
        status: "Failed",
        error: error instanceof Error ? error.message : "AI job failed",
        completedAt: new Date(),
      },
    });
    return { id: job.id, status: "Failed" };
  }
}

async function runJob(type: AiJobType, payload: Record<string, unknown>) {
  if (type === "VerificationQuestion") return runVerificationJob(payload);
  if (type === "StrictCritique") return runStrictCritiqueJob(payload);
  if (type === "ChallengeGeneration") return runChallengeGenerationJob(payload);
  if (type === "NotebookSummary") return runNotebookSummaryJob(payload);
  return { fallback: true, output: { skipped: true } };
}

async function runVerificationJob(payload: Record<string, unknown>) {
  const submissionId = String(payload.submissionId);
  const submission = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    include: { attachments: true, challenge: true },
  });
  const content = contentWithAttachments(submission);
  const question = await generateVerificationQuestion(fromDbChallenge(submission.challenge), content);
  await prisma.submission.update({
    where: { id: submission.id },
    data: { verificationQuestion: question },
  });
  return { fallback: false, output: { question } };
}

async function runStrictCritiqueJob(payload: Record<string, unknown>) {
  const submissionId = String(payload.submissionId);
  const submission = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    include: { attachments: true, challenge: true, grade: true },
  });
  if (!submission.grade) return { fallback: true, output: { skipped: "missing grade" } };
  const adjustedReview = await prisma.gradeReview.findFirst({
    where: { gradeId: submission.grade.id, outcome: "Adjusted" },
  });
  if (adjustedReview) {
    return { fallback: false, output: { skipped: "grade already adjusted by examiner review" } };
  }
  const domainSubmission = {
    ...fromDbSubmission(submission),
    content: contentWithAttachments(submission),
  };
  const critique = await generateAiCritique(
    fromDbChallenge(submission.challenge),
    domainSubmission,
    fromDbGrade(submission.grade),
  );
  if (!critique) return { fallback: true, output: { skipped: "no critique" } };

  await prisma.$transaction(async (tx) => {
    await tx.grade.update({
      where: { id: submission.grade!.id },
      data: {
        correction: critique.correction,
        contentionNotes: critique.contentionNotes,
        nextImprovementTarget: critique.nextImprovementTarget,
      },
    });
    const notebook = await tx.notebookEntry.findFirst({
      where: { challengeId: submission.challengeId, userId: submission.userId },
      orderBy: { createdAt: "desc" },
    });
    if (notebook) {
      await tx.notebookEntry.update({
        where: { id: notebook.id },
        data: {
          summary: critique.notebookSummary,
          mistakes: critique.notebookMistakes,
          lessons: critique.notebookLessons,
        },
      });
    }
  });

  return { fallback: false, output: critique };
}

async function runChallengeGenerationJob(payload: Record<string, unknown>) {
  const challengeId = String(payload.challengeId);
  const challenge = await prisma.challenge.findUniqueOrThrow({
    where: { id: challengeId },
    include: { user: true, submissions: true },
  });
  if (challenge.submissions.length > 0) {
    return { fallback: true, output: { skipped: "challenge already submitted" } };
  }
  const requestedSnapshot =
    payload.disciplineSnapshot && typeof payload.disciplineSnapshot === "object"
      ? (payload.disciplineSnapshot as DisciplineSnapshot)
      : undefined;
  const currentSnapshot = fromDbChallenge(challenge).disciplineSnapshot;
  if (
    requestedSnapshot &&
    currentSnapshot &&
    disciplineProfileKey(requestedSnapshot) !== disciplineProfileKey(currentSnapshot)
  ) {
    return { fallback: false, output: { skipped: "stale personalization context" } };
  }
  const user = fromDbUser(challenge.user);
  const [recentChallenges, sameDayChallenges] = await Promise.all([
    prisma.challenge.findMany({
      where: { userId: challenge.userId, id: { not: challenge.id } },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { dateKey: true, title: true, topic: true, scenario: true, status: true, disciplineSnapshot: true },
    }),
    prisma.challenge.findMany({
      where: {
        dateKey: challenge.dateKey,
        userId: { not: challenge.userId },
      },
      orderBy: { createdAt: "desc" },
      take: 60,
      select: { dateKey: true, title: true, topic: true, scenario: true, status: true, disciplineSnapshot: true },
    }),
  ]);
  const ai = await generateAiChallenge({
    user,
    difficulty: difficultyForPis(user.pisScore),
    dateKey: challenge.dateKey,
    recovery: challenge.isRecovery,
    pressure: challenge.isPressure,
    recentWeaknesses: Array.isArray(payload.recentWeaknesses)
      ? payload.recentWeaknesses.filter((item): item is string => typeof item === "string").slice(0, 5)
      : [],
    track: typeof payload.track === "string" ? payload.track : challenge.topic,
    topicFocus: typeof payload.topicFocus === "string" ? payload.topicFocus : undefined,
    durationMinutes: typeof payload.durationMinutes === "number" ? payload.durationMinutes : undefined,
    disciplineSnapshot: requestedSnapshot ?? currentSnapshot,
    recoveryContext: fromDbChallenge(challenge).recoveryContext,
    recentChallenges: recentChallenges.map(generationHistorySignal),
    sameDayChallenges: sameDayChallenges.map(generationHistorySignal),
  });
  if (!ai) return { fallback: true, output: { skipped: "no generated challenge" } };

  const updated = buildChallengeFromAi({
    user,
    dateKey: challenge.dateKey,
    deadlineAt: challenge.deadlineAt.toISOString(),
    recovery: challenge.isRecovery,
    pressure: challenge.isPressure,
    ai,
    recoveryContext: fromDbChallenge(challenge).recoveryContext,
  });
  await prisma.challenge.update({
    where: { id: challenge.id },
    data: {
      title: updated.title,
      difficulty: updated.difficulty,
      topic: updated.topic,
      scenario: updated.scenario,
      objective: updated.objective,
      constraints: updated.constraints,
      allowedTools: updated.allowedTools,
      expectedAnswerFormat: updated.expectedAnswerFormat,
      submissionRequirements: updated.submissionRequirements,
      solution: updated.solution,
      antiGenericRequirement: updated.antiGenericRequirement,
      contentFingerprint: challengeContentFingerprint(updated),
    },
  });
  return { fallback: false, output: { challengeId: challenge.id } };
}

function generationHistorySignal(challenge: {
  dateKey: string;
  title: string;
  topic: string;
  scenario: string;
  status: string;
  disciplineSnapshot: unknown;
}): ChallengeHistorySignal {
  const snapshot = challenge.disciplineSnapshot && typeof challenge.disciplineSnapshot === "object"
    ? challenge.disciplineSnapshot as { id?: unknown }
    : undefined;
  return {
    dateKey: challenge.dateKey,
    title: challenge.title,
    topic: challenge.topic,
    scenario: challenge.scenario,
    disciplineId: typeof snapshot?.id === "string" ? snapshot.id : undefined,
    blueprint: challenge.status === "RestDay"
      ? undefined
      : blueprintFromSnapshot(challenge.disciplineSnapshot),
  };
}

async function runNotebookSummaryJob(payload: Record<string, unknown>) {
  const submissionId = String(payload.submissionId);
  const submission = await prisma.submission.findUniqueOrThrow({
    where: { id: submissionId },
    include: { attachments: true, challenge: true, grade: true },
  });
  if (!submission.grade) return { fallback: true, output: { skipped: "missing grade" } };
  const notebook = await generateStandaloneNotebookSummary(
    fromDbChallenge(submission.challenge),
    {
      ...fromDbSubmission(submission),
      content: contentWithAttachments(submission),
    },
    fromDbGrade(submission.grade),
  );
  if (!notebook) return { fallback: true, output: { skipped: "no notebook summary" } };

  const existing = await prisma.notebookEntry.findFirst({
    where: { challengeId: submission.challengeId, userId: submission.userId },
    orderBy: { createdAt: "desc" },
  });
  if (!existing) return { fallback: true, output: { skipped: "missing notebook" } };

  await prisma.notebookEntry.update({
    where: { id: existing.id },
    data: {
      summary: notebook.notebookSummary,
      mistakes: notebook.notebookMistakes,
      lessons: notebook.notebookLessons,
    },
  });
  return { fallback: false, output: notebook };
}

function contentWithAttachments(submission: {
  content: string;
  attachments?: { id: string; filename: string; mimeType: string; byteSize: number; kind: "image" | "file" }[];
}) {
  return buildSubmissionContent({
    body: submission.content,
    attachments:
      submission.attachments?.map((attachment) => ({
        id: attachment.id,
        name: attachment.filename,
        type: attachment.mimeType,
        size: attachment.byteSize,
        kind: attachment.kind,
      })) ?? [],
  });
}
