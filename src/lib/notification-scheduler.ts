import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/store";
import {
  addDaysToDateKey,
  challengeUnlockIso,
  dateKeyFor,
  localDateTimeIso,
  weekdayForDateKey,
} from "@/lib/time";

export const notificationKinds = {
  challengeAvailable: "challenge_available",
  studyWindow: "study_window",
  deadlineWarning: "deadline_warning",
  correctionReady: "correction_ready",
  recoveryPreview: "recovery_preview",
  connectionInvitation: "connection_invitation",
  studyBlock: "study_block",
} as const;

type NotificationKind = (typeof notificationKinds)[keyof typeof notificationKinds];

const defaultPreferences = {
  challengeAvailable: true,
  studyWindowReminder: true,
  deadlineWarning: true,
  correctionReady: true,
  recoveryPreview: true,
  socialInvitations: false,
  studyWindowLocalTime: "10:00",
  deadlineOffsetMinutes: 60,
};

export function localDateTime(dateKey: string, localTime: string, timezone: string) {
  const [hour, minute] = localTime.split(":").map(Number);
  return new Date(localDateTimeIso(dateKey, timezone, hour, minute));
}

function addDays(dateKey: string, days: number) {
  return addDaysToDateKey(dateKey, days);
}

function weekDay(dateKey: string) {
  return weekdayForDateKey(dateKey);
}

export async function queueUserNotification(input: {
  userId: string;
  kind: NotificationKind;
  dedupeKey: string;
  title: string;
  body: string;
  scheduledFor: Date;
  deepLink?: string;
  payload?: Record<string, string | number | boolean | null>;
}) {
  return prisma.scheduledNotification.upsert({
    where: { dedupeKey: input.dedupeKey },
    update: {
      title: input.title,
      body: input.body,
      scheduledFor: input.scheduledFor,
      deepLink: input.deepLink,
      payload: input.payload,
    },
    create: {
      id: createId("ntf"),
      userId: input.userId,
      kind: input.kind,
      dedupeKey: input.dedupeKey,
      title: input.title,
      body: input.body,
      scheduledFor: input.scheduledFor,
      deepLink: input.deepLink,
      payload: input.payload,
    },
  });
}

export async function syncUserNotificationSchedule(
  userId: string,
  horizonDays = 14,
  replaceFuture = false,
) {
  const now = new Date();
  const [user, preference, schedules, challenges] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, studyProfile: { select: { restDay: true } } },
    }),
    prisma.notificationPreference.findUnique({ where: { userId } }),
    prisma.studySchedule.findMany({
      where: { userId, enabled: true },
      orderBy: [{ localTime: "asc" }, { createdAt: "asc" }],
    }),
    prisma.challenge.findMany({
      where: {
        userId,
        deadlineAt: { gte: new Date(now.getTime() - 12 * 60 * 60_000) },
        status: { in: ["Active", "Late", "RecoveryChallenge", "PressureChallenge", "RestDay"] },
      },
      orderBy: { createdAt: "desc" },
      take: 3,
    }),
  ]);
  if (!user) return { scheduled: 0 };
  const prefs = { ...defaultPreferences, ...(preference ?? {}) };
  const futureKinds = [
    notificationKinds.challengeAvailable,
    notificationKinds.studyWindow,
    notificationKinds.deadlineWarning,
    notificationKinds.recoveryPreview,
    notificationKinds.studyBlock,
  ];
  if (replaceFuture) {
    await prisma.scheduledNotification.deleteMany({
      where: {
        userId,
        kind: { in: futureKinds },
        status: "Queued",
        scheduledFor: { gt: now },
      },
    });
  }

  let scheduled = 0;
  for (const challenge of challenges) {
    const payload = { challengeId: challenge.id, route: "today" };
    const availableAt = new Date(challengeUnlockIso(challenge.dateKey, user.timezone));
    const generatedNearRelease = challenge.createdAt.getTime() <= availableAt.getTime() + 30 * 60_000;
    const assessmentDay = challenge.status !== "RestDay";
    const hasScheduledBlock = schedules.some((schedule) =>
      schedule.oneOffAt
        ? dateKeyFor(schedule.oneOffAt, schedule.timezone || user.timezone) === challenge.dateKey
        : schedule.daysOfWeek.includes(weekDay(challenge.dateKey)),
    );
    if (
      assessmentDay &&
      prefs.challengeAvailable &&
      generatedNearRelease &&
      availableAt.getTime() > now.getTime() - 30 * 60_000
    ) {
      await queueUserNotification({
        userId,
        kind: notificationKinds.challengeAvailable,
        dedupeKey: `challenge-ready:${challenge.id}`,
        title: "Today’s GURUnet challenge is ready",
        body: challenge.title,
        scheduledFor: availableAt > now ? availableAt : now,
        deepLink: "https://gurunet.uk/?section=daily-challenge",
        payload,
      });
      scheduled += 1;
    }

    const studyAt = localDateTime(challenge.dateKey, prefs.studyWindowLocalTime, user.timezone);
    if (
      assessmentDay &&
      !hasScheduledBlock &&
      prefs.studyWindowReminder &&
      studyAt > now &&
      studyAt < challenge.deadlineAt
    ) {
      await queueUserNotification({
        userId,
        kind: notificationKinds.studyWindow,
        dedupeKey: `study-window:${challenge.id}:${prefs.studyWindowLocalTime}`,
        title: "Your study window is open",
        body: `A focused block on “${challenge.title}” is ready when you are.`,
        scheduledFor: studyAt,
        deepLink: "https://gurunet.uk/?section=daily-challenge",
        payload,
      });
      scheduled += 1;
    }

    const warningAt = new Date(challenge.deadlineAt.getTime() - prefs.deadlineOffsetMinutes * 60_000);
    if (assessmentDay && prefs.deadlineWarning && warningAt > now) {
      await queueUserNotification({
        userId,
        kind: notificationKinds.deadlineWarning,
        dedupeKey: `deadline-warning:${challenge.id}:${prefs.deadlineOffsetMinutes}`,
        title: "Challenge window closing",
        body: `${prefs.deadlineOffsetMinutes} minutes remain. Submit what is defensible; unfinished work can still be useful.`,
        scheduledFor: warningAt,
        deepLink: "https://gurunet.uk/?section=daily-challenge",
        payload,
      });
      scheduled += 1;
    }

    if (prefs.recoveryPreview && challenge.status === "RestDay") {
      const previewAt = localDateTime(challenge.dateKey, "18:00", user.timezone);
      if (previewAt > now) {
        await queueUserNotification({
          userId,
          kind: notificationKinds.recoveryPreview,
          dedupeKey: `recovery-preview:${challenge.id}`,
          title: "Tomorrow’s learning rhythm",
          body: "Your next session includes one normal challenge and one short retrieval task. No work is due today.",
          scheduledFor: previewAt,
          deepLink: "https://gurunet.uk/account#learning-rhythm",
          payload: { route: "settings" },
        });
        scheduled += 1;
      }
    }
  }

  const startKey = dateKeyFor(now, user.timezone);
  const scheduledBlockDates = new Set<string>();
  for (const schedule of schedules) {
    if (schedule.oneOffAt) {
      const oneOffDateKey = dateKeyFor(schedule.oneOffAt, schedule.timezone || user.timezone);
      if (weekDay(oneOffDateKey) === user.studyProfile?.restDay || scheduledBlockDates.has(oneOffDateKey)) {
        continue;
      }
      const reminderAt = new Date(
        schedule.oneOffAt.getTime() - schedule.reminderMinutesBefore * 60_000,
      );
      if (reminderAt > now) {
        await queueUserNotification({
          userId,
          kind: notificationKinds.studyBlock,
          dedupeKey: `study-block:${schedule.id}:once`,
          title: schedule.title,
          body: `Your ${schedule.durationMinutes}-minute one-off study block starts soon.`,
          scheduledFor: reminderAt,
          deepLink: "https://gurunet.uk/?section=daily-challenge",
          payload: { route: "today", scheduleId: schedule.id },
        });
        scheduled += 1;
        scheduledBlockDates.add(oneOffDateKey);
      }
      continue;
    }
    for (let offset = 0; offset < Math.max(1, Math.min(horizonDays, 28)); offset += 1) {
      const dateKey = addDays(startKey, offset);
      if (!schedule.daysOfWeek.includes(weekDay(dateKey))) continue;
      if (weekDay(dateKey) === user.studyProfile?.restDay || scheduledBlockDates.has(dateKey)) continue;
      const startAt = localDateTime(dateKey, schedule.localTime, schedule.timezone || user.timezone);
      const reminderAt = new Date(startAt.getTime() - schedule.reminderMinutesBefore * 60_000);
      if (reminderAt <= now) continue;
      await queueUserNotification({
        userId,
        kind: notificationKinds.studyBlock,
        dedupeKey: `study-block:${schedule.id}:${dateKey}`,
        title: schedule.title,
        body: schedule.flexWindowMinutes > 0
          ? `Your ${schedule.durationMinutes}-minute block starts soon. A ${schedule.flexWindowMinutes}-minute flexible start window is built in.`
          : `Your ${schedule.durationMinutes}-minute focused block starts in ${schedule.reminderMinutesBefore} minutes.`,
        scheduledFor: reminderAt,
        deepLink: "https://gurunet.uk/?section=daily-challenge",
        payload: { route: "today", scheduleId: schedule.id },
      });
      scheduled += 1;
      scheduledBlockDates.add(dateKey);
    }
  }
  return { scheduled };
}

export async function materializeNotificationSchedules(limit = 100) {
  const users = await prisma.user.findMany({
    where: {
      OR: [
        { notificationPreference: { isNot: null } },
        { studySchedules: { some: { enabled: true } } },
        { deviceInstallations: { some: { revokedAt: null, notificationsEnabled: true } } },
      ],
    },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
    take: Math.max(1, Math.min(limit, 250)),
  });
  const results: PromiseSettledResult<{ scheduled: number }>[] = [];
  for (let index = 0; index < users.length; index += 10) {
    results.push(...await Promise.allSettled(
      users.slice(index, index + 10).map((user) => syncUserNotificationSchedule(user.id, 8)),
    ));
  }
  return {
    users: users.length,
    scheduled: results.reduce(
      (total, result) => total + (result.status === "fulfilled" ? result.value.scheduled : 0),
      0,
    ),
    failed: results.filter((result) => result.status === "rejected").length,
  };
}
