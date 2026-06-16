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
  /\b(show|ping|traceroute|tcpdump|wireshark|journalctl|grep|awk|log|packet|screenshot|attachment|attached|pcap|rollback|risk|verify|baseline|config|interface|route|vlan|stp|ospf|bgp|acl|nat)\b/i;

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

export function needsVerification(content: string) {
  const analysis = submissionAnalysis(content);
  return (
    analysis.wordCount < 90 ||
    (!evidencePattern.test(analysis.plainText) && !analysis.hasStructuredEvidence)
  );
}

function categoryScores(content: string, challenge?: Challenge) {
  const analysis = submissionAnalysis(content);
  const plainText = analysis.plainText;
  const lower = plainText.toLowerCase();
  const wordCount = analysis.wordCount;
  const disciplineEvidence = challenge?.disciplineSnapshot?.evidenceTypes?.some((item) =>
    lower.includes(item.toLowerCase().split(" ")[0] ?? item.toLowerCase()),
  );

  const hasSequence = /\b(first|then|next|after|finally|step)\b/i.test(plainText);
  const hasRisk = /\b(risk|rollback|change window|impact|safe|non-disruptive)\b/i.test(
    plainText,
  );
  const hasEvidence = evidencePattern.test(plainText) || Boolean(disciplineEvidence) || analysis.attachmentCount > 0;
  const hasTradeoff = /\b(trade[- ]?off|assumption|because|therefore|however)\b/i.test(
    plainText,
  );
  const hasLateral = /\b(native vlan|asymmetric|mtu|duplex|mac move|stp|arp|misleading|hidden|unexpected)\b/i.test(
    lower,
  );
  const hasStructure =
    analysis.bulletCount >= 3 ||
    analysis.headingCount > 0 ||
    /(^|\n)([-*]|\d+\.|objective|hypothesis|commands|rollback|recommendation)/i.test(
      analysis.bodyText,
    );
  const hasCodeOrOutput = analysis.codeBlockCount > 0 || analysis.inlineCodeCount >= 2;
  const hasExplainedAttachment =
    analysis.attachmentCount > 0 &&
    /\b(screenshot|attached|attachment|capture|output|evidence|shows|indicates)\b/i.test(
      plainText,
    );

  return {
    creativity: clampScore(3 + Number(hasTradeoff) + Number(hasRisk) + Number(wordCount > 220)),
    ingenuity: clampScore(
      2 +
        Number(hasEvidence) +
        Number(hasSequence) +
        Number(hasRisk) +
        Number(hasCodeOrOutput) +
        Number(wordCount > 260),
    ),
    reporting: clampScore(
      2 +
        Number(hasStructure) +
        Number(hasTradeoff) +
        Number(hasRisk) +
        Number(hasExplainedAttachment) +
        Number(wordCount > 180),
    ),
    alienness: clampScore(2 + Number(hasLateral) + Number(hasTradeoff) + Number(lower.includes("not assume"))),
    neatness: clampScore(
      3 +
        Number(hasStructure) +
        Number(analysis.codeBlockCount <= 3) +
        Number(wordCount >= 120 && wordCount <= 850) +
        Number(!lower.includes("maybe maybe")),
    ),
  };
}

function clampScore(score: number) {
  return Math.max(0, Math.min(7, score));
}

function technicalCapFor(content: string, challenge?: Challenge): TechnicalCap {
  const analysis = submissionAnalysis(content);
  const plainText = analysis.plainText;
  const lower = plainText.toLowerCase();
  const hasDisciplineEvidence = challenge?.disciplineSnapshot?.evidenceTypes?.some((item) =>
    lower.includes(item.toLowerCase().split(" ")[0] ?? item.toLowerCase()),
  );
  const hasUnsafeDisciplinePattern = challenge?.disciplineSnapshot?.unsafePatterns?.some((item) =>
    lower.includes(item.toLowerCase().split(" ")[0] ?? item.toLowerCase()),
  );
  const hasWeakDisciplinePattern = challenge?.disciplineSnapshot?.weakPatterns?.some((item) =>
    lower.includes(item.toLowerCase().split(" ")[0] ?? item.toLowerCase()),
  );
  if (unsafePattern.test(plainText) || hasUnsafeDisciplinePattern) return "UNSAFE";
  if (analysis.attachmentCount > 0 && analysis.wordCount < 45) return "INCOMPLETE";
  if (analysis.wordCount < 50) return "INCOMPLETE";
  if ((!evidencePattern.test(plainText) && !hasDisciplineEvidence && !analysis.hasStructuredEvidence) || hasWeakDisciplinePattern) return "MOSTLY_WRONG";
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
    nextImprovementTarget: nextTarget(scores, technicalCap),
    pisChange,
    previousPis: user.pisScore,
    updatedPis,
    ertEarned: earned,
    ertBalance: user.ertBalance + earned,
    createdAt: nowIso(),
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
  if (cap === "UNSAFE") {
    return "The answer contains an unsafe operational recommendation. A safe response must verify state, reduce blast radius, and include rollback before any disruptive change.";
  }
  if (cap === "MOSTLY_WRONG") {
    const evidence = challenge?.disciplineSnapshot?.evidenceTypes?.join(", ") || "command-level verification, scenario-specific reasoning, and a defensible recommendation";
    return `The answer is not tied to usable evidence. It needs ${evidence}.`;
  }
  if (cap === "INCOMPLETE") {
    const sections = challenge?.disciplineSnapshot?.responseSections?.join(", ") || "hypothesis, verification sequence, risks, rollback, and final recommendation";
    return `The answer is too incomplete to prove competence. Provide ${sections}.`;
  }
  if (analysis.attachmentCount > 0 && !/\b(screenshot|attached|attachment|shows|indicates|evidence)\b/i.test(plainText)) {
    return "The submission includes attached evidence, but the answer does not explain what the evidence proves. Reference each important image or file and tie it to a decision.";
  }
  if (!/\brollback|risk|impact\b/i.test(plainText)) {
    return "The technical direction is usable, but the operational risk and rollback plan are underdeveloped.";
  }
  return "The submission provides a defensible technical path. Improve by making the verification order tighter and explicitly separating facts from assumptions.";
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

function nextTarget(scores: ReturnType<typeof categoryScores>, cap: TechnicalCap) {
  if (cap !== "NONE") return "Prove claims with command-level evidence before recommending changes.";
  const entries = Object.entries(scores).sort((a, b) => a[1] - b[1]);
  return `Raise ${entries[0][0]} by adding more scenario-specific operational reasoning.`;
}
