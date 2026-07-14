import { z } from "zod";
import { appApiError } from "@/lib/app-api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncUserNotificationSchedule } from "@/lib/notification-scheduler";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const schema = z.object({
  challengeAvailable: z.boolean().optional(),
  studyWindowReminder: z.boolean().optional(),
  deadlineWarning: z.boolean().optional(),
  correctionReady: z.boolean().optional(),
  recoveryPreview: z.boolean().optional(),
  socialInvitations: z.boolean().optional(),
  studyWindowLocalTime: time.optional(),
  deadlineOffsetMinutes: z.number().int().min(15).max(360).optional(),
  quietStartLocalTime: time.optional(),
  quietEndLocalTime: time.optional(),
});

export async function GET() {
  const user = await requireUser();
  const preferences = await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id },
  });
  return Response.json({ preferences });
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const input = schema.parse(await request.json());
    const preferences = await prisma.notificationPreference.upsert({
      where: { userId: user.id },
      update: input,
      create: { userId: user.id, ...input },
    });
    await syncUserNotificationSchedule(user.id, 14, true);
    return Response.json({ preferences });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return appApiError("VALIDATION_FAILED", "Check notification preferences.", 400, error.issues);
    }
    throw error;
  }
}
