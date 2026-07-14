import { getOrCreateTodayChallenge } from "@/lib/app-service";
import { fromDbUser } from "@/lib/db-mappers";
import { notificationKinds, queueUserNotification, syncUserNotificationSchedule } from "@/lib/notification-scheduler";
import { prisma } from "@/lib/prisma";
import { challengeDateKeyFor, localHourFor } from "@/lib/time";

export async function prepareDailyChallenges(limit = 3) {
  const now = new Date();
  const users = await prisma.user.findMany({
    where: { studyProfile: { is: { completedAt: { not: null } } } },
    orderBy: { updatedAt: "desc" },
    take: 250,
  });
  const releaseWindow = users.filter((user) => {
    const hour = localHourFor(now, user.timezone);
    return hour >= 8 && hour < 10;
  });
  if (releaseWindow.length === 0) return { eligible: 0, prepared: 0, failed: 0 };

  const recentChallenges = await prisma.challenge.findMany({
    where: {
      userId: { in: releaseWindow.map((user) => user.id) },
      createdAt: { gte: new Date(now.getTime() - 36 * 60 * 60_000) },
    },
    select: { userId: true, dateKey: true },
  });
  const existing = new Set(recentChallenges.map((challenge) => `${challenge.userId}:${challenge.dateKey}`));
  const candidates = releaseWindow
    .filter((user) => !existing.has(`${user.id}:${challengeDateKeyFor(now, user.timezone)}`))
    .slice(0, Math.max(1, Math.min(limit, 5)));

  const results = await Promise.allSettled(candidates.map(async (dbUser) => {
    const challenge = await getOrCreateTodayChallenge(fromDbUser(dbUser));
    await syncUserNotificationSchedule(dbUser.id);
    if (challenge.status !== "RestDay") {
      await queueUserNotification({
        userId: dbUser.id,
        kind: notificationKinds.challengeAvailable,
        dedupeKey: `challenge-ready:${challenge.id}`,
        title: "Today’s GURUnet challenge is ready",
        body: challenge.title,
        scheduledFor: new Date(),
        deepLink: "https://gurunet.uk/?section=daily-challenge",
        payload: { challengeId: challenge.id, route: "today" },
      });
    }
    return challenge.id;
  }));

  return {
    eligible: candidates.length,
    prepared: results.filter((result) => result.status === "fulfilled").length,
    failed: results.filter((result) => result.status === "rejected").length,
  };
}
