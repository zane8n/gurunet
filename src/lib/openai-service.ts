import OpenAI from "openai";
import { z } from "zod";
import type {
  ChatCompletion,
  ChatCompletionCreateParamsNonStreaming,
} from "openai/resources/chat/completions";
import type { Challenge, Difficulty, Grade, Submission, User } from "@/lib/domain";
import { generateChallenge } from "@/lib/challenges";
import { requireRuntimeEnv, getRuntimeEnv } from "@/lib/runtime-env";
import { summarizeSubmissionForAi } from "@/lib/submission-content";

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

type ChallengeContext = {
  user: User;
  difficulty: Difficulty;
  dateKey: string;
  recovery: boolean;
  pressure: boolean;
  recentWeaknesses: string[];
};

let client: OpenAI | null = null;
let aiTemporarilyDisabled = false;

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
  thinking = false,
  temperature,
}: {
  model: string;
  messages: ChatCreateBody["messages"];
  thinking?: boolean;
  temperature?: number;
}): Promise<ChatCompletion> {
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

  return aiClient().chat.completions.create(body);
}

export async function generateAiChallenge(context: ChallengeContext) {
  if (!aiEnabled()) return null;

  try {
    const response = await createJsonCompletion({
      model: fastModel(),
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content:
            "You create strict practical network engineering challenges for GURUnet. Return only valid JSON. Do not include markdown. The challenge must require operational reasoning, command-level evidence, assumptions, risks, rollback, and a hidden solution. Avoid generic textbook prompts.",
        },
        {
          role: "user",
          content: JSON.stringify({
            rubric:
              "Daily challenge for network engineering, cybersecurity, Linux, scripting, troubleshooting, documentation, and automation. Include title, difficulty, scenario, objective, constraints, allowed tools, expected answer format, submission requirements, deadline at noon handled by app, hidden solution, and anti-generic requirement.",
            user: {
              pisScore: context.user.pisScore,
              streak: context.user.currentStreak,
              difficulty: context.difficulty,
              dateKey: context.dateKey,
              recoveryRequired: context.recovery,
              pressureChallenge: context.pressure,
              recentWeaknesses: context.recentWeaknesses,
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
      thinking: true,
      messages: [
        {
          role: "system",
          content:
            "Return only JSON. Write one short verification question that tests whether the user understands their own network troubleshooting answer. Do not reveal the solution. Do not include reasoning in the JSON.",
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
      thinking: true,
      messages: [
        {
          role: "system",
          content:
            "You are a strict senior network engineer and professor. Return only JSON. Do not change numeric scores, final score, PIS, ERT, caps, or penalties. Provide direct correction, contention notes, and one improvement target. Do not include reasoning in the JSON.",
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
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content:
            "Return only valid JSON. Write concise notebook-ready learning material for a technical training log. Do not include hidden reasoning.",
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
