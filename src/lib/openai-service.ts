import OpenAI from "openai";
import { z } from "zod";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import type { Challenge, Difficulty, DisciplineSnapshot, Grade, Submission, User } from "@/lib/domain";
import { generateChallenge } from "@/lib/challenges";
import { requireRuntimeEnv, getRuntimeEnv } from "@/lib/runtime-env";
import { summarizeSubmissionForAi } from "@/lib/submission-content";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/store";

const challengeSchema = z.object({
  title: z.string().min(8).max(120),
  difficulty: z.enum(["Guided", "Normal", "Advanced", "Production", "Expert"]),
  topic: z.string().min(3).max(80),
  scenario: z.string().min(120).max(1800),
  objective: z.string().min(40).max(500),
  constraints: z.array(z.string().min(8).max(220)).min(4).max(8),
  allowedTools: z.array(z.string().min(2).max(100)).min(4).max(10),
  expectedAnswerFormat: z.string().min(30).max(500),
  submissionRequirements: z.array(z.string().min(4).max(180)).min(4).max(8),
  solution: z.string().min(80).max(1600),
  antiGenericRequirement: z.string().min(30).max(300),
});

const critiqueSchema = z.object({
  correction: z.string().min(80).max(1400),
  contentionNotes: z.array(z.string().min(8).max(180)).max(5),
  nextImprovementTarget: z.string().min(20).max(240),
});

const notebookSummarySchema = z.object({
  notebookSummary: z.string().min(40).max(500),
  notebookMistakes: z.array(z.string().min(8).max(200)).max(6),
  notebookLessons: z.array(z.string().min(8).max(200)).min(1).max(6),
});

const verificationSchema = z.object({
  question: z.string().min(20).max(260),
});

const disciplineNoticeSchema = z.object({
  reply: z.string().min(40).max(500),
});

const examinerChatSchema = z.object({
  reply: z.string().min(20).max(900),
});

type AiTask =
  | "challenge_generation"
  | "verification_question"
  | "strict_critique"
  | "notebook_summary"
  | "discipline_notice"
  | "examiner_chat";

type ChallengeContext = {
  user: User;
  difficulty: Difficulty;
  dateKey: string;
  recovery: boolean;
  pressure: boolean;
  recentWeaknesses: string[];
  track?: string;
  topicFocus?: string;
  durationMinutes?: number;
  disciplineSnapshot?: DisciplineSnapshot;
};

let client: OpenAI | null = null;
let aiTemporarilyDisabled = false;

const lecturerPolicy = [
  "You are the adaptive GURUnet lecturer: a strict professor and senior network engineer.",
  "Train practical network engineering, cybersecurity, Linux, scripting, troubleshooting, documentation, and automation skill.",
  "Do not be flowery, falsely optimistic, or motivational without evidence.",
  "Require operational reasoning, assumptions, trade-offs, command-level evidence, verification, risk, rollback, and scenario-specific judgment.",
  "Avoid generic textbook tasks and generic grading.",
  "Do not accuse the user of AI use from writing style alone. Test defensibility with verification when needed.",
  "Respect discipline rules: deadline is 12:00 local time; late work is acknowledged but penalized by app rules; valid excuses include real work, travel, sickness, emergency, or unavoidable duty.",
  "Excused misses earn no ERT and do not reduce PIS. Missed unexcused work reduces discipline and requires recovery.",
  "Never reveal hidden challenge solutions before submission and grading.",
  "Return only final structured JSON. Never include or store hidden reasoning.",
].join(" ");

function aiClient() {
  client ??= new OpenAI({
    apiKey: requireRuntimeEnv("DEEPSEEK_API_KEY"),
    baseURL: getRuntimeEnv("DEEPSEEK_BASE_URL") || "https://api.deepseek.com",
  });
  return client;
}

function fastModel() {
  return getRuntimeEnv("DEEPSEEK_FAST_MODEL") || "deepseek-v4-flash";
}

function reasoningModel() {
  return getRuntimeEnv("DEEPSEEK_REASONING_MODEL") || "deepseek-v4-pro";
}

function aiEnabled() {
  return (
    !aiTemporarilyDisabled &&
    !fallbackOnlyMode() &&
    getRuntimeEnv("DEEPSEEK_API_KEY") &&
    getRuntimeEnv("DEEPSEEK_ENABLED") !== "false"
  );
}

type ChatCreateBody = ChatCompletionCreateParamsNonStreaming & {
  extra_body?: Record<string, unknown>;
  reasoning_effort?: "high" | "max";
};

async function createJsonCompletion({
  model,
  messages,
  task,
  userId,
  jobId,
  thinking = false,
  temperature,
}: {
  model: string;
  messages: ChatCreateBody["messages"];
  task: AiTask;
  userId?: string;
  jobId?: string;
  thinking?: boolean;
  temperature?: number;
}): Promise<ChatCompletion> {
  await assertAiBudget(task, userId);
  const body: ChatCreateBody = {
    model,
    messages,
    response_format: { type: "json_object" },
    max_tokens: thinking ? 2200 : 1800,
    stream: false,
  };

  if (thinking) {
    Object.assign(body, {
      reasoning_effort: "high",
      extra_body: { thinking: { type: "enabled" } },
    });
  } else {
    Object.assign(body, {
      temperature,
      extra_body: { thinking: { type: "disabled" } },
    });
  }

  const response = await aiClient().chat.completions.create(body);
  await recordAiUsage({ response, model, task, userId, jobId });
  return response;
}

export async function generateAiChallenge(context: ChallengeContext) {
  if (!aiEnabled()) return null;

  try {
    const response = await createJsonCompletion({
      model: fastModel(),
      task: "challenge_generation",
      userId: context.user.id,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: `${lecturerPolicy} You create strict practical challenges for GURUnet. Return only valid JSON. Do not include markdown.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            rubric:
              "Create one adaptive daily challenge. Formats may include troubleshooting, lab task, CTF-style analysis, config/design review, Linux/network automation, security investigation, packet/log analysis, real-world engineering decision, pressure challenge, or recovery challenge. Include realistic constraints, partial information, misleading symptoms, logs/config/output where useful. Deadline at noon is handled by app. Do not reveal solution.",
            user: {
              pisScore: context.user.pisScore,
              streak: context.user.currentStreak,
              difficulty: context.difficulty,
              dateKey: context.dateKey,
              recoveryRequired: context.recovery,
              pressureChallenge: context.pressure,
              recentWeaknesses: context.recentWeaknesses,
              track: context.track ?? "networking",
              topicFocus: context.topicFocus,
              durationMinutes: context.durationMinutes,
              discipline: context.disciplineSnapshot,
            },
            outputShape: {
              title: "string",
              difficulty: context.difficulty,
              topic: "string",
              scenario: "string with realistic symptoms, partial info, misleading clue, logs/config/output when useful",
              objective: "string",
              constraints: ["string"],
              allowedTools: ["string"],
              expectedAnswerFormat: "string",
              submissionRequirements: ["string"],
              solution: "hidden technical solution string",
              antiGenericRequirement: "string",
            },
          }),
        },
      ],
    });

    const content = response.choices[0]?.message.content;
    if (!content) return null;
    return challengeSchema.parse(JSON.parse(content));
  } catch (error) {
    logAiFallback("DeepSeek challenge generation failed; using template fallback", error);
    return null;
  }
}

export async function generateVerificationQuestion(challenge: Challenge, submission: string) {
  if (!aiEnabled()) {
    return "Name the one command or observation that would most directly disprove your main hypothesis.";
  }

  try {
    const response = await createJsonCompletion({
      model: reasoningModel(),
      task: "verification_question",
      userId: challenge.userId,
      thinking: true,
      messages: [
        {
          role: "system",
          content: `${lecturerPolicy} Return only JSON. Write one short verification question that tests whether the user understands their own answer. Do not reveal the solution.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            challenge: {
              title: challenge.title,
              scenario: challenge.scenario,
              objective: challenge.objective,
              allowedTools: challenge.allowedTools,
            },
            submission: summarizeSubmissionForAi(submission),
            outputShape: { question: "string" },
          }),
        },
      ],
    });
    const content = response.choices[0]?.message.content;
    if (!content) throw new Error("Empty verification response");
    return verificationSchema.parse(JSON.parse(content)).question;
  } catch (error) {
    logAiFallback("DeepSeek verification question failed; using fallback", error);
    return "Name the one command or observation that would most directly disprove your main hypothesis.";
  }
}

export async function generateAiCritique(challenge: Challenge, submission: Submission, grade: Grade) {
  if (!aiEnabled()) return null;

  try {
    const response = await createJsonCompletion({
      model: reasoningModel(),
      task: "strict_critique",
      userId: grade.userId,
      thinking: true,
      messages: [
        {
          role: "system",
          content: `${lecturerPolicy} Return only JSON. Do not change numeric scores, final score, PIS, ERT, caps, or penalties. Provide direct correction, contention notes, and one improvement target.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            challenge: {
              title: challenge.title,
              topic: challenge.topic,
              scenario: challenge.scenario,
              objective: challenge.objective,
              constraints: challenge.constraints,
              allowedTools: challenge.allowedTools,
              expectedAnswerFormat: challenge.expectedAnswerFormat,
              solution: challenge.solution,
            },
            submission: summarizeSubmissionForAi(submission.content),
            deterministicGrade: {
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
            },
            outputShape: {
              correction: "string",
              contentionNotes: ["string"],
              nextImprovementTarget: "string",
            },
          }),
        },
      ],
    });
    const content = response.choices[0]?.message.content;
    if (!content) return null;
    const critique = critiqueSchema.parse(JSON.parse(content));
    const notebook = await generateNotebookSummary(challenge, submission, grade, critique);
    return {
      ...critique,
      notebookSummary:
        notebook?.notebookSummary ?? `${challenge.topic}: ${challenge.objective}`,
      notebookMistakes: notebook?.notebookMistakes ?? [],
      notebookLessons: notebook?.notebookLessons ?? [critique.nextImprovementTarget],
    };
  } catch (error) {
    logAiFallback("DeepSeek critique failed; using deterministic critique", error);
    return null;
  }
}

async function generateNotebookSummary(
  challenge: Challenge,
  submission: Submission,
  grade: Grade,
  critique: z.infer<typeof critiqueSchema>,
) {
  if (!aiEnabled()) return null;

  try {
    const response = await createJsonCompletion({
      model: fastModel(),
      task: "notebook_summary",
      userId: grade.userId,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: `${lecturerPolicy} Return only valid JSON. Write concise notebook-ready learning material for a technical training log.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            challenge: {
              title: challenge.title,
              topic: challenge.topic,
              objective: challenge.objective,
              solution: challenge.solution,
            },
            submission: summarizeSubmissionForAi(submission.content),
            grade: {
              finalScore: grade.finalScore,
              verdict: grade.verdict,
              technicalCap: grade.technicalCap,
            },
            critique,
            outputShape: {
              notebookSummary: "string",
              notebookMistakes: ["string"],
              notebookLessons: ["string"],
            },
          }),
        },
      ],
    });
    const content = response.choices[0]?.message.content;
    if (!content) return null;
    return notebookSummarySchema.parse(JSON.parse(content));
  } catch (error) {
    logAiFallback("DeepSeek notebook summary failed; using deterministic notebook", error);
    return null;
  }
}

export async function generateStandaloneNotebookSummary(
  challenge: Challenge,
  submission: Submission,
  grade: Grade,
) {
  return generateNotebookSummary(challenge, submission, grade, {
    correction: grade.correction,
    contentionNotes: grade.contentionNotes,
    nextImprovementTarget: grade.nextImprovementTarget,
  });
}

export async function generateDisciplineNoticeReply(input: {
  user: User;
  challenge: Challenge;
  kind: "late" | "excuse";
  reason: string;
  accepted: boolean;
}) {
  if (!aiEnabled()) return fallbackDisciplineReply(input);

  try {
    const response = await createJsonCompletion({
      model: fastModel(),
      task: "discipline_notice",
      userId: input.user.id,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: `${lecturerPolicy} Return only JSON. Acknowledge the user's discipline notice like a firm lecturer. Do not change scoring rules. Do not over-comfort.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            notice: {
              kind: input.kind,
              reason: input.reason,
              accepted: input.accepted,
            },
            challenge: {
              title: input.challenge.title,
              topic: input.challenge.topic,
              deadlineAt: input.challenge.deadlineAt,
              status: input.challenge.status,
            },
            user: {
              pisScore: input.user.pisScore,
              streak: input.user.currentStreak,
            },
            rules:
              "Late notice is acknowledged but late penalties still apply on submission. Excuse is accepted only for clear real work, travel, sickness, emergency, or unavoidable duty; accepted excuse marks challenge Excused, earns no ERT, and avoids PIS loss.",
            outputShape: { reply: "string" },
          }),
        },
      ],
    });
    const content = response.choices[0]?.message.content;
    if (!content) throw new Error("Empty discipline notice response");
    return disciplineNoticeSchema.parse(JSON.parse(content)).reply;
  } catch (error) {
    logAiFallback("DeepSeek discipline notice failed; using deterministic reply", error);
    return fallbackDisciplineReply(input);
  }
}

export async function generateExaminerChatReply(input: {
  user: User;
  challenge: Challenge;
  message: string;
  recentMessages: { role: string; content: string }[];
  appliedActions: { type: string; summary: string }[];
  settings: {
    track: string;
    durationMinutes: number;
    difficultyFloor: string;
    topicFocus: string;
    recoveryMode: boolean;
    teamMode: boolean;
  };
}) {
  if (!aiEnabled()) return fallbackExaminerReply(input);

  try {
    const response = await createJsonCompletion({
      model: fastModel(),
      task: "examiner_chat",
      userId: input.user.id,
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content: `${lecturerPolicy} You are the user's examiner chat. You may answer questions, clarify rules, acknowledge late/excuse/context, and explain applied behavior changes. The backend has already applied any allowed actions; do not claim actions not listed. Return only JSON.`,
        },
        {
          role: "user",
          content: JSON.stringify({
            currentChallenge: {
              title: input.challenge.title,
              topic: input.challenge.topic,
              status: input.challenge.status,
              deadlineAt: input.challenge.deadlineAt,
              expectedAnswerFormat: input.challenge.expectedAnswerFormat,
              disciplineSnapshot: input.challenge.disciplineSnapshot,
            },
            user: {
              pisScore: input.user.pisScore,
              ertBalance: input.user.ertBalance,
              currentStreak: input.user.currentStreak,
            },
            settings: input.settings,
            recentMessages: input.recentMessages.slice(-8),
            userMessage: input.message,
            appliedActions: input.appliedActions,
            responseRules: [
              "Be conversational but direct.",
              "If the user asks for rule clarification, explain the active rule.",
              "If the user states future preferences, mention what changed if an action was applied.",
              "If the active discipline snapshot includes preferred formats or preference notes, treat them as real platform configuration.",
              "Do not say the platform cannot generate lab challenges when a hands-on/lab format is selected; explain that future challenges will be framed that way.",
              "If no action was applied, explain what you need from the user.",
              "Do not reveal hidden solution details.",
            ],
            outputShape: { reply: "string" },
          }),
        },
      ],
    });
    const content = response.choices[0]?.message.content;
    if (!content) throw new Error("Empty examiner response");
    return examinerChatSchema.parse(JSON.parse(content)).reply;
  } catch (error) {
    logAiFallback("DeepSeek examiner chat failed; using deterministic reply", error);
    return fallbackExaminerReply(input);
  }
}

function fallbackExaminerReply(input: {
  appliedActions: { type: string; summary: string }[];
  challenge?: Challenge;
  message: string;
}) {
  if (input.appliedActions.length > 0) {
    return `Recorded. ${input.appliedActions.map((action) => action.summary).join(" ")}`;
  }
  if (/\blab|hands-on|practical\b/i.test(input.message) && input.challenge?.disciplineSnapshot?.formats?.some((format) => /\blab|hands-on|practical\b/i.test(format))) {
    return "Your lab preference is part of the active study profile. Future challenges should be framed as hands-on exercises with setup, evidence capture, and validation. If a generated challenge misses that shape, ask for one regeneration.";
  }
  if (/\?/.test(input.message)) {
    return "I can clarify the active challenge rules, deadline behavior, grading expectations, or adjust future challenge settings when you state a clear preference.";
  }
  return "Message received. If you want me to adjust the system, state the change plainly: track, duration, difficulty floor, recovery mode, team mode, late notice, or excuse reason.";
}

function fallbackDisciplineReply(input: {
  kind: "late" | "excuse";
  reason: string;
  accepted: boolean;
}) {
  if (input.kind === "late") {
    return "Late notice recorded. Submit when you can, but the deadline rules still apply: late penalties affect score, PIS growth, and ERT eligibility.";
  }
  if (input.accepted) {
    return "Excuse accepted. This challenge is marked Excused: no ERT is earned, but PIS is not reduced and the missed-day penalty is not applied.";
  }
  return "Excuse not accepted from the information provided. State a concrete unavoidable reason such as real work, travel, sickness, emergency, or duty if this should be excused.";
}

export function templateFallbackChallenge(
  user: User,
  recovery: boolean,
  pressure: boolean,
  dateKey?: string,
) {
  return generateChallenge(user, { recovery, pressure, dateKey });
}

function logAiFallback(message: string, error: unknown) {
  if (error && typeof error === "object") {
    const item = error as {
      status?: number;
      code?: string;
      type?: string;
      message?: string;
      requestID?: string;
      error?: { code?: string; type?: string; message?: string };
    };
    console.warn(message, {
      status: item.status,
      code: item.code ?? item.error?.code,
      type: item.type ?? item.error?.type,
      requestID: item.requestID,
      message: item.message ?? item.error?.message,
    });
    if (
      item.status === 429 ||
      item.code === "insufficient_quota" ||
      item.error?.code === "insufficient_quota"
    ) {
      aiTemporarilyDisabled = true;
    }
    return;
  }

  console.warn(message, error);
}

async function assertAiBudget(task: AiTask, userId?: string) {
  if (fallbackOnlyMode()) throw new Error("AI fallback-only mode is enabled");

  const start = startOfToday();
  const [dailyCalls, userCalls, spend] = await Promise.all([
    prisma.aiUsage.count({ where: { createdAt: { gte: start } } }),
    userId
      ? prisma.aiUsage.count({ where: { userId, createdAt: { gte: start } } })
      : Promise.resolve(0),
    prisma.aiUsage.aggregate({
      where: { createdAt: { gte: start } },
      _sum: { estimatedCostUsd: true },
    }),
  ]);

  const dailyLimit = numberEnv("AI_DAILY_CALL_LIMIT");
  const userLimit = numberEnv("AI_USER_DAILY_CALL_LIMIT");
  const spendCap = numberEnv("AI_DAILY_SPEND_CAP_USD");

  if (dailyLimit !== null && dailyCalls >= dailyLimit) {
    throw new Error(`AI daily call limit reached before ${task}`);
  }
  if (userId && userLimit !== null && userCalls >= userLimit) {
    throw new Error(`AI user daily call limit reached before ${task}`);
  }
  if (spendCap !== null && (spend._sum.estimatedCostUsd ?? 0) >= spendCap) {
    throw new Error(`AI daily spend cap reached before ${task}`);
  }
}

async function recordAiUsage({
  response,
  model,
  task,
  userId,
  jobId,
}: {
  response: ChatCompletion;
  model: string;
  task: AiTask;
  userId?: string;
  jobId?: string;
}) {
  const usage = response.usage;
  const promptTokens = usage?.prompt_tokens ?? 0;
  const completionTokens = usage?.completion_tokens ?? 0;
  const totalTokens = usage?.total_tokens ?? promptTokens + completionTokens;
  await prisma.aiUsage.create({
    data: {
      id: createId("aiu"),
      userId,
      jobId,
      type: task,
      model,
      promptTokens,
      completionTokens,
      totalTokens,
      estimatedCostUsd: estimateCostUsd(model, promptTokens, completionTokens),
    },
  });
}

function estimateCostUsd(model: string, promptTokens: number, completionTokens: number) {
  const isReasoning = model === reasoningModel() || model.includes("pro");
  const inputPerMillion = isReasoning
    ? numberEnv("DEEPSEEK_REASONING_INPUT_USD_PER_MTOK") ?? 0.435
    : numberEnv("DEEPSEEK_FAST_INPUT_USD_PER_MTOK") ?? 0.14;
  const outputPerMillion = isReasoning
    ? numberEnv("DEEPSEEK_REASONING_OUTPUT_USD_PER_MTOK") ?? 0.87
    : numberEnv("DEEPSEEK_FAST_OUTPUT_USD_PER_MTOK") ?? 0.28;
  return Number(((promptTokens / 1_000_000) * inputPerMillion + (completionTokens / 1_000_000) * outputPerMillion).toFixed(6));
}

function numberEnv(name: string) {
  const value = getRuntimeEnv(name);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function fallbackOnlyMode() {
  return getRuntimeEnv("AI_FALLBACK_ONLY") === "true" || getRuntimeEnv("DEEPSEEK_FALLBACK_ONLY") === "true";
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}
