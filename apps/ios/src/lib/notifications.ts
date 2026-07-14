import * as Notifications from "expo-notifications";
import { api } from "@/lib/client";

type ReminderBootstrap = {
  challenge?: { id: string; title: string; deadlineAt: string; status?: string };
  nextChallengeUnlockAt?: string;
  studyProfile?: { restDay?: number } | null;
  preferences?: { challengeAvailable?: boolean; studyWindowReminder?: boolean; deadlineWarning?: boolean; recoveryPreview?: boolean; studyWindowLocalTime?: string; deadlineOffsetMinutes?: number; quietStartLocalTime?: string; quietEndLocalTime?: string } | null;
  schedules?: Array<{ id: string; title: string; daysOfWeek: number[]; localTime: string; durationMinutes: number; reminderMinutesBefore: number; enabled: boolean }>;
};

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function syncIOSNotifications(askForPermission = false, bootstrap?: ReminderBootstrap) {
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted" && askForPermission) {
    permission = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: false },
    });
  }
  if (permission.status !== "granted") return false;
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID;
  const token = (await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined)).data;
  await api.request("/devices", {
    method: "PATCH",
    body: JSON.stringify({
      pushToken: token,
      notificationsEnabled: true,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    }),
  });
  if (bootstrap) await scheduleIOSLearningReminders(bootstrap);
  return true;
}

export async function disableIOSNotifications() {
  await api.request("/devices", {
    method: "PATCH",
    body: JSON.stringify({ pushToken: null, notificationsEnabled: false }),
  });
  await clearGurunetReminders();
}

async function clearGurunetReminders() {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(scheduled.filter((request) => request.content.data?.owner === "gurunet").map((request) => Notifications.cancelScheduledNotificationAsync(request.identifier)));
}

async function scheduleIOSLearningReminders(data: ReminderBootstrap) {
  await clearGurunetReminders();
  const preferences = data.preferences ?? {};
  const restDay = data.studyProfile?.restDay;
  const now = Date.now();
  const nextUnlock = data.nextChallengeUnlockAt ? new Date(data.nextChallengeUnlockAt) : null;
  if (preferences.challengeAvailable !== false && nextUnlock && nextUnlock.getTime() > now && nextUnlock.getDay() !== restDay) {
    await Notifications.scheduleNotificationAsync({ content: { title: "Your GURUnet challenge window is open", body: "Start when your schedule allows; the challenge is ready on arrival.", data: { owner: "gurunet", route: "today" } }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nextUnlock } });
  }
  const challenge = data.challenge;
  if (challenge && challenge.status !== "RestDay" && preferences.deadlineWarning !== false) {
    const warningAt = new Date(new Date(challenge.deadlineAt).getTime() - (preferences.deadlineOffsetMinutes ?? 60) * 60_000);
    if (warningAt.getTime() > now) await Notifications.scheduleNotificationAsync({ content: { title: "Challenge window closing", body: "Submit the strongest defensible version you have; unfinished work can still be useful.", data: { owner: "gurunet", route: "today" } }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: warningAt } });
  }
  const today = new Date();
  const hasBlockToday = (data.schedules ?? []).some((schedule) => schedule.enabled && schedule.daysOfWeek.includes(today.getDay()));
  if (challenge && challenge.status !== "RestDay" && !hasBlockToday && preferences.studyWindowReminder !== false) {
    const [hour, minute] = (preferences.studyWindowLocalTime ?? "10:00").split(":").map(Number);
    const studyAt = new Date(); studyAt.setHours(hour, minute, 0, 0);
    const clock = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    if (studyAt.getTime() > now && studyAt < new Date(challenge.deadlineAt) && !isQuietTime(clock, preferences.quietStartLocalTime ?? "21:00", preferences.quietEndLocalTime ?? "07:00")) await Notifications.scheduleNotificationAsync({ content: { title: "Your study window is open", body: `A focused block on “${challenge.title}” is ready when you are.`, data: { owner: "gurunet", route: "today" } }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: studyAt } });
  }
  if (challenge?.status === "RestDay" && preferences.recoveryPreview !== false) {
    const previewAt = new Date(); previewAt.setHours(18, 0, 0, 0);
    if (previewAt.getTime() > now) await Notifications.scheduleNotificationAsync({ content: { title: "Tomorrow’s learning rhythm", body: "Your next session includes one normal challenge and one short retrieval task. Nothing is due today.", data: { owner: "gurunet", route: "settings" } }, trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: previewAt } });
  }
  const earliestByDay = new Map<number, NonNullable<ReminderBootstrap["schedules"]>[number]>();
  for (const schedule of data.schedules ?? []) for (const day of schedule.daysOfWeek) {
    if (!schedule.enabled) continue;
    const current = earliestByDay.get(day);
    if (!current || schedule.localTime < current.localTime) earliestByDay.set(day, schedule);
  }
  for (const [day, schedule] of earliestByDay) {
    if (day === restDay) continue;
    const [hour, minute] = schedule.localTime.split(":").map(Number);
    const total = hour * 60 + minute - schedule.reminderMinutesBefore;
    const minuteOfDay = (total + 1440) % 1440;
    const reminderDay = (day + (total < 0 ? 6 : 0)) % 7;
    const clock = `${String(Math.floor(minuteOfDay / 60)).padStart(2, "0")}:${String(minuteOfDay % 60).padStart(2, "0")}`;
    if (isQuietTime(clock, preferences.quietStartLocalTime ?? "21:00", preferences.quietEndLocalTime ?? "07:00")) continue;
    await Notifications.scheduleNotificationAsync({ content: { title: schedule.title, body: `${schedule.durationMinutes} protected minutes are available. Starting a little late still counts.`, data: { owner: "gurunet", route: "today", scheduleId: schedule.id } }, trigger: { type: Notifications.SchedulableTriggerInputTypes.WEEKLY, weekday: reminderDay + 1, hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60 } });
  }
}

function isQuietTime(time: string, start: string, end: string) { return start === end ? false : start < end ? time >= start && time < end : time >= start || time < end; }
