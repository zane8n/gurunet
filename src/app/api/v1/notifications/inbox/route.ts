import { appApiError } from "@/lib/app-api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireUser();
    const now = new Date();
    const notifications = await prisma.scheduledNotification.findMany({
      where: {
        userId: user.id,
        status: { in: ["Queued", "Sent"] },
        scheduledFor: {
          lte: now,
          gte: new Date(now.getTime() - 7 * 86_400_000),
        },
      },
      orderBy: { scheduledFor: "desc" },
      take: 30,
      select: {
        id: true,
        kind: true,
        title: true,
        body: true,
        deepLink: true,
        payload: true,
        scheduledFor: true,
      },
    });
    return Response.json({
      notifications: notifications.map((notification) => ({
        ...notification,
        scheduledFor: notification.scheduledFor.toISOString(),
      })),
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return appApiError("NOTIFICATIONS_FAILED", "Unable to load notifications.", 500);
  }
}
