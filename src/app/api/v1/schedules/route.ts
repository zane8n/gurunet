import { z } from "zod";
import { appApiError } from "@/lib/app-api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/store";
import { syncUserNotificationSchedule } from "@/lib/notification-scheduler";

export const scheduleSchema = z.object({
  title: z.string().trim().min(2).max(80),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).max(7).default([]),
  localTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  durationMinutes: z.number().int().min(10).max(240),
  reminderMinutesBefore: z.number().int().min(0).max(120).default(10),
  flexWindowMinutes: z.number().int().min(0).max(120).default(30),
  timezone: z.string().trim().min(3).max(80),
  oneOffAt: z.coerce.date().nullable().optional(),
  enabled: z.boolean().default(true),
}).refine((value) => value.daysOfWeek.length > 0 || value.oneOffAt, {
  message: "Choose recurring days or a one-off date.",
  path: ["daysOfWeek"],
});

export async function GET() {
  const user = await requireUser();
  const schedules = await prisma.studySchedule.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ schedules });
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = scheduleSchema.parse(await request.json());
    const schedule = await prisma.studySchedule.create({
      data: { id: createId("schedule"), userId: user.id, ...input },
    });
    await syncUserNotificationSchedule(user.id, 14, true);
    return Response.json({ schedule }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return appApiError("VALIDATION_FAILED", "Check the study schedule.", 400, error.issues);
    }
    throw error;
  }
}
