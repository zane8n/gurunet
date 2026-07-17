"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Clock3,
  Download,
  Loader2,
  LocateFixed,
  Moon,
  Palette,
  ShieldCheck,
  Sun,
  Trash2,
  UserRound,
} from "lucide-react";
import type { User } from "@/lib/domain";
import {
  initialPalette,
  paletteStorageKey,
  themePalettes,
  type ThemePaletteId,
} from "@/lib/theme-palettes";

type SafeUser = Omit<User, "passwordHash">;

type LearnerPreferences = {
  studyProfile: {
    primaryDiscipline: string;
    rankedTopics: string[];
    preferredFormats: string[];
    restDay: number;
  } | null;
  challenge: {
    track: string;
    durationMinutes: number;
    difficultyFloor: string;
    topicFocus: string | null;
    recoveryMode: boolean;
    teamMode: boolean;
  };
  notifications: {
    challengeAvailable: boolean;
    studyWindowReminder: boolean;
    deadlineWarning: boolean;
    correctionReady: boolean;
    recoveryPreview: boolean;
    socialInvitations: boolean;
    studyWindowLocalTime: string;
    deadlineOffsetMinutes: number;
    quietStartLocalTime: string;
    quietEndLocalTime: string;
  };
  social: {
    discoverable: boolean;
    allowEmailInvites: boolean;
  };
  schedules: Array<{
    id: string;
    title: string;
    daysOfWeek: number[];
    localTime: string;
    durationMinutes: number;
    reminderMinutesBefore: number;
    flexWindowMinutes: number;
    timezone: string;
    enabled: boolean;
  }>;
};

const weekDays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const difficultyOptions = ["Guided", "Normal", "Advanced", "Production", "Expert"];

async function accountRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: init?.cache ?? "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Johannesburg",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    try {
      const parsed = JSON.parse(text) as { error?: string | { message?: string }; message?: string };
      const message = typeof parsed.error === "string" ? parsed.error : parsed.error?.message ?? parsed.message;
      throw new Error(message || text || response.statusText);
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error(text || response.statusText);
      throw error;
    }
  }
  return response.json() as Promise<T>;
}

export function AccountSettingsPage() {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("");
  const [deviceTimezone, setDeviceTimezone] = useState("Africa/Johannesburg");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [palette, setPalette] = useState<ThemePaletteId>(() => initialPalette());
  const [themeMode, setThemeMode] = useState<"light" | "dark">("light");
  const [preferences, setPreferences] = useState<LearnerPreferences | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState("");
  const [browserNotificationState, setBrowserNotificationState] = useState<
    "unsupported" | NotificationPermission
  >("unsupported");

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try {
        setDeviceTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Johannesburg");
      } catch {
        setDeviceTimezone("Africa/Johannesburg");
      }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setThemeMode(localStorage.getItem("gurunet.theme.v1") === "dark" ? "dark" : "light");
      setBrowserNotificationState("Notification" in window ? Notification.permission : "unsupported");
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    try {
      document.documentElement.classList.toggle("dark", themeMode === "dark");
      document.documentElement.dataset.palette = palette;
      localStorage.setItem(paletteStorageKey, palette);
    } catch {
      document.documentElement.dataset.palette = palette;
    }
  }, [palette, themeMode]);

  useEffect(() => {
    async function load() {
      try {
        const session = await accountRequest<{ user: SafeUser | null }>("/api/auth/session");
        if (!session.user) {
          window.location.assign("/");
          return;
        }
        const storedPreferences = await accountRequest<LearnerPreferences>("/api/me/preferences");
        setUser(session.user);
        setName(session.user.name);
        setTimezone(session.user.timezone);
        setPreferences(storedPreferences);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to load account.");
      } finally {
        setBusy(false);
      }
    }
    void load();
  }, []);

  function applyTheme(mode: "light" | "dark") {
    setThemeMode(mode);
    document.documentElement.classList.toggle("dark", mode === "dark");
    localStorage.setItem("gurunet.theme.v1", mode);
    setMessage(`${mode === "dark" ? "Dark" : "Light"} appearance applied.`);
  }

  async function patchPreferences(input: Record<string, unknown>, successMessage: string) {
    setBusy(true);
    setMessage("");
    try {
      const updated = await accountRequest<LearnerPreferences>("/api/me/preferences", {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      setPreferences(updated);
      setMessage(successMessage);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Preference update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function saveLearningPreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await patchPreferences({
      restDay: Number(form.get("restDay")),
      challenge: {
        durationMinutes: Number(form.get("durationMinutes")),
        difficultyFloor: String(form.get("difficultyFloor")),
        topicFocus: String(form.get("topicFocus") ?? ""),
        recoveryMode: form.get("recoveryMode") === "on",
        teamMode: form.get("teamMode") === "on",
      },
    }, "Learning rhythm updated. Rest-day changes apply to the active weekly schedule.");
  }

  async function saveNotificationPreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await patchPreferences({
      notifications: {
        challengeAvailable: form.get("challengeAvailable") === "on",
        studyWindowReminder: form.get("studyWindowReminder") === "on",
        deadlineWarning: form.get("deadlineWarning") === "on",
        correctionReady: form.get("correctionReady") === "on",
        recoveryPreview: form.get("recoveryPreview") === "on",
        socialInvitations: form.get("socialInvitations") === "on",
        studyWindowLocalTime: String(form.get("studyWindowLocalTime")),
        deadlineOffsetMinutes: Number(form.get("deadlineOffsetMinutes")),
        quietStartLocalTime: String(form.get("quietStartLocalTime")),
        quietEndLocalTime: String(form.get("quietEndLocalTime")),
      },
    }, "Reminder and notification preferences updated.");
  }

  async function savePrivacyPreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    await patchPreferences({
      social: {
        discoverable: form.get("discoverable") === "on",
        allowEmailInvites: form.get("allowEmailInvites") === "on",
      },
    }, "Connection privacy updated.");
  }

  async function addStudySchedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    setBusy(true);
    setMessage("");
    try {
      await accountRequest("/api/v1/schedules", {
        method: "POST",
        body: JSON.stringify({
          title: String(form.get("title")),
          daysOfWeek: form.getAll("daysOfWeek").map(Number),
          localTime: String(form.get("localTime")),
          durationMinutes: Number(form.get("durationMinutes")),
          reminderMinutesBefore: Number(form.get("reminderMinutesBefore")),
          flexWindowMinutes: Number(form.get("flexWindowMinutes")),
          timezone,
          enabled: true,
        }),
      });
      const updated = await accountRequest<LearnerPreferences>("/api/me/preferences");
      setPreferences(updated);
      target.reset();
      setMessage("Study block scheduled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to schedule the study block.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteStudySchedule(id: string) {
    setBusy(true);
    try {
      await accountRequest(`/api/v1/schedules/${id}`, { method: "DELETE" });
      setPreferences((current) => current
        ? { ...current, schedules: current.schedules.filter((schedule) => schedule.id !== id) }
        : current);
      setMessage("Study block removed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove the study block.");
    } finally {
      setBusy(false);
    }
  }

  async function toggleStudySchedule(id: string, enabled: boolean) {
    setBusy(true);
    try {
      await accountRequest(`/api/v1/schedules/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      setPreferences((current) => current
        ? {
            ...current,
            schedules: current.schedules.map((schedule) =>
              schedule.id === id ? { ...schedule, enabled } : schedule,
            ),
          }
        : current);
      setMessage(enabled ? "Study block resumed." : "Study block paused. Its reminders are off.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to update the study block.");
    } finally {
      setBusy(false);
    }
  }

  async function enableBrowserNotifications() {
    if (!("Notification" in window)) {
      setMessage("This browser does not support system notifications.");
      return;
    }
    const permission = await Notification.requestPermission();
    setBrowserNotificationState(permission);
    setMessage(permission === "granted"
      ? "Browser alerts enabled while GURUnet is open."
      : "Browser alerts remain off; in-app reminders still appear.");
  }

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const result = await accountRequest<{ user: SafeUser }>("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ name, timezone }),
      });
      setUser(result.user);
      setMessage("Account details updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await accountRequest<{ user: SafeUser }>("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password update failed.");
    } finally {
      setBusy(false);
    }
  }

  async function exportLearningRecord() {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/me/export", { cache: "no-store" });
      if (!response.ok) throw new Error(await response.text());
      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const filename =
        /filename="([^"]+)"/.exec(disposition)?.[1] ??
        `gurunet-learning-export-${new Date().toISOString().slice(0, 10)}.json`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setMessage("Learning export downloaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Learning export failed.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await accountRequest<{ ok: true }>("/api/me", {
        method: "DELETE",
        body: JSON.stringify({ confirmation, password: deletePassword }),
      });
      window.location.assign("/");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account deletion failed.");
    } finally {
      setBusy(false);
    }
  }

  const initial = user?.name?.trim()?.[0];
  const activeStudyBlocks = preferences?.schedules.filter((schedule) => schedule.enabled) ?? [];
  const plannedWeeklyMinutes = activeStudyBlocks.reduce(
    (total, schedule) => total + schedule.durationMinutes * schedule.daysOfWeek.length,
    0,
  );
  const restDayLabel = weekDays[preferences?.studyProfile?.restDay ?? 0];

  return (
    <main className="app-background min-h-screen text-slate-950">
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex w-full max-w-[1080px] items-center justify-between px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <Image src="/gurunet.svg" alt="GURUnet" width={40} height={40} className="size-10 rounded-md" priority />
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-stone-500">GURUnet</p>
              <h1 className="text-base font-semibold text-stone-950 sm:text-lg">Account</h1>
            </div>
          </Link>
          <Link
            href="/"
            className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            <ChevronLeft size={15} />
            Home
          </Link>
        </div>
      </header>

      <section className="mx-auto grid w-full max-w-[1080px] gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-slate-500">Account and data controls</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">Your GURUnet profile</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600">
              Manage the details attached to your learning record, export your data, or permanently remove the account.
            </p>
          </div>
          <div className="flex items-center gap-3 rounded-full border border-slate-200 bg-white/70 p-2 pr-4">
            <span className="grid size-10 place-items-center rounded-full bg-slate-950 text-sm font-semibold uppercase text-white">
              {initial ?? <UserRound size={17} />}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-950">{user?.name ?? "Loading"}</p>
              <p className="truncate text-xs text-slate-500">{user?.email ?? ""}</p>
            </div>
          </div>
        </div>

        {message && (
          <p className="rounded-md border border-slate-200 bg-white/70 px-3 py-2 text-sm text-slate-700">
            {message}
          </p>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,0.42fr)]">
          <div className="grid gap-4">
            <section className="rounded-md border border-slate-200 bg-white/72 p-5">
              <p className="text-sm font-semibold text-slate-950">Profile details</p>
              <form onSubmit={saveDetails} className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                  Name
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    minLength={2}
                    maxLength={80}
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/15"
                    required
                  />
                </label>
                <div className="grid gap-1.5 text-sm font-medium text-slate-700">
                  <label htmlFor="account-timezone">Timezone</label>
                  <div className="flex min-w-0 gap-2">
                    <input
                      id="account-timezone"
                      value={timezone}
                      onChange={(event) => setTimezone(event.target.value)}
                      minLength={3}
                      maxLength={80}
                      className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/15"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setTimezone(deviceTimezone)}
                      className="grid size-10 shrink-0 place-items-center rounded-md border border-slate-300 bg-white text-cyan-700 hover:bg-slate-50"
                      title={`Use device timezone: ${deviceTimezone}`}
                      aria-label={`Use device timezone ${deviceTimezone}`}
                    >
                      <LocateFixed size={16} />
                    </button>
                  </div>
                  <span className="text-xs font-normal text-slate-500">Device timezone: {deviceTimezone}</span>
                </div>
                <p className="text-xs leading-5 text-slate-500 sm:col-span-2">
                  Email changes need a verification flow, so they stay locked until that route is added.
                </p>
                <button disabled={busy} className="h-10 w-fit rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
                  {busy ? <Loader2 className="inline animate-spin" size={15} /> : "Save details"}
                </button>
              </form>
            </section>

            {preferences && (
              <section id="learning-rhythm" className="rounded-md border border-slate-200 bg-white/72 p-5">
                <div className="flex items-start gap-3">
                  <CalendarDays className="mt-0.5 text-cyan-700" size={18} />
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Learning rhythm</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      Set the weekly break and defaults used when the next personal challenge is generated.
                    </p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 divide-x divide-slate-200 border-y border-slate-200 py-3 text-center">
                  <div className="px-2">
                    <p className="font-mono text-lg font-semibold text-slate-950">{Math.round(plannedWeeklyMinutes / 6) / 10}h</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">protected weekly</p>
                  </div>
                  <div className="px-2">
                    <p className="font-mono text-lg font-semibold text-slate-950">{activeStudyBlocks.length}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">active blocks</p>
                  </div>
                  <div className="px-2">
                    <p className="truncate text-sm font-semibold text-slate-950">{restDayLabel}</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">weekly reset</p>
                  </div>
                </div>
                <form onSubmit={saveLearningPreferences} className="mt-4 grid gap-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                      Weekly rest day
                      <select name="restDay" defaultValue={preferences.studyProfile?.restDay ?? 0} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
                        {weekDays.map((day, index) => <option key={day} value={index}>{day}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                      Target duration
                      <input name="durationMinutes" type="number" min={15} max={180} defaultValue={preferences.challenge.durationMinutes} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" />
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                      Difficulty floor
                      <select name="difficultyFloor" defaultValue={preferences.challenge.difficultyFloor} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
                        {difficultyOptions.map((item) => <option key={item}>{item}</option>)}
                      </select>
                    </label>
                    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                      Topic focus
                      <select name="topicFocus" defaultValue={preferences.challenge.topicFocus ?? ""} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
                        <option value="">Rotate profile topics</option>
                        {preferences.studyProfile?.rankedTopics.map((topic) => <option key={topic}>{topic}</option>)}
                      </select>
                    </label>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <SettingToggle
                      name="recoveryMode"
                      defaultChecked={preferences.challenge.recoveryMode}
                      title="Targeted reinforcement"
                      text="Add one governed recovery task to the next generated challenge."
                    />
                    <SettingToggle
                      name="teamMode"
                      defaultChecked={preferences.challenge.teamMode}
                      title="Cohort-ready mode"
                      text="Prefer challenge settings that can also work in a shared cohort."
                    />
                  </div>
                  <p className="text-xs leading-5 text-slate-500">
                    Rest days carry no submission penalty. The next learning day includes the normal challenge and one shorter, rotating reinforcement task.
                  </p>
                  <button disabled={busy} className="h-10 w-fit rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
                    Save learning rhythm
                  </button>
                </form>
              </section>
            )}

            {preferences && (
              <section className="rounded-md border border-slate-200 bg-white/72 p-5">
                <div className="flex items-start gap-3">
                  <Bell className="mt-0.5 text-cyan-700" size={18} />
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Notifications</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">Choose useful interruptions and define the hours in which GURUnet should stay quiet.</p>
                  </div>
                </div>
                <form onSubmit={saveNotificationPreferences} className="mt-4 grid gap-4">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <SettingToggle name="challengeAvailable" defaultChecked={preferences.notifications.challengeAvailable} title="Challenge ready" text="Notify when the 08:00 challenge is available." />
                    <SettingToggle name="studyWindowReminder" defaultChecked={preferences.notifications.studyWindowReminder} title="Study window" text="One reminder at your preferred working time." />
                    <SettingToggle name="deadlineWarning" defaultChecked={preferences.notifications.deadlineWarning} title="Deadline warning" text="One warning while the challenge is incomplete." />
                    <SettingToggle name="correctionReady" defaultChecked={preferences.notifications.correctionReady} title="Correction ready" text="Notify when teaching feedback is available." />
                    <SettingToggle name="recoveryPreview" defaultChecked={preferences.notifications.recoveryPreview} title="Recovery preview" text="Preview rest-day follow-up and reinforcement." />
                    <SettingToggle name="socialInvitations" defaultChecked={preferences.notifications.socialInvitations} title="Connection invitations" text="Off by default; notify for incoming requests." />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <TimeField name="studyWindowLocalTime" label="Study reminder" value={preferences.notifications.studyWindowLocalTime} />
                    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                      Deadline warning
                      <select name="deadlineOffsetMinutes" defaultValue={preferences.notifications.deadlineOffsetMinutes} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
                        <option value={30}>30 minutes before</option>
                        <option value={60}>1 hour before</option>
                        <option value={120}>2 hours before</option>
                        <option value={180}>3 hours before</option>
                        <option value={360}>6 hours before</option>
                      </select>
                    </label>
                    <TimeField name="quietStartLocalTime" label="Quiet hours start" value={preferences.notifications.quietStartLocalTime} />
                    <TimeField name="quietEndLocalTime" label="Quiet hours end" value={preferences.notifications.quietEndLocalTime} />
                  </div>
                  <div className="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3">
                    <button
                      type="button"
                      onClick={() => void enableBrowserNotifications()}
                      disabled={browserNotificationState === "granted"}
                      className="h-9 rounded-md border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 disabled:border-emerald-200 disabled:bg-emerald-50 disabled:text-emerald-700"
                    >
                      {browserNotificationState === "granted" ? "Browser alerts enabled" : "Enable browser alerts"}
                    </button>
                    <p className="text-xs text-slate-500">Native apps receive background alerts; web alerts appear while GURUnet is open.</p>
                  </div>
                  <button disabled={busy} className="h-10 w-fit rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white disabled:opacity-60">Save notifications</button>
                </form>
              </section>
            )}

            {preferences && (
              <section className="rounded-md border border-slate-200 bg-white/72 p-5">
                <div className="flex items-start gap-3">
                  <Clock3 className="mt-0.5 text-cyan-700" size={18} />
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Study blocks</p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">Protect realistic working windows. Each block can start flexibly and can be paused without deleting it.</p>
                  </div>
                </div>
                <form onSubmit={addStudySchedule} className="mt-4 grid gap-3">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    <label className="grid gap-1.5 text-sm font-medium text-slate-700">Label<input name="title" required minLength={2} maxLength={80} placeholder="Evening practice" className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" /></label>
                    <TimeField name="localTime" label="Start time" value="18:00" />
                    <label className="grid gap-1.5 text-sm font-medium text-slate-700">Minutes<input name="durationMinutes" type="number" min={10} max={240} defaultValue={45} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" /></label>
                    <label className="grid gap-1.5 text-sm font-medium text-slate-700">Remind before<select name="reminderMinutesBefore" defaultValue={10} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"><option value={0}>At start</option><option value={5}>5 minutes</option><option value={10}>10 minutes</option><option value={15}>15 minutes</option><option value={30}>30 minutes</option></select></label>
                    <label className="grid gap-1.5 text-sm font-medium text-slate-700">Flexible start<select name="flexWindowMinutes" defaultValue={30} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"><option value={0}>Exact time</option><option value={15}>15-minute window</option><option value={30}>30-minute window</option><option value={60}>1-hour window</option></select></label>
                  </div>
                  <fieldset>
                    <legend className="text-sm font-medium text-slate-700">Recurring days</legend>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {weekDays.map((day, index) => (
                        <label key={day} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700">
                          <input type="checkbox" name="daysOfWeek" value={index} defaultChecked={index >= 1 && index <= 5} /> {day.slice(0, 3)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <button disabled={busy} className="h-10 w-fit rounded-md border border-cyan-700/25 bg-cyan-50 px-4 text-sm font-semibold text-cyan-800 disabled:opacity-60">Add study block</button>
                </form>
                {preferences.schedules.length > 0 && (
                  <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
                    {preferences.schedules.map((schedule) => (
                      <div key={schedule.id} className={`flex items-center justify-between gap-4 py-3 ${schedule.enabled ? "" : "opacity-55"}`}>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-950">{schedule.title}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{schedule.daysOfWeek.map((day) => weekDays[day]?.slice(0, 3)).join(", ")} at {schedule.localTime} · {schedule.durationMinutes} min · {schedule.flexWindowMinutes} min flex</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button type="button" onClick={() => void toggleStudySchedule(schedule.id, !schedule.enabled)} className="h-9 rounded-md px-3 text-xs font-semibold text-slate-600 hover:bg-slate-100">{schedule.enabled ? "Pause" : "Resume"}</button>
                          <button type="button" onClick={() => void deleteStudySchedule(schedule.id)} aria-label={`Remove ${schedule.title}`} className="grid size-9 place-items-center rounded-md text-slate-500 hover:bg-red-50 hover:text-red-700"><Trash2 size={15} /></button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}

            <section className="rounded-md border border-slate-200 bg-white/72 p-5">
              <div className="flex items-center gap-2">
                <Palette size={17} className="text-cyan-700" />
                <p className="text-sm font-semibold text-slate-950">Color palette</p>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Choose a preset visual tone. Manual colors stay locked so the platform remains consistent.
              </p>
              <div className="mt-4 inline-flex rounded-md border border-slate-200 bg-white p-1" aria-label="Appearance mode">
                <button type="button" onClick={() => applyTheme("light")} className={`inline-flex h-9 items-center gap-2 rounded px-3 text-sm font-semibold ${themeMode === "light" ? "bg-slate-950 text-white" : "text-slate-600"}`}><Sun size={15} /> Light</button>
                <button type="button" onClick={() => applyTheme("dark")} className={`inline-flex h-9 items-center gap-2 rounded px-3 text-sm font-semibold ${themeMode === "dark" ? "bg-slate-950 text-white" : "text-slate-600"}`}><Moon size={15} /> Dark</button>
              </div>
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {themePalettes.map((item) => {
                  const selected = palette === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        setPalette(item.id);
                        setMessage(`${item.label} palette applied.`);
                      }}
                      className={`grid gap-3 rounded-md border p-3 text-left transition-colors ${
                        selected
                          ? "border-cyan-700/35 bg-cyan-50"
                          : "border-slate-200 bg-white/70 hover:border-slate-300"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold text-slate-950">{item.label}</span>
                        {selected && <CheckCircle2 size={15} className="text-cyan-700" />}
                      </span>
                      <span className="text-xs leading-5 text-slate-500">{item.description}</span>
                      <span className="flex gap-1.5">
                        {item.swatches.map((swatch) => (
                          <span
                            key={swatch}
                            className="size-5 rounded-full border border-slate-200"
                            style={{ backgroundColor: swatch }}
                          />
                        ))}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="rounded-md border border-slate-200 bg-white/72 p-5">
              <p className="text-sm font-semibold text-slate-950">Password</p>
              <form onSubmit={changePassword} className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                  Current password
                  <input
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/15"
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                  New password
                  <input
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    type="password"
                    minLength={8}
                    maxLength={160}
                    autoComplete="new-password"
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/15"
                    required
                  />
                </label>
                <button disabled={busy} className="h-10 w-fit rounded-md border border-cyan-700/20 bg-cyan-50 px-4 text-sm font-semibold text-cyan-800 disabled:opacity-60">
                  Change password
                </button>
              </form>
            </section>
          </div>

          <aside className="grid h-fit gap-4">
            {preferences && (
              <section className="rounded-md border border-slate-200 bg-white/72 p-5">
                <div className="flex items-center gap-2">
                  <ShieldCheck size={17} className="text-cyan-700" />
                  <p className="text-sm font-semibold text-slate-950">Connection privacy</p>
                </div>
                <form onSubmit={savePrivacyPreferences} className="mt-4 grid gap-3">
                  <SettingToggle name="discoverable" defaultChecked={preferences.social.discoverable} title="Profile suggestions" text="Show a limited profile to compatible learners. Off by default." />
                  <SettingToggle name="allowEmailInvites" defaultChecked={preferences.social.allowEmailInvites} title="Email invitations" text="Let people who know your exact email send a private invitation." />
                  <button disabled={busy} className="h-10 rounded-md border border-cyan-700/25 bg-cyan-50 px-4 text-sm font-semibold text-cyan-800 disabled:opacity-60">Save privacy</button>
                </form>
              </section>
            )}

            <section className="rounded-md border border-slate-200 bg-white/72 p-5">
              <p className="text-sm font-semibold text-slate-950">Data export</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Download a machine-readable copy of your learning record.
              </p>
              <button
                type="button"
                onClick={() => void exportLearningRecord()}
                className="mt-4 flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
              >
                <Download size={15} />
                Export data
              </button>
            </section>

            <section className="rounded-md border border-red-200 bg-red-50 p-5">
              <p className="text-sm font-semibold text-red-950">Delete account</p>
              <p className="mt-2 text-sm leading-6 text-red-800">
                Permanently removes your account, sessions, study profile, challenges, submissions, grades, notebook entries, social records, and local uploaded files.
              </p>
              <form onSubmit={deleteAccount} className="mt-4 grid gap-3">
                <label className="grid gap-1.5 text-sm font-medium text-red-900">
                  Type DELETE
                  <input
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    className="h-10 rounded-md border border-red-200 bg-white px-3 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/15"
                    required
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-medium text-red-900">
                  Password if applicable
                  <input
                    value={deletePassword}
                    onChange={(event) => setDeletePassword(event.target.value)}
                    type="password"
                    autoComplete="current-password"
                    className="h-10 rounded-md border border-red-200 bg-white px-3 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/15"
                  />
                </label>
                <button disabled={busy || confirmation !== "DELETE"} className="h-10 rounded-md bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
                  Permanently delete
                </button>
              </form>
            </section>
          </aside>
        </div>
      </section>
    </main>
  );
}

function SettingToggle({
  defaultChecked,
  name,
  text,
  title,
}: {
  defaultChecked: boolean;
  name: string;
  text: string;
  title: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-md border border-slate-200 bg-white/65 px-3 py-2.5">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} className="mt-1" />
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-slate-900">{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-slate-500">{text}</span>
      </span>
    </label>
  );
}

function TimeField({ label, name, value }: { label: string; name: string; value: string }) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
      {label}
      <input name={name} type="time" defaultValue={value} required className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" />
    </label>
  );
}
