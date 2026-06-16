import type { Prisma } from "@prisma/client";
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

type AiJobType =
  | "ChallengeGeneration"
  | "VerificationQuestion"
  | "StrictCritique"
  | "NotebookSummary";

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
    await prisma.aiJob.update({
      where: { id: job.id },
      data: { status: "Running", startedAt: new Date(), attempts: { increment: 1 } },
    });
    try {
      const result = await runJob(job.type, job.payload as Record<string, unknown>);
      await prisma.aiJob.update({
        where: { id: job.id },
        data: {
          status: result.fallback ? "FallbackUsed" : "Succeeded",
          result: result.output as Prisma.InputJsonValue,
          completedAt: new Date(),
          error: null,
        },
      });
      results.push({ id: job.id, status: result.fallback ? "FallbackUsed" : "Succeeded" });
    } catch (error) {
      await prisma.aiJob.update({
        where: { id: job.id },
        data: {
          status: "Failed",
          error: error instanceof Error ? error.message : "AI job failed",
          completedAt: new Date(),
        },
      });
      results.push({ id: job.id, status: "Failed" });
    }
  }

  return results;
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
  const user = fromDbUser(challenge.user);
  const ai = await generateAiChallenge({
    user,
    difficulty: difficultyForPis(user.pisScore),
    dateKey: challenge.dateKey,
    recovery: challenge.isRecovery,
    pressure: challenge.isPressure,
    recentWeaknesses: [],
    track: typeof payload.track === "string" ? payload.track : challenge.topic,
    topicFocus: typeof payload.topicFocus === "string" ? payload.topicFocus : undefined,
    durationMinutes: typeof payload.durationMinutes === "number" ? payload.durationMinutes : undefined,
  });
  if (!ai) return { fallback: true, output: { skipped: "no generated challenge" } };

  const updated = buildChallengeFromAi({
    user,
    dateKey: challenge.dateKey,
    deadlineAt: challenge.deadlineAt.toISOString(),
    recovery: challenge.isRecovery,
    pressure: challenge.isPressure,
    ai,
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
    },
  });
  return { fallback: false, output: { challengeId: challenge.id } };
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
