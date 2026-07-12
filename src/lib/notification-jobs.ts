import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/store";

function localClock(timezone: string) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

function isQuiet(clock: string, start: string, end: string) {
  if (start === end) return false;
  return start < end
    ? clock >= start && clock < end
    : clock >= start || clock < end;
}

export async function processDueNotifications(limit = 50) {
  const notifications = await prisma.scheduledNotification.findMany({
    where: { status: "Queued", scheduledFor: { lte: new Date() } },
    include: {
      user: {
        include: {
          deviceInstallations: {
            where: { revokedAt: null, notificationsEnabled: true },
          },
          notificationPreference: true,
        },
      },
    },
    orderBy: { scheduledFor: "asc" },
    take: Math.max(1, Math.min(limit, 100)),
  });
  const output = [];

  for (const notification of notifications) {
    const preference = notification.user.notificationPreference;
    const timezone = notification.user.timezone;
    if (
      preference &&
      isQuiet(localClock(timezone), preference.quietStartLocalTime, preference.quietEndLocalTime)
    ) {
      continue;
    }
    if (notification.kind === "connection_invitation" && !preference?.socialInvitations) {
      await prisma.scheduledNotification.update({
        where: { id: notification.id }, data: { status: "Cancelled" },
      });
      continue;
    }
    const payload = (notification.payload ?? {}) as { challengeId?: string };
    if (payload.challengeId) {
      const challenge = await prisma.challenge.findFirst({
        where: { id: payload.challengeId, userId: notification.userId },
        select: { status: true },
      });
      if (challenge && challenge.status !== "Active" && challenge.status !== "Late") {
        await prisma.scheduledNotification.update({
          where: { id: notification.id }, data: { status: "Cancelled" },
        });
        continue;
      }
    }

    const mobileDevices = notification.user.deviceInstallations.filter(
      (device) => device.pushToken && device.platform !== "Windows",
    );
    let failures = 0;
    for (const device of mobileDevices) {
      try {
        const response = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to: device.pushToken,
            title: notification.title,
            body: notification.body,
            data: { ...payload, deepLink: notification.deepLink },
            sound: "default",
          }),
        });
        const result = (await response.json().catch(() => ({}))) as {
          data?: { id?: string; message?: string };
        };
        if (!response.ok) throw new Error(result.data?.message ?? "Push provider rejected delivery");
        await prisma.notificationDelivery.upsert({
          where: {
            scheduledNotificationId_deviceInstallationId: {
              scheduledNotificationId: notification.id,
              deviceInstallationId: device.id,
            },
          },
          update: { status: "Delivered", deliveredAt: new Date(), providerMessageId: result.data?.id },
          create: {
            id: createId("delivery"), scheduledNotificationId: notification.id,
            deviceInstallationId: device.id, status: "Delivered",
            deliveredAt: new Date(), providerMessageId: result.data?.id,
          },
        });
      } catch (error) {
        failures += 1;
        await prisma.notificationDelivery.upsert({
          where: {
            scheduledNotificationId_deviceInstallationId: {
              scheduledNotificationId: notification.id,
              deviceInstallationId: device.id,
            },
          },
          update: { status: "Failed", error: error instanceof Error ? error.message : "Delivery failed" },
          create: {
            id: createId("delivery"), scheduledNotificationId: notification.id,
            deviceInstallationId: device.id, status: "Failed",
            error: error instanceof Error ? error.message : "Delivery failed",
          },
        });
      }
    }
    const failed = mobileDevices.length > 0 && failures === mobileDevices.length;
    await prisma.scheduledNotification.update({
      where: { id: notification.id },
      data: {
        status: failed ? "Failed" : "Sent",
        attempts: { increment: 1 },
        sentAt: failed ? null : new Date(),
        error: failed ? "All device deliveries failed" : null,
      },
    });
    output.push({ id: notification.id, status: failed ? "Failed" : "Sent" });
  }
  return output;
}

export async function prunePlatformState() {
  const now = new Date();
  const [sessions, codes, deliveries] = await prisma.$transaction([
    prisma.appSession.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.appAuthCode.deleteMany({ where: { expiresAt: { lte: now } } }),
    prisma.notificationDelivery.deleteMany({
      where: { attemptedAt: { lte: new Date(Date.now() - 90 * 86_400_000) } },
    }),
  ]);
  return { sessions: sessions.count, codes: codes.count, deliveries: deliveries.count };
}
