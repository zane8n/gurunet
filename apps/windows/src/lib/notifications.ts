import {
  isPermissionGranted,
  cancel,
  pending,
  requestPermission,
  Schedule,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { api } from "./client";

type InboxNotification = {
  id: string;
  title: string;
  body: string;
};

const seenKey = "gurunet.windows.notifications.seen";
const scheduledKey = "gurunet.windows.notifications.scheduled";

export type WindowsReminderBootstrap = {
  challenge?: { id: string; title: string; deadlineAt: string; status?: string };
  nextChallengeUnlockAt?: string;
  studyProfile?: { restDay?: number } | null;
  preferences?: { challengeAvailable?: boolean; studyWindowReminder?: boolean; deadlineWarning?: boolean; recoveryPreview?: boolean; studyWindowLocalTime?: string; deadlineOffsetMinutes?: number; quietStartLocalTime?: string; quietEndLocalTime?: string } | null;
  schedules?: Array<{ id: string; title: string; daysOfWeek: number[]; localTime: string; durationMinutes: number; reminderMinutesBefore: number; enabled: boolean }>;
};

export async function enableWindowsNotifications() {
  let granted = await isPermissionGranted();
  if (!granted) granted = (await requestPermission()) === "granted";
  await api.request("/devices", {
    method: "PATCH",
    body: JSON.stringify({ notificationsEnabled: granted }),
  });
  return granted;
}

export async function pollWindowsNotifications() {
  if (!(await isPermissionGranted())) return;
  const result = await api.request<{ notifications: InboxNotification[] }>("/notifications/inbox");
  const stored = localStorage.getItem(seenKey);
  const seen = new Set<string>(stored ? JSON.parse(stored) as string[] : []);
  const unseen = result.notifications.filter((item) => !seen.has(item.id));
  localStorage.setItem(seenKey, JSON.stringify(result.notifications.slice(0, 60).map((item) => item.id)));
  if (!stored) return;
  for (const notification of unseen.slice(0, 3).reverse()) {
    sendNotification({ title: notification.title, body: notification.body });
  }
}

export async function syncWindowsLearningReminders(data: WindowsReminderBootstrap) {
  if (!(await isPermissionGranted())) return;
  const storedIds = JSON.parse(localStorage.getItem(scheduledKey) ?? "[]") as number[];
  const activeIds = new Set((await pending()).map((item) => item.id));
  const cancellable = storedIds.filter((id) => activeIds.has(id));
  if (cancellable.length) await cancel(cancellable);
  const ids: number[] = [];
  const preferences = data.preferences ?? {};
  const restDay = data.studyProfile?.restDay;
  const now = Date.now();
  const nextUnlock = data.nextChallengeUnlockAt ? new Date(data.nextChallengeUnlockAt) : null;
  if (preferences.challengeAvailable !== false && nextUnlock && nextUnlock.getTime() > now && nextUnlock.getDay() !== restDay) {
    const id = reminderId("next-challenge"); ids.push(id);
    sendNotification({ id, title: "Your GURUnet challenge window is open", body: "Start when your schedule allows; the challenge is ready on arrival.", schedule: Schedule.at(nextUnlock), group: "gurunet" });
  }
  if (data.challenge && data.challenge.status !== "RestDay" && preferences.deadlineWarning !== false) {
    const warningAt = new Date(new Date(data.challenge.deadlineAt).getTime() - (preferences.deadlineOffsetMinutes ?? 60) * 60_000);
    if (warningAt.getTime() > now) {
      const id = reminderId(`deadline:${data.challenge.id}`); ids.push(id);
      sendNotification({ id, title: "Challenge window closing", body: "Submit the strongest defensible version you have; unfinished work can still be useful.", schedule: Schedule.at(warningAt), group: "gurunet" });
    }
  }
  const today = new Date();
  const hasBlockToday = (data.schedules ?? []).some((schedule) => schedule.enabled && schedule.daysOfWeek.includes(today.getDay()));
  if (data.challenge && data.challenge.status !== "RestDay" && !hasBlockToday && preferences.studyWindowReminder !== false) {
    const [hour, minute] = (preferences.studyWindowLocalTime ?? "10:00").split(":").map(Number);
    const studyAt = new Date(); studyAt.setHours(hour, minute, 0, 0);
    const clock = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
    if (studyAt.getTime() > now && studyAt < new Date(data.challenge.deadlineAt) && !isQuietTime(clock, preferences.quietStartLocalTime ?? "21:00", preferences.quietEndLocalTime ?? "07:00")) {
      const id = reminderId(`study:${data.challenge.id}`); ids.push(id);
      sendNotification({ id, title: "Your study window is open", body: `A focused block on “${data.challenge.title}” is ready when you are.`, schedule: Schedule.at(studyAt), group: "gurunet" });
    }
  }
  if (data.challenge?.status === "RestDay" && preferences.recoveryPreview !== false) {
    const previewAt = new Date(); previewAt.setHours(18, 0, 0, 0);
    if (previewAt.getTime() > now) { const id = reminderId(`recovery:${previewAt.toISOString().slice(0, 10)}`); ids.push(id); sendNotification({ id, title: "Tomorrow’s learning rhythm", body: "Your next session includes one normal challenge and one short retrieval task. Nothing is due today.", schedule: Schedule.at(previewAt), group: "gurunet" }); }
  }
  const earliestByDay = new Map<number, NonNullable<WindowsReminderBootstrap["schedules"]>[number]>();
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
    const id = reminderId(`block:${schedule.id}:${day}`); ids.push(id);
    sendNotification({ id, title: schedule.title, body: `${schedule.durationMinutes} protected minutes are available. Starting a little late still counts.`, schedule: Schedule.interval({ weekday: reminderDay + 1, hour: Math.floor(minuteOfDay / 60), minute: minuteOfDay % 60 }), group: "gurunet" });
  }
  localStorage.setItem(scheduledKey, JSON.stringify(ids));
}

function reminderId(value: string) { let hash = 0; for (const character of value) hash = (Math.imul(31, hash) + character.charCodeAt(0)) | 0; return Math.abs(hash % 2_000_000_000) || 1; }
function isQuietTime(time: string, start: string, end: string) { return start === end ? false : start < end ? time >= start && time < end : time >= start || time < end; }
