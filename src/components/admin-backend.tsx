"use client";

import { FormEvent, useMemo, useState } from "react";

type AdminSnapshot = {
  user: {
    id: string;
    name: string;
    email: string;
    timezone: string;
    pisScore: number;
    ertBalance: number;
    currentStreak: number;
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
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [newPassword, setNewPassword] = useState("");
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
      setAuthenticated(true);
      setStatus("Backend unlocked.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Login failed");
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

  return (
    <main className="app-background min-h-screen text-slate-950">
      <section className="grid w-full gap-4 px-2 py-4 sm:px-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-800">
            GURUnet backend
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Support console</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Read user configuration, regenerate one unsubmitted daily challenge,
            or clear study configuration.
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
            <button disabled={busy || !password} className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
              Unlock backend
            </button>
            {status && <p className="text-sm font-medium text-teal-800">{status}</p>}
          </form>
        ) : (
          <>

        <form onSubmit={load} className="quiet-panel grid gap-3 rounded-md p-4">
          <div className="grid gap-3 md:grid-cols-[0.85fr_1fr_auto]">
            <input
              value={lookup}
              onChange={(event) => setLookup(event.target.value)}
              className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              placeholder="User email or id"
            />
            <button disabled={busy || !password || !lookupQuery} className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
              Load
            </button>
          </div>
          {status && <p className="text-sm font-medium text-teal-800">{status}</p>}
        </form>

        {snapshot && (
          <section className="quiet-panel grid gap-4 rounded-md p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Info label="User" value={`${snapshot.user.name} · ${snapshot.user.email}`} />
              <Info label="Profession" value={snapshot.activeDiscipline.label} />
              <Info label="PIS / ERT" value={`${snapshot.user.pisScore.toFixed(1)} / ${snapshot.user.ertBalance}`} />
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
              <button disabled={busy} onClick={() => void action("RegenerateTodayChallenge")} className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
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
            <button disabled={busy || !password || newPassword.length < 8} className="h-10 rounded-md border border-teal-700/20 bg-teal-50 px-4 text-sm font-semibold text-teal-800 disabled:opacity-60">
              Change
            </button>
          </div>
        </form>
          </>
        )}
      </section>
    </main>
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
