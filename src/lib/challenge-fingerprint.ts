import { createHash } from "node:crypto";

export function challengeContentFingerprint(input: {
  title: string;
  topic: string;
  scenario: string;
  objective: string;
  constraints: string[];
  expectedAnswerFormat: string;
}) {
  const canonical = [
    input.title,
    input.topic,
    input.scenario,
    input.objective,
    input.constraints.join("\n"),
    input.expectedAnswerFormat,
  ]
    .join("\n---\n")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return createHash("sha256").update(canonical).digest("hex");
}
