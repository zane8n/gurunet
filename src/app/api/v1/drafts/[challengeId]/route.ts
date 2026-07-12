import { z } from "zod";
import { appApiError } from "@/lib/app-api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/store";

const schema = z.object({
  body: z.string().max(100_000),
  attachmentIds: z.array(z.string()).max(8).default([]),
  revision: z.number().int().min(0),
  deviceId: z.string().max(160).optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ challengeId: string }> }) {
  const user = await requireUser();
  const { challengeId } = await params;
  const draft = await prisma.responseDraft.findUnique({
    where: { userId_challengeId: { userId: user.id, challengeId } },
  });
  return Response.json({ draft });
}

export async function PUT(request: Request, { params }: { params: Promise<{ challengeId: string }> }) {
  try {
    const user = await requireUser();
    const { challengeId } = await params;
    const input = schema.parse(await request.json());
    const existing = await prisma.responseDraft.findUnique({
      where: { userId_challengeId: { userId: user.id, challengeId } },
    });
    if (existing && input.revision !== existing.revision) {
      return appApiError("DRAFT_CONFLICT", "This draft changed on another device.", 409, {
        server: existing,
        client: input,
      });
    }
    const challenge = await prisma.challenge.findFirst({ where: { id: challengeId, userId: user.id } });
    if (!challenge) return appApiError("NOT_FOUND", "Challenge not found.", 404);
    const draft = await prisma.responseDraft.upsert({
      where: { userId_challengeId: { userId: user.id, challengeId } },
      update: {
        body: input.body,
        attachmentIds: input.attachmentIds,
        deviceId: input.deviceId,
        revision: { increment: 1 },
      },
      create: {
        id: createId("draft"), userId: user.id, challengeId,
        body: input.body, attachmentIds: input.attachmentIds,
        deviceId: input.deviceId, revision: 1,
      },
    });
    return Response.json({ draft });
  } catch (error) {
    if (error instanceof z.ZodError) return appApiError("VALIDATION_FAILED", "Check the draft.", 400, error.issues);
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ challengeId: string }> }) {
  const user = await requireUser();
  const { challengeId } = await params;
  await prisma.responseDraft.deleteMany({ where: { userId: user.id, challengeId } });
  return Response.json({ ok: true });
}
