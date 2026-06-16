export type SubmissionAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  kind: "image" | "file";
  dataUrl?: string;
};

export type ParsedSubmission = {
  body: string;
  attachments: SubmissionAttachment[];
};

const attachmentMarker = "\n\n---\nGURUNET_ATTACHMENT_MANIFEST\n";

export function buildSubmissionContent(input: ParsedSubmission) {
  const body = input.body.trim();
  const attachments = input.attachments.map((attachment) => ({
    id: attachment.id,
    name: attachment.name,
    type: attachment.type,
    size: attachment.size,
    kind: attachment.kind,
    dataUrl: attachment.dataUrl,
  }));

  if (attachments.length === 0) return body;
  return `${body}${attachmentMarker}${JSON.stringify(attachments, null, 2)}`;
}

export function parseSubmissionContent(content: string): ParsedSubmission {
  const markerIndex = content.indexOf(attachmentMarker);
  if (markerIndex === -1) return { body: content, attachments: [] };

  const body = content.slice(0, markerIndex);
  const manifest = content.slice(markerIndex + attachmentMarker.length).trim();
  try {
    const parsed = JSON.parse(manifest) as SubmissionAttachment[];
    const attachments = Array.isArray(parsed)
      ? parsed.filter(isAttachmentLike).map((attachment) => ({
          ...attachment,
          kind: (attachment.kind === "image" ? "image" : "file") as "image" | "file",
        }))
      : [];
    return { body, attachments };
  } catch {
    return { body: content, attachments: [] };
  }
}

export function submissionPlainText(content: string) {
  const parsed = parseSubmissionContent(content);
  const attachmentText = parsed.attachments
    .map(
      (attachment) =>
        `Attachment: ${attachment.name} (${attachment.kind}, ${attachment.type || "unknown type"}, ${formatBytes(attachment.size)})`,
    )
    .join("\n");

  return [parsed.body, attachmentText].filter(Boolean).join("\n\n").trim();
}

export function submissionAnalysis(content: string) {
  const parsed = parseSubmissionContent(content);
  const plainText = submissionPlainText(content);
  const body = parsed.body;
  const codeBlockCount = (body.match(/```[\s\S]*?```/g) ?? []).length;
  const inlineCodeCount = (body.match(/`[^`\n]+`/g) ?? []).length;
  const bulletCount = body
    .split("\n")
    .filter((line) => /^\s*(-|\*|\d+\.)\s+\S/.test(line)).length;
  const headingCount = body
    .split("\n")
    .filter((line) => /^\s{0,3}#{1,4}\s+\S/.test(line)).length;
  const imageCount = parsed.attachments.filter((item) => item.kind === "image").length;
  const fileCount = parsed.attachments.length - imageCount;

  return {
    parsed,
    plainText,
    bodyText: body,
    wordCount: plainText.trim().split(/\s+/).filter(Boolean).length,
    codeBlockCount,
    inlineCodeCount,
    bulletCount,
    headingCount,
    attachmentCount: parsed.attachments.length,
    imageCount,
    fileCount,
    hasStructuredEvidence:
      codeBlockCount > 0 ||
      inlineCodeCount > 2 ||
      bulletCount >= 3 ||
      parsed.attachments.length > 0,
  };
}

export function summarizeSubmissionForAi(content: string) {
  const analysis = submissionAnalysis(content);
  return {
    body: analysis.parsed.body,
    structure: {
      words: analysis.wordCount,
      bullets: analysis.bulletCount,
      headings: analysis.headingCount,
      codeBlocks: analysis.codeBlockCount,
      inlineCodeSpans: analysis.inlineCodeCount,
      attachments: analysis.attachmentCount,
      screenshots: analysis.imageCount,
      files: analysis.fileCount,
    },
    attachments: analysis.parsed.attachments.map((attachment) => ({
      name: attachment.name,
      type: attachment.type,
      size: attachment.size,
      kind: attachment.kind,
    })),
  };
}

export function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isAttachmentLike(value: unknown): value is SubmissionAttachment {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<SubmissionAttachment>;
  return (
    typeof item.id === "string" &&
    typeof item.name === "string" &&
    typeof item.type === "string" &&
    typeof item.size === "number"
  );
}
