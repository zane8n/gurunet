import type { Challenge, Difficulty, RecoveryContext, User } from "@/lib/domain";
import { createId } from "@/lib/store";
import { nowIso } from "@/lib/time";

export function difficultyForPis(pis: number): Difficulty {
  if (pis < 45) return "Guided";
  if (pis <= 60) return "Normal";
  if (pis <= 75) return "Advanced";
  if (pis <= 90) return "Production";
  return "Expert";
}

export function buildChallengeFromAi({
  user,
  dateKey,
  deadlineAt,
  recovery,
  pressure,
  ai,
  recoveryContext,
}: {
  user: User;
  dateKey: string;
  deadlineAt: string;
  recovery: boolean;
  pressure: boolean;
  ai: {
    title: string;
    difficulty: Difficulty;
    topic: string;
    scenario: string;
    objective: string;
    constraints: string[];
    allowedTools: string[];
    expectedAnswerFormat: string;
    submissionRequirements: string[];
    solution: string;
    antiGenericRequirement: string;
  };
  recoveryContext?: RecoveryContext;
}): Challenge {
  const scenario = recovery
    ? ensureRecoveryTask(ai.scenario, recoveryContext)
    : ai.scenario;
  const expectedAnswerFormat =
    recovery && !/\brecovery|reinforcement\b/i.test(ai.expectedAnswerFormat)
      ? `${ai.expectedAnswerFormat}\n\nTargeted reinforcement`
      : ai.expectedAnswerFormat;
  const submissionRequirements =
    recovery && !ai.submissionRequirements.some((item) => /\brecovery|reinforcement\b/i.test(item))
      ? [...ai.submissionRequirements, "Targeted reinforcement answer."].slice(0, 10)
      : ai.submissionRequirements;

  return {
    id: createId("chl"),
    userId: user.id,
    dateKey,
    title: ai.title,
    difficulty: ai.difficulty,
    topic: ai.topic,
    scenario,
    objective: ai.objective,
    constraints: ai.constraints,
    allowedTools: ai.allowedTools,
    expectedAnswerFormat,
    submissionRequirements,
    deadlineAt,
    solution: ai.solution,
    antiGenericRequirement: ai.antiGenericRequirement,
    status: pressure ? "Pressure Challenge" : recovery ? "Recovery Challenge" : "Active",
    isRecovery: recovery,
    isPressure: pressure,
    recoveryContext,
    createdAt: nowIso(),
  };
}

function ensureRecoveryTask(scenario: string, context?: RecoveryContext) {
  const task = context?.task ??
    "Identify one relevant failure mode from a recent weak area, state the evidence that would expose it, and give one validation step.";
  if (scenario.includes(task)) return scenario;

  const block = [
    "Task 2 - Targeted reinforcement",
    ...(context?.target ? [`Focus: ${context.target}`] : []),
    task,
    "",
  ].join("\n");
  const existingBlock = /(?:Task 2\s*[-:]?[^\n]*|Recovery Component|Recovery Task)[\s\S]*?(?=\n(?:Optional Lab|Submission Deadline)\b|$)/i;
  if (existingBlock.test(scenario)) return scenario.replace(existingBlock, block.trimEnd());
  const deadline = /\nSubmission Deadline\b/i;
  return deadline.test(scenario)
    ? scenario.replace(deadline, `\n${block}Submission Deadline`)
    : `${scenario}\n\n${block.trimEnd()}`;
}
