import { appApiError } from "@/lib/app-api";
import { getBearerIdentity } from "@/lib/app-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const identity = await getBearerIdentity();
  if (!identity) return appApiError("UNAUTHORIZED", "Sign in is required.", 401);
  const sessions = await prisma.appSession.findMany({
    where: { userId: identity.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    include: { device: true },
    orderBy: { lastUsedAt: "desc" },
  });
  return Response.json({
    sessions: sessions.map((session) => ({
      id: session.id,
      current: session.id === identity.sessionId,
      platform: session.platform,
      appVersion: session.device.appVersion,
      deviceId: session.deviceId,
      timezone: session.device.timezone,
      lastUsedAt: session.lastUsedAt.toISOString(),
      createdAt: session.createdAt.toISOString(),
    })),
  });
}

export async function DELETE(request: Request) {
  const identity = await getBearerIdentity();
  if (!identity) return appApiError("UNAUTHORIZED", "Sign in is required.", 401);
  const sessionId = new URL(request.url).searchParams.get("id");
  if (!sessionId) return appApiError("VALIDATION_FAILED", "Session id is required.", 400);
  await prisma.appSession.updateMany({
    where: { id: sessionId, userId: identity.user.id },
    data: { revokedAt: new Date() },
  });
  return Response.json({ ok: true });
}
