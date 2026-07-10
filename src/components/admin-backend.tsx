"use client";

import { FormEvent, useMemo, useState } from "react";
import { CheckCircle2, CircleAlert, Database, Home, RefreshCw, Settings } from "lucide-react";
import Link from "next/link";

type AdminSnapshot = {
  user: {
    id: string;
    name: string;
    email: string;
    timezone: string;
    pisScore: number;
    ertBalance: number;
    currentStreak: number;
    continuityCredits: number;
  };
  studyProfile: {
    primaryDiscipline: string;
    preferredFormats: string[];
    preferenceNotes?: string;
  } | null;
  activeDiscipline: {
    label: string;
    formats: string[];
    topics: string[];
    evidenceTypes: string[];
  };
  challengeSettings: {
    track: string;
    durationMinutes: number;
    difficultyFloor: string;
    topicFocus: string;
    recoveryMode: boolean;
    teamMode: boolean;
  };
  latestChallenges: Array<{
    id: string;
    dateKey: string;
    title: string;
    topic: string;
    status: string;
    difficulty: string;
    submissions: number;
    grades: number;
    preferredFormat: string | null;
    createdAt: string;
  }>;
  supportActions: Array<{
    id: string;
    type: string;
    actor: string;
    reason: string | null;
    createdAt: string;
  }>;
};

type AdminOverview = {
  generatedAt: string;
  site: {
    name: string;
    url: string;
    environment: string;
    vercel: boolean;
  };
  counts: {
    users: number;
    studyProfiles: number;
    challenges: number;
    submissions: number;
    submissionAttachments: number;
    grades: number;
    notebookEntries: number;
    friendships: number;
    marketplaceChallenges: number;
    cohortChallenges: number;
    aiJobs: number;
    aiUsage: number;
    sessions: number;
    localSessions: number;
    adminCredentials: number;
  };
  readiness: Array<{
    name: string;
    ok: boolean;
    detail: string;
  }>;
  freshStart: boolean;
};

async function adminRequest<T>(url: string, password: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-support-secret": password,
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    const text = await response.text();
    let message = text || response.statusText;
    try {
      const parsed = JSON.parse(text) as { error?: string };
      message = parsed.error || message;
    } catch {
      // Keep original response text.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

export function AdminBackend() {
  const [password, setPassword] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [lookup, setLookup] = useState("");
  const [reason, setReason] = useState("");
  const [snapshot, setSnapshot] = useState<AdminSnapshot | null>(null);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resetConfirmation, setResetConfirmation] = useState("");
  const lookupQuery = useMemo(() => {
    const trimmed = lookup.trim();
    if (!trimmed) return "";
    return trimmed.includes("@")
      ? `email=${encodeURIComponent(trimmed)}`
      : `userId=${encodeURIComponent(trimmed)}`;
  }, [lookup]);

  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      await adminRequest("/api/admin/session", password);
      const result = await adminRequest<AdminOverview>("/api/admin/overview", password);
      setOverview(result);
      setAuthenticated(true);
      setStatus("Backend unlocked.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadOverview() {
    setBusy(true);
    setStatus("");
    try {
      const result = await adminRequest<AdminOverview>("/api/admin/overview", password);
      setOverview(result);
      setStatus("System overview refreshed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Overview refresh failed");
    } finally {
      setBusy(false);
    }
  }

  async function load(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    if (!lookupQuery) return;
    setBusy(true);
    setStatus("");
    try {
      const result = await adminRequest<AdminSnapshot>(`/api/admin/users?${lookupQuery}`, password);
      setSnapshot(result);
      setStatus("User loaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

  async function action(actionName: "RegenerateTodayChallenge" | "ClearStudyConfiguration") {
    if (!snapshot) return;
    setBusy(true);
    setStatus("");
    try {
      await adminRequest("/api/admin/users/actions", password, {
        method: "POST",
        body: JSON.stringify({
          userId: snapshot.user.id,
          action: actionName,
          reason: reason || undefined,
        }),
      });
      setStatus(actionName === "RegenerateTodayChallenge" ? "Challenge regenerated." : "Configuration cleared.");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      await adminRequest("/api/admin/password", password, {
        method: "POST",
        body: JSON.stringify({ currentPassword: password, newPassword }),
      });
      setPassword(newPassword);
      setNewPassword("");
      setStatus("Backend password changed.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Password change failed");
    } finally {
      setBusy(false);
    }
  }

  async function resetData(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const result = await adminRequest<{
        before: {
          users: number;
          studyProfiles: number;
          challenges: number;
          submissions: number;
          submissionAttachments: number;
          grades: number;
          notebookEntries: number;
          friendships: number;
          aiJobs: number;
          aiUsage: number;
        };
        after: {
          users: number;
          studyProfiles: number;
          challenges: number;
          submissions: number;
          submissionAttachments: number;
          grades: number;
          notebookEntries: number;
          friendships: number;
          aiJobs: number;
          aiUsage: number;
        };
        uploads: { uploadRoot: string };
      }>("/api/admin/reset-data", password, {
        method: "POST",
        body: JSON.stringify({ confirmation: resetConfirmation }),
      });
      setSnapshot(null);
      setLookup("");
      setReason("");
      setResetConfirmation("");
      const refreshed = await adminRequest<AdminOverview>("/api/admin/overview", password);
      setOverview(refreshed);
      setStatus(
        `Reset complete. Users ${result.before.users} -> ${result.after.users}, profiles ${result.before.studyProfiles} -> ${result.after.studyProfiles}, challenges ${result.before.challenges} -> ${result.after.challenges}, submissions ${result.before.submissions} -> ${result.after.submissions}, attachments ${result.before.submissionAttachments} -> ${result.after.submissionAttachments}, grades ${result.before.grades} -> ${result.after.grades}, notes ${result.before.notebookEntries} -> ${result.after.notebookEntries}, friends ${result.before.friendships} -> ${result.after.friendships}, AI jobs ${result.before.aiJobs} -> ${result.after.aiJobs}. Upload storage cleared at ${result.uploads.uploadRoot}.`,
      );
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Reset failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="app-background min-h-screen text-slate-950">
      <nav className="border-b border-cyan-950/10 bg-white/60 backdrop-blur-xl">
        <div className="flex w-full items-center justify-between px-2 py-3 sm:px-3">
          <div className="flex items-center gap-2 text-cyan-800">
            <Settings size={17} />
            <span className="text-sm font-semibold">System</span>
          </div>
          <Link
            href="/"
            className="flex h-9 items-center gap-2 rounded-sm border border-slate-200 bg-white/65 px-3 text-sm font-semibold text-slate-700 hover:border-cyan-700/30 hover:text-cyan-800"
          >
            <Home size={15} />
            Home
          </Link>
        </div>
      </nav>
      <section className="grid w-full gap-4 px-2 py-4 sm:px-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-cyan-800">
            GURUnet backend
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Support console</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Read user configuration, regenerate one unsubmitted daily challenge,
            clear study configuration, or reset the deployment to a clean state.
          </p>
        </div>

        {!authenticated ? (
          <form onSubmit={login} className="quiet-panel grid gap-3 rounded-md p-4">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Backend password
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                placeholder="First run: admin admin"
              />
            </label>
            <button disabled={busy || !password} className="h-10 rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
              Unlock backend
            </button>
            {status && <p className="text-sm font-medium text-cyan-800">{status}</p>}
          </form>
        ) : (
          <>

        {overview && (
          <SystemOverview
            busy={busy}
            overview={overview}
            onRefresh={() => void loadOverview()}
          />
        )}

        <form onSubmit={load} className="quiet-panel grid gap-3 rounded-md p-4">
          <div className="grid gap-3 md:grid-cols-[0.85fr_1fr_auto]">
            <input
              value={lookup}
              onChange={(event) => setLookup(event.target.value)}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              placeholder="User email or id"
            />
            <button disabled={busy || !password || !lookupQuery} className="h-10 rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
              Load
            </button>
          </div>
          {status && <p className="text-sm font-medium text-cyan-800">{status}</p>}
        </form>

        {snapshot && (
          <section className="quiet-panel grid gap-4 rounded-md p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Info label="User" value={`${snapshot.user.name} · ${snapshot.user.email}`} />
              <Info label="Profession" value={snapshot.activeDiscipline.label} />
              <Info label="PIS / ERT" value={`${snapshot.user.pisScore.toFixed(1)} / ${snapshot.user.ertBalance}`} />
              <Info label="Continuity credits" value={String(snapshot.user.continuityCredits)} />
            </div>
            <div className="rounded-md border border-slate-200 bg-white/65 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">Configuration</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                Formats: {snapshot.activeDiscipline.formats.join(", ")}
              </p>
              <p className="text-sm leading-6 text-slate-600">
                Evidence: {snapshot.activeDiscipline.evidenceTypes.join(", ")}
              </p>
              {snapshot.studyProfile?.preferenceNotes && (
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Notes: {snapshot.studyProfile.preferenceNotes}
                </p>
              )}
            </div>
            <div className="grid gap-2">
              {snapshot.latestChallenges.map((challenge) => (
                <div key={challenge.id} className="rounded-md border border-slate-200 bg-white/65 p-3 text-sm">
                  <p className="font-semibold text-slate-900">{challenge.dateKey} · {challenge.title}</p>
                  <p className="mt-1 text-slate-600">
                    {challenge.status} · {challenge.difficulty} · {challenge.preferredFormat ?? "No format"} · submissions {challenge.submissions}
                  </p>
                </div>
              ))}
            </div>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              className="min-h-20 rounded-md border border-slate-300 bg-white p-3 text-sm"
              placeholder="Reason for support action"
            />
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => void action("RegenerateTodayChallenge")} className="h-10 rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
                Regenerate once
              </button>
              <button disabled={busy} onClick={() => void action("ClearStudyConfiguration")} className="h-10 rounded-md border border-orange-300 bg-orange-50 px-4 text-sm font-semibold text-orange-800 disabled:opacity-60">
                Clear configuration
              </button>
            </div>
          </section>
        )}

        <form onSubmit={changePassword} className="quiet-panel grid gap-3 rounded-md p-4">
          <h2 className="text-sm font-semibold text-slate-900">Change backend password</h2>
          <div className="grid gap-3 md:grid-cols-[1fr_auto]">
            <input
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              type="password"
              minLength={8}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              placeholder="New password, minimum 8 characters"
            />
            <button disabled={busy || !password || newPassword.length < 8} className="h-10 rounded-md border border-cyan-700/20 bg-cyan-50 px-4 text-sm font-semibold text-cyan-800 disabled:opacity-60">
              Change
            </button>
          </div>
        </form>

        <form onSubmit={resetData} className="quiet-panel grid gap-3 rounded-md border border-red-200 p-4">
          <div>
            <h2 className="text-sm font-semibold text-red-900">Clean deployment reset</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">
              Wipe all users, sessions, challenges, submissions, grades, notebooks,
              social data, marketplace data, cohorts, AI jobs, and usage records.
              Upload files are removed. Admin credentials and migrations are preserved.
            </p>
          </div>
          <label className="grid gap-1.5 text-sm font-medium text-slate-700">
            Type RESET GURUNET DATA
            <input
              value={resetConfirmation}
              onChange={(event) => setResetConfirmation(event.target.value)}
              className="h-10 rounded-md border border-red-200 bg-white px-3 text-sm"
              placeholder="RESET GURUNET DATA"
            />
          </label>
          <button
            disabled={busy || resetConfirmation !== "RESET GURUNET DATA"}
            className="h-10 w-fit rounded-md bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            Reset application data
          </button>
        </form>
          </>
        )}
      </section>
    </main>
  );
}

function SystemOverview({
  busy,
  onRefresh,
  overview,
}: {
  busy: boolean;
  onRefresh: () => void;
  overview: AdminOverview;
}) {
  const primaryCounts = [
    ["Users", overview.counts.users],
    ["Profiles", overview.counts.studyProfiles],
    ["Challenges", overview.counts.challenges],
    ["Submissions", overview.counts.submissions],
    ["Grades", overview.counts.grades],
    ["Notes", overview.counts.notebookEntries],
  ] as const;
  const secondaryCounts = [
    ["Attachments", overview.counts.submissionAttachments],
    ["Friends", overview.counts.friendships],
    ["Marketplace", overview.counts.marketplaceChallenges],
    ["Cohorts", overview.counts.cohortChallenges],
    ["AI jobs", overview.counts.aiJobs],
    ["AI usage", overview.counts.aiUsage],
    ["Sessions", overview.counts.sessions + overview.counts.localSessions],
    ["Admin creds", overview.counts.adminCredentials],
  ] as const;

  return (
    <section className="quiet-panel grid gap-4 rounded-md p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-cyan-800">
            <Database size={17} />
            <h2 className="text-sm font-semibold text-slate-950">Deployment overview</h2>
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            {overview.site.url} · {overview.site.environment}
            {overview.site.vercel ? " · Vercel" : " · local"}
          </p>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={busy}
          className="flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-60"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {overview.freshStart && (
        <div className="rounded-md border border-cyan-700/15 bg-cyan-50 p-3">
          <p className="text-sm font-semibold text-cyan-950">Fresh deployment state</p>
          <p className="mt-1 text-sm leading-6 text-cyan-900">
            The product database is empty. The next signup will enter onboarding,
            create a study profile, and receive the first daily challenge.
          </p>
        </div>
      )}

      <div className="grid gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {primaryCounts.map(([label, value]) => (
          <Info key={label} label={label} value={String(value)} />
        ))}
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
        {overview.readiness.map((item) => (
          <div key={item.name} className="rounded-md border border-slate-200 bg-white/65 p-3">
            <div className="flex items-center gap-2">
              {item.ok ? (
                <CheckCircle2 size={15} className="text-cyan-700" />
              ) : (
                <CircleAlert size={15} className="text-amber-700" />
              )}
              <p className="text-sm font-semibold text-slate-950">{item.name}</p>
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-600">{item.detail}</p>
          </div>
        ))}
      </div>

      <details className="rounded-md border border-slate-200 bg-white/55">
        <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-slate-800">
          More record counts
        </summary>
        <div className="grid gap-2 border-t border-slate-200 p-3 sm:grid-cols-2 lg:grid-cols-4">
          {secondaryCounts.map(([label, value]) => (
            <Info key={label} label={label} value={String(value)} />
          ))}
        </div>
      </details>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white/65 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-medium text-slate-900">{value}</p>
    </div>
  );
}
