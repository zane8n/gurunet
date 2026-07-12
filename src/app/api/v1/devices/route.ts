import { z } from "zod";
import { appApiError } from "@/lib/app-api";
import { getBearerIdentity } from "@/lib/app-auth";
import { prisma } from "@/lib/prisma";

const updateSchema = z.object({
  pushToken: z.string().trim().min(8).max(512).nullable().optional(),
  notificationsEnabled: z.boolean().optional(),
  appVersion: z.string().trim().min(1).max(32).optional(),
  locale: z.string().trim().min(2).max(20).optional(),
  timezone: z.string().trim().min(3).max(80).optional(),
});

export async function GET() {
  const identity = await getBearerIdentity();
  if (!identity) return appApiError("UNAUTHORIZED", "Sign in is required.", 401);
  const devices = await prisma.deviceInstallation.findMany({
    where: { userId: identity.user.id, revokedAt: null },
    orderBy: { lastSeenAt: "desc" },
  });
  return Response.json({
    devices: devices.map(({ pushToken: _private, ...device }) => device),
  });
}

export async function PATCH(request: Request) {
  try {
    const identity = await getBearerIdentity();
    if (!identity) return appApiError("UNAUTHORIZED", "Sign in is required.", 401);
    const input = updateSchema.parse(await request.json());
    const session = await prisma.appSession.findUniqueOrThrow({ where: { id: identity.sessionId } });
    const device = await prisma.deviceInstallation.update({
      where: { id: session.deviceId },
      data: { ...input, lastSeenAt: new Date() },
    });
    return Response.json({
      device: { ...device, pushToken: device.pushToken ? "registered" : null },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return appApiError("VALIDATION_FAILED", "Check the device settings.", 400, error.issues);
    }
    return appApiError("DEVICE_UPDATE_FAILED", "Unable to update this device.", 500);
  }
}

export async function DELETE(request: Request) {
  const identity = await getBearerIdentity();
  if (!identity) return appApiError("UNAUTHORIZED", "Sign in is required.", 401);
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return appApiError("VALIDATION_FAILED", "Device id is required.", 400);
  await prisma.$transaction([
    prisma.deviceInstallation.updateMany({
      where: { id, userId: identity.user.id },
      data: { revokedAt: new Date(), pushToken: null, notificationsEnabled: false },
    }),
    prisma.appSession.updateMany({
      where: { deviceId: id, userId: identity.user.id },
      data: { revokedAt: new Date() },
    }),
  ]);
  return Response.json({ ok: true });
}
