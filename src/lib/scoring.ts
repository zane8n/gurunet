import type {
  Challenge,
  Grade,
  NotebookEntry,
  Submission,
  TechnicalCap,
  User,
} from "@/lib/domain";
import { createId } from "@/lib/store";
import { submissionAnalysis, submissionPlainText } from "@/lib/submission-content";
import { minutesAfterDeadline, nowIso } from "@/lib/time";

type GradeInput = {
  challenge: Challenge;
  submission: Submission;
  user: User;
};

const unsafePattern =
  /\b(write erase|reload now|format flash|delete vlan\.dat|shutdown all|disable firewall|permit ip any any|chmod 777|rm -rf \/|no spanning-tree)\b/i;

const evidencePattern =
  /\b(show|ping|traceroute|tcpdump|wireshark|journalctl|grep|awk|log|packet|screenshot|attachment|attached|pcap|verify|baseline|config|interface|route|vlan|stp|ospf|bgp|acl|nat|metric|measurement|timestamp|timeline|test|assert|expected|actual|diff|requirement|constraint|claim|counterexample|calculation|sample|trace|output|result|because|indicates|demonstrates)\b/i;

function assessmentRequirements(challenge?: Challenge) {
  const blueprint = challenge?.disciplineSnapshot?.generationContext?.blueprint;
  const taskContract = challenge
    ? `${challenge.objective}\n${challenge.expectedAnswerFormat}\n${challenge.submissionRequirements.join("\n")}`
    : "";
  const interaction = /\b(code|script|function|pseudocode|test cases?|implementation)\b/i.test(taskContract)
    ? "code"
    : /\b(exact commands?|command sequence|configuration|cli|shell commands?)\b/i.test(taskContract)
      ? "commands"
      : /\b(oral|spoken defense|defend verbally)\b/i.test(taskContract)
        ? "oral"
        : "written";
  const minWords = interaction === "code"
      ? 70
      : interaction === "oral"
        ? 75
        : 80;
  return {
    blueprint,
    interaction,
    minWords,
    requiresRisk: /\b(risk|rollback|backout|blast radius|stop condition|reversal|safety|operational impact)\b/i.test(taskContract),
    requiresSequence: interaction === "commands" || interaction === "code" || /\b(sequence|ordered steps|procedure|phases|test plan)\b/i.test(taskContract),
  };
}

const weakStopWords = new Set([
  "and",
  "the",
  "with",
  "without",
  "level",
  "command",
  "commands",
  "evidence",
  "reasoning",
]);

function meaningfulWords(value: string) {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 5 && !weakStopWords.has(word));
}

function hasDisciplineEvidenceSignal(lower: string, challenge?: Challenge) {
  return challenge?.disciplineSnapshot?.evidenceTypes?.some((item) => {
    const words = meaningfulWords(item);
    return words.length > 0 && words.some((word) => lower.includes(word));
  });
}

function hasGovernedPattern(lower: string, pattern: string) {
  const normalized = pattern.toLowerCase().trim();
  if (normalized.length >= 8 && lower.includes(normalized)) return true;
  const words = meaningfulWords(pattern);
  if (words.length === 0) return false;
  if (words.length === 1) return lower.includes(words[0]);
  return words.every((word) => lower.includes(word));
}

export function calculateLatePenalty(submittedAt: string, deadlineAt: string) {
  const minutesLate = minutesAfterDeadline(submittedAt, deadlineAt);
  if (minutesLate <= 0) return 0;
  if (minutesLate <= 30) return 0.25;
  if (minutesLate <= 60) return 0.5;
  if (minutesLate <= 90) return 0.75;
  if (minutesLate <= 120) return 1;
  if (minutesLate <= 180) return 1.5;
  if (minutesLate <= 240) return 2;
  return 2.5;
}

export function isAfterRewardsWindow(submittedAt: string, deadlineAt: string) {
  return minutesAfterDeadline(submittedAt, deadlineAt) > 240;
}

export function isAfterHardCapWindow(submittedAt: string, deadlineAt: string) {
  return minutesAfterDeadline(submittedAt, deadlineAt) > 480;
}

export function needsVerification(content: string, challenge?: Challenge) {
  const analysis = submissionAnalysis(content);
  const requirements = assessmentRequirements(challenge);
  return (
    analysis.wordCount < requirements.minWords ||
    !hasModeEvidence(analysis, challenge)
  );
}

function categoryScores(content: string, challenge?: Challenge) {
  const analysis = submissionAnalysis(content);
  const plainText = analysis.plainText;
  const lower = plainText.toLowerCase();
  const wordCount = analysis.wordCount;
  const disciplineEvidence = hasDisciplineEvidenceSignal(lower, challenge);
  const requirements = assessmentRequirements(challenge);

  const hasSequence = /\b(first|then|next|after|finally|step|phase|before|following)\b/i.test(plainText);
  const hasRisk = /\b(risk|rollback|change window|impact|safe|non-disruptive)\b/i.test(
    plainText,
  );
  const hasEvidence = hasModeEvidence(analysis, challenge) || Boolean(disciplineEvidence);
  const hasTradeoff = /\b(trade[- ]?off|assumption|because|therefore|however)\b/i.test(
    plainText,
  );
  const hasLateral = /\b(native vlan|asymmetric|mtu|duplex|mac move|stp|arp|misleading|hidden|unexpected|edge case|boundary|exception|counterexample|alternative|second-order|uncertain|confidence|would disprove)\b/i.test(
    lower,
  );
  const hasStructure =
    analysis.bulletCount >= 3 ||
    analysis.headingCount > 0 ||
    /(^|\n)([-*]|\d+\.|objective|hypothesis|commands|rollback|recommendation)/i.test(
      analysis.bodyText,
    );
  const hasCodeOrOutput = analysis.codeBlockCount > 0 || analysis.inlineCodeCount >= 2;
  const hasCounterEvidence = /\b(disprove|cannot prove|does not prove|alternative|counterexample|unless|except|confidence|uncertain|limitation)\b/i.test(lower);
  const hasValidation = /\b(verify|validate|confirm|test|assert|compare|measure|expected|pass criteria|acceptance criteria)\b/i.test(lower);
  const sectionHits = (requirements.blueprint?.responseSections ?? challenge?.disciplineSnapshot?.responseSections ?? [])
    .filter((section) => meaningfulWords(section).some((word) => lower.includes(word)))
    .length;
  const hasExpectedCoverage = sectionHits >= Math.min(2, requirements.blueprint?.responseSections.length ?? 2);
  const hasRequiredWorkProduct = requirements.interaction === "code"
    ? analysis.codeBlockCount > 0 || /\b(function|script|pseudocode|test case|input|output)\b/i.test(lower)
    : requirements.interaction === "commands"
      ? hasCodeOrOutput || /(^|\n)\s*(show|set|no |ip |sudo |systemctl|kubectl|terraform|ansible|git |curl |python |node )/im.test(plainText)
      : hasTradeoff || hasCounterEvidence || hasEvidence;
  const hasExplainedAttachment =
    analysis.attachmentCount > 0 &&
    /\b(screenshot|attached|attachment|capture|output|evidence|shows|indicates)\b/i.test(
      plainText,
    );

  return {
    creativity: clampScore(2 + Number(hasTradeoff) + Number(hasLateral) + Number(hasCounterEvidence) + Number(wordCount > requirements.minWords * 2)),
    ingenuity: clampScore(
      2 +
        Number(hasEvidence) +
        Number(hasRequiredWorkProduct) +
        Number(hasValidation) +
        Number(requirements.requiresSequence ? hasSequence : hasTradeoff) +
        Number(wordCount > requirements.minWords),
    ),
    reporting: clampScore(
      2 +
        Number(hasStructure) +
        Number(hasTradeoff) +
        Number(hasExpectedCoverage) +
        Number(requirements.requiresRisk ? hasRisk : hasCounterEvidence) +
        Number(hasExplainedAttachment) +
        Number(wordCount > requirements.minWords),
    ),
    alienness: clampScore(2 + Number(hasLateral) + Number(hasTradeoff) + Number(hasCounterEvidence) + Number(/\b(assume|assumption)\b/i.test(lower))),
    neatness: clampScore(
      3 +
        Number(hasStructure) +
        Number(analysis.codeBlockCount <= 3) +
        Number(wordCount >= requirements.minWords && wordCount <= 1200) +
        Number(!lower.includes("maybe maybe")),
    ),
  };
}

function hasModeEvidence(
  analysis: ReturnType<typeof submissionAnalysis>,
  challenge?: Challenge,
) {
  const requirements = assessmentRequirements(challenge);
  const plainText = analysis.plainText;
  if (analysis.attachmentCount > 0 || analysis.hasStructuredEvidence) return true;
  if (requirements.interaction === "code") {
    return analysis.codeBlockCount > 0 || /\b(function|script|pseudocode|test case|expected output|edge case)\b/i.test(plainText);
  }
  if (requirements.interaction === "commands") {
    return analysis.codeBlockCount > 0 || analysis.inlineCodeCount >= 2 || /(^|\n)\s*(show|set|no |ip |sudo |systemctl|journalctl|kubectl|terraform|ansible|git |curl |python |node )/im.test(plainText);
  }
  return evidencePattern.test(plainText) || hasDisciplineEvidenceSignal(plainText.toLowerCase(), challenge);
}

function clampScore(score: number) {
  return Math.max(0, Math.min(7, score));
}

function technicalCapFor(content: string, challenge?: Challenge): TechnicalCap {
  const analysis = submissionAnalysis(content);
  const plainText = analysis.plainText;
  const lower = plainText.toLowerCase();
  const requirements = assessmentRequirements(challenge);
  const hasDisciplineEvidence = hasDisciplineEvidenceSignal(lower, challenge);
  const hasUnsafeDisciplinePattern = challenge?.disciplineSnapshot?.unsafePatterns?.some((item) =>
    hasGovernedPattern(lower, item),
  );
  const hasWeakDisciplinePattern = challenge?.disciplineSnapshot?.weakPatterns?.some((item) =>
    hasGovernedPattern(lower, item),
  );
  const hasSomeOperationalProof =
    hasModeEvidence(analysis, challenge) ||
    hasDisciplineEvidence ||
    analysis.hasStructuredEvidence;
  if (unsafePattern.test(plainText) || hasUnsafeDisciplinePattern) return "UNSAFE";
  if (analysis.attachmentCount > 0 && analysis.wordCount < 45) return "INCOMPLETE";
  if (analysis.wordCount < Math.max(30, Math.floor(requirements.minWords * 0.6))) return "INCOMPLETE";
  if (!hasSomeOperationalProof) return "MOSTLY_WRONG";
  if (hasWeakDisciplinePattern) return "INCOMPLETE";
  return "NONE";
}

function capValue(cap: TechnicalCap) {
  if (cap === "UNSAFE") return 8;
  if (cap === "MOSTLY_WRONG") return 10;
  if (cap === "INCOMPLETE") return 14;
  return 20;
}

function balancePenalty(scores: number[]) {
  const spread = Math.max(...scores) - Math.min(...scores);
  if (spread <= 3) return 0;
  if (spread === 4) return 0.5;
  if (spread === 5) return 1;
  if (spread === 6) return 1.5;
  return 2;
}

function verdictFor(finalScore: number) {
  if (finalScore >= 15) return "Passed";
  if (finalScore >= 10) return "Partially passed";
  return "Failed";
}

function pisDelta(finalScore: number, cap: TechnicalCap, submittedAt: string, deadlineAt: string) {
  if (cap !== "NONE" || finalScore < 13 || isAfterRewardsWindow(submittedAt, deadlineAt)) {
    return 0;
  }

  let delta = 0;
  if (finalScore < 15) delta = 0.2;
  else if (finalScore < 16.5) delta = 0.5;
  else if (finalScore < 18) delta = 0.8;
  else delta = 1.2;

  if (minutesAfterDeadline(submittedAt, deadlineAt) > 120) {
    delta -= 0.5;
  }

  return Math.max(0, Number(delta.toFixed(1)));
}

function ertEarned(
  finalScore: number,
  balancePenaltyValue: number,
  cap: TechnicalCap,
  submittedAt: string,
  deadlineAt: string,
  isPressure: boolean,
) {
  if (
    finalScore < 13 ||
    cap !== "NONE" ||
    isAfterRewardsWindow(submittedAt, deadlineAt)
  ) {
    return 0;
  }

  let earned = minutesAfterDeadline(submittedAt, deadlineAt) === 0 ? 1 : 0;
  if (finalScore >= 18.5) earned += 3;
  else if (finalScore >= 17) earned += 2;
  else if (finalScore >= 15) earned += 1;
  if (balancePenaltyValue === 0) earned += 1;
  if (isPressure && finalScore >= 15) earned += 2;
  return earned;
}

export function gradeSubmission({ challenge, submission, user }: GradeInput): Grade {
  const scores = categoryScores(submission.content, challenge);
  const scoreValues = [
    scores.creativity,
    scores.ingenuity,
    scores.reporting,
    scores.alienness,
    scores.neatness,
  ];
  const rawScore = Number(((scoreValues.reduce((a, b) => a + b, 0) / 35) * 20).toFixed(2));
  const balancePenaltyValue = balancePenalty(scoreValues);
  const latePenalty = calculateLatePenalty(submission.submittedAt, challenge.deadlineAt);
  const technicalCap = technicalCapFor(submission.content, challenge);
  const capped = Math.min(rawScore - balancePenaltyValue - latePenalty, capValue(technicalCap));
  const hardCapped = isAfterHardCapWindow(submission.submittedAt, challenge.deadlineAt)
    ? Math.min(capped, 12)
    : capped;
  const finalScore = Number(Math.max(0, hardCapped).toFixed(2));
  const pisChange = pisDelta(
    finalScore,
    technicalCap,
    submission.submittedAt,
    challenge.deadlineAt,
  );
  const updatedPis = Number(Math.max(0, Math.min(100, user.pisScore + pisChange)).toFixed(1));
  const earned = ertEarned(
    finalScore,
    balancePenaltyValue,
    technicalCap,
    submission.submittedAt,
    challenge.deadlineAt,
    challenge.isPressure,
  );

  return {
    id: createId("grd"),
    submissionId: submission.id,
    challengeId: challenge.id,
    userId: user.id,
    ...scores,
    rawScore,
    balancePenalty: balancePenaltyValue,
    latePenalty,
    technicalCap,
    finalScore,
    verdict: verdictFor(finalScore),
    correction: correctionFor(technicalCap, submission.content, challenge),
    contentionNotes: contentionNotes(scores, technicalCap, latePenalty),
    nextImprovementTarget: nextTarget(scores, technicalCap, challenge),
    pisChange,
    previousPis: user.pisScore,
    updatedPis,
    ertEarned: earned,
    ertBalance: user.ertBalance + earned,
    createdAt: nowIso(),
  };
}

export type ReviewedAxisScores = Pick<
  Grade,
  "creativity" | "ingenuity" | "reporting" | "alienness" | "neatness"
>;

export function recalculateGradeFromReview(input: {
  existing: Grade;
  challenge: Challenge;
  submission: Submission;
  scores: ReviewedAxisScores;
  technicalCap: TechnicalCap;
}) {
  const scoreValues = [
    input.scores.creativity,
    input.scores.ingenuity,
    input.scores.reporting,
    input.scores.alienness,
    input.scores.neatness,
  ];
  const rawScore = Number(((scoreValues.reduce((sum, score) => sum + score, 0) / 35) * 20).toFixed(2));
  const balancePenaltyValue = balancePenalty(scoreValues);
  const latePenalty = calculateLatePenalty(input.submission.submittedAt, input.challenge.deadlineAt);
  const capped = Math.min(
    rawScore - balancePenaltyValue - latePenalty,
    capValue(input.technicalCap),
  );
  const hardCapped = isAfterHardCapWindow(input.submission.submittedAt, input.challenge.deadlineAt)
    ? Math.min(capped, 12)
    : capped;
  const finalScore = Number(Math.max(0, hardCapped).toFixed(2));
  const pisChange = pisDelta(
    finalScore,
    input.technicalCap,
    input.submission.submittedAt,
    input.challenge.deadlineAt,
  );
  const ertEarnedValue = ertEarned(
    finalScore,
    balancePenaltyValue,
    input.technicalCap,
    input.submission.submittedAt,
    input.challenge.deadlineAt,
    input.challenge.isPressure,
  );
  const priorErtBase = input.existing.ertBalance - input.existing.ertEarned;

  return {
    ...input.scores,
    rawScore,
    balancePenalty: balancePenaltyValue,
    latePenalty,
    technicalCap: input.technicalCap,
    finalScore,
    verdict: verdictFor(finalScore),
    pisChange,
    previousPis: input.existing.previousPis,
    updatedPis: Number(
      Math.max(0, Math.min(100, input.existing.previousPis + pisChange)).toFixed(1),
    ),
    ertEarned: ertEarnedValue,
    ertBalance: priorErtBase + ertEarnedValue,
  };
}

export function createNotebookEntry(challenge: Challenge, grade: Grade): NotebookEntry {
  return {
    id: createId("note"),
    userId: challenge.userId,
    challengeId: challenge.id,
    title: challenge.title,
    summary: `${challenge.topic}: ${challenge.objective}`,
    mistakes: grade.technicalCap === "NONE" ? [] : [grade.correction],
    correctApproach: challenge.solution,
    commands: challenge.allowedTools,
    lessons: [
      grade.nextImprovementTarget,
      `Tie every recommendation to evidence: ${
        challenge.disciplineSnapshot?.evidenceTypes?.join(", ") ??
        "commands, logs, configs, or packet behavior"
      }.`,
    ],
    tags: [challenge.topic, challenge.difficulty],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function correctionFor(cap: TechnicalCap, content: string, challenge?: Challenge) {
  const plainText = submissionPlainText(content);
  const analysis = submissionAnalysis(content);
  const requirements = assessmentRequirements(challenge);
  if (cap === "UNSAFE") {
    return "The answer contains an unsafe operational recommendation. A safe response must verify state, reduce blast radius, and include rollback before any disruptive change.";
  }
  if (cap === "MOSTLY_WRONG") {
    const evidence = challenge?.disciplineSnapshot?.evidenceTypes?.join(", ") || "scenario-specific artifacts, explicit reasoning, and a testable work product";
    return `The answer is not tied to usable evidence. It needs ${evidence}.`;
  }
  if (cap === "INCOMPLETE") {
    const sections = (
      requirements.blueprint?.responseSections ??
      challenge?.disciplineSnapshot?.responseSections ??
      ["position", "evidence", "work product", "validation", "limits"]
    ).join(", ");
    return `The answer is too incomplete to prove competence. Provide ${sections}.`;
  }
  if (analysis.attachmentCount > 0 && !/\b(screenshot|attached|attachment|shows|indicates|evidence)\b/i.test(plainText)) {
    return "The submission includes attached evidence, but the answer does not explain what the evidence proves. Reference each important image or file and tie it to a decision.";
  }
  if (requirements.requiresRisk && !/\brollback|risk|impact|reversal|stop condition\b/i.test(plainText)) {
    return "The technical direction is usable, but the operational risk and rollback plan are underdeveloped.";
  }
  return "The submission provides a defensible technical response. Improve by making the evidence-to-conclusion links tighter and explicitly separating facts from assumptions.";
}

function contentionNotes(scores: ReturnType<typeof categoryScores>, cap: TechnicalCap, late: number) {
  const notes: string[] = [];
  if (scores.ingenuity >= 5 && scores.neatness <= 3) notes.push("Clever but messy.");
  if (scores.alienness >= 5 && cap !== "NONE") notes.push("Creative but technically unproven.");
  if (scores.reporting >= 5 && scores.ingenuity <= 3) notes.push("Well written but shallow.");
  if (scores.creativity >= 5 && scores.reporting <= 3) notes.push("Good thinking but poorly communicated.");
  if (late > 0) notes.push("Competence reduced by late discipline.");
  return notes;
}

function nextTarget(
  scores: ReturnType<typeof categoryScores>,
  cap: TechnicalCap,
  challenge?: Challenge,
) {
  if (cap !== "NONE") {
    const evidence = challenge?.disciplineSnapshot?.evidenceTypes?.slice(0, 2).join(" and ") ?? "scenario-specific evidence";
    return `Prove the main claims with ${evidence} before finalizing the required work product.`;
  }
  const entries = Object.entries(scores).sort((a, b) => a[1] - b[1]);
  return `Raise ${entries[0][0]} by making the assessment response more evidence-specific and testable.`;
}
