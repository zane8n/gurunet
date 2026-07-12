import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { z } from "zod";
import { appApiError } from "@/lib/app-api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/store";

const maxFileSize = 2.5 * 1024 * 1024;
const allowedContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "text/plain",
  "text/markdown",
  "application/json",
  "application/octet-stream",
  "application/vnd.tcpdump.pcap",
];

const uploadPayloadSchema = z.object({
  userId: z.string().min(2),
  filename: z.string().min(1).max(220),
  mimeType: z.string().min(3).max(120),
  byteSize: z.number().int().positive().max(maxFileSize),
});

const clientPayloadSchema = uploadPayloadSchema.omit({ userId: true });

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as HandleUploadBody;
    const response = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const user = await requireUser();
        const metadata = clientPayloadSchema.parse(
          clientPayload ? JSON.parse(clientPayload) : {},
        );
        if (!allowedContentTypes.includes(metadata.mimeType)) {
          throw new Error("Unsupported file type");
        }
        return {
          allowedContentTypes,
          maximumSizeInBytes: maxFileSize,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ ...metadata, userId: user.id }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const metadata = uploadPayloadSchema.parse(
          tokenPayload ? JSON.parse(tokenPayload) : {},
        );
        const existing = await prisma.submissionAttachment.findFirst({
          where: {
            userId: metadata.userId,
            storagePath: `blob:${blob.pathname}`,
          },
          select: { id: true },
        });
        if (existing) return;
        await prisma.submissionAttachment.create({
          data: {
            id: createId("att"),
            userId: metadata.userId,
            filename: metadata.filename,
            mimeType: blob.contentType || metadata.mimeType,
            byteSize: metadata.byteSize,
            storagePath: `blob:${blob.pathname}`,
            kind: metadata.mimeType.startsWith("image/") ? "image" : "file",
          },
        });
      },
    });
    return Response.json(response);
  } catch (error) {
    if (error instanceof Response) return error;
    return appApiError(
      "UPLOAD_TOKEN_FAILED",
      error instanceof Error ? error.message : "Unable to authorize upload.",
      400,
    );
  }
}
