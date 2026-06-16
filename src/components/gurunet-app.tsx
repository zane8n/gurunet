"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent, FormEvent, ReactNode } from "react";
import {
  AlertTriangle,
  BookOpenText,
  Bold,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Code2,
  FileText,
  Flame,
  Heading2,
  ImagePlus,
  Italic,
  KeyRound,
  LinkIcon,
  List as ListIcon,
  ListOrdered,
  Loader2,
  LockKeyhole,
  LogOut,
  Medal,
  NotebookTabs,
  ShieldCheck,
  Store,
  Trophy,
  UserPlus,
  Users,
  WalletCards,
} from "lucide-react";
import type {
  Challenge,
  Grade,
  NotebookEntry,
  Redemption,
  Submission,
  User,
} from "@/lib/domain";
import {
  formatBytes,
  parseSubmissionContent,
  type SubmissionAttachment,
} from "@/lib/submission-content";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type SafeUser = Omit<User, "passwordHash">;

type ProgressRow = {
  id: string;
  date: string;
  challenge: string;
  difficulty: string;
  status: string;
  finalScore: number | null;
  pis: number;
  ertEarned: number;
  ertBalance: number;
  mainWeakness: string;
  nextFocus: string;
};

type PublicProfile = {
  id: string;
  name: string;
  handle: string;
  pisScore: number;
  ertBalance: number;
  currentStreak: number;
  challengeCount: number;
  latestScore: number | null;
  isFriend: boolean;
  isYou: boolean;
};

type LeaderboardRow = PublicProfile & {
  rank: number;
};

type MarketplaceItem = {
  id: string;
  title: string;
  topic: string;
  difficulty: string;
  summary: string;
  estimatedMinutes: number;
  enrollmentCount: number;
  isEnrolled: boolean;
};

type SocialSnapshot = {
  friends: PublicProfile[];
  profiles: PublicProfile[];
  leaderboard: LeaderboardRow[];
  marketplace: MarketplaceItem[];
  enrollments: { id: string; marketplaceChallengeId: string; createdAt: string }[];
};

type Dashboard = {
  user: SafeUser;
  today: Challenge;
  nextChallengeUnlockAt: string;
  todaySubmission: Submission | null;
  todayGrade: Grade | null;
  progress: ProgressRow[];
  notebookEntries: NotebookEntry[];
  redemptions: Redemption[];
  social: SocialSnapshot;
};

type AuthMode = "login" | "signup";

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
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
      // Keep the original response text when the body is not JSON.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

const sampleSubmission = `Hypothesis:
The most likely fault is a trunk/native VLAN inconsistency or STP instability introduced during the access switch reload. I would not start by changing endpoint or firewall policy because the symptom began after switching maintenance and the logs already point at topology changes.

First checks:
1. show interfaces trunk on the access and upstream switch. This verifies whether VLAN 30 is allowed and whether the native VLAN differs. A mismatch here would directly support the fault path.
2. show spanning-tree detail for VLAN 30. I want topology change counters, root port state, and whether the affected access switch is unexpectedly influencing the tree.
3. show mac address-table dynamic vlan 30. MAC movement or learning over the wrong trunk would prove the issue is in switching, not the application.

Risk and rollback:
Do not clear STP or reload devices during business hours. If a trunk fix is needed, schedule the minimal native/allowed VLAN correction and keep the previous trunk config ready for rollback.

Recommendation:
Correct the trunk mismatch only after both sides are captured, then verify stable STP counters, MAC learning, and user application reachability.`;

export function GurunetApp() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [authMode, setAuthMode] = useState<AuthMode>("signup");
  const [authError, setAuthError] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [responseOpen, setResponseOpen] = useState(false);
  const [draftBody, setDraftBody] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<SubmissionAttachment[]>([]);
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [verification, setVerification] = useState("");

  const user = dashboard?.user;
  const today = dashboard?.today;
  const todaySubmission = dashboard?.todaySubmission;
  const todayGrade = dashboard?.todayGrade ?? null;
  const nextChallengeUnlockAt = dashboard?.nextChallengeUnlockAt;
  const draftKey = today ? `gurunet-response:${today.id}` : "";
  const hasDraft = draftBody.trim().length > 0 || draftAttachments.length > 0;

  useEffect(() => {
    async function bootstrap() {
      try {
        const session = await apiRequest<{ user: SafeUser | null }>("/api/auth/session");
        if (session.user) {
          const data = await apiRequest<Dashboard>("/api/me/stats");
          setDashboard(data);
        } else {
          setDashboard(null);
        }
      } catch (error) {
        console.error("Session bootstrap failed", error);
        setDashboard(null);
      }
    }

    void bootstrap();
  }, []);

  async function loadDashboard() {
    const data = await apiRequest<Dashboard>("/api/me/stats");
    setDashboard(data);
    setVerification("");
  }

  useEffect(() => {
    if (!draftKey) return;
    const stored = window.localStorage.getItem(draftKey);
    if (!stored) {
      window.setTimeout(() => {
        setDraftBody("");
        setDraftAttachments([]);
        setDraftSavedAt("");
      }, 0);
      return;
    }

    try {
      const parsed = JSON.parse(stored) as {
        body?: string;
        attachments?: SubmissionAttachment[];
        savedAt?: string;
      };
      window.setTimeout(() => {
        setDraftBody(parsed.body ?? "");
        setDraftAttachments(Array.isArray(parsed.attachments) ? parsed.attachments : []);
        setDraftSavedAt(parsed.savedAt ?? "");
      }, 0);
    } catch {
      window.setTimeout(() => {
        setDraftBody("");
        setDraftAttachments([]);
        setDraftSavedAt("");
      }, 0);
    }
  }, [draftKey]);

  useEffect(() => {
    if (!draftKey || todaySubmission) return;
    const savedAt = draftSavedAt || new Date().toISOString();
    window.localStorage.setItem(
      draftKey,
      JSON.stringify({
        body: draftBody,
        attachments: draftAttachments,
        savedAt,
      }),
    );
  }, [draftAttachments, draftBody, draftKey, draftSavedAt, todaySubmission]);

  async function handleAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAuthError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const name = String(form.get("name") || "").trim();

    if (!email.includes("@")) {
      setAuthError("Enter a valid email address.");
      return;
    }
    if (authMode === "signup" && name.length < 2) {
      setAuthError("Name must be at least 2 characters.");
      return;
    }
    if (authMode === "signup" && password.length < 8) {
      setAuthError("Password must be at least 8 characters.");
      return;
    }
    if (authMode === "login" && password.length === 0) {
      setAuthError("Enter your password.");
      return;
    }

    setBusy(true);
    const body =
      authMode === "signup"
        ? {
            name,
            email,
            password,
            timezone: String(form.get("timezone") || "Africa/Johannesburg"),
          }
        : {
            email,
            password,
          };

    try {
      await apiRequest(authMode === "signup" ? "/api/auth/signup" : "/api/auth/login", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await loadDashboard();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await apiRequest("/api/auth/logout", { method: "POST" });
    setDashboard(null);
  }

  async function submitAnswer() {
    if (!today || !hasDraft) return;
    setBusy(true);
    setStatus("");
    try {
      const attachmentIds = await uploadDraftAttachments(draftAttachments);
      await apiRequest(`/api/challenges/${today.id}/submit`, {
        method: "POST",
        body: JSON.stringify({ content: draftBody, attachmentIds }),
      });
      if (draftKey) window.localStorage.removeItem(draftKey);
      await loadDashboard();
      setResponseOpen(false);
      setDraftBody("");
      setDraftAttachments([]);
      setStatus("Submission saved. Grade it when verification is complete.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  }

  async function uploadDraftAttachments(attachments: SubmissionAttachment[]) {
    if (attachments.length === 0) return [];
    const form = new FormData();
    for (const attachment of attachments) {
      if (!attachment.dataUrl) continue;
      const response = await fetch(attachment.dataUrl);
      const blob = await response.blob();
      form.append("files", new File([blob], attachment.name, { type: attachment.type }));
    }
    const response = await fetch("/api/uploads", {
      method: "POST",
      body: form,
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || "Upload failed");
    }
    const data = (await response.json()) as {
      attachments: { id: string }[];
    };
    return data.attachments.map((attachment) => attachment.id);
  }

  async function addDraftFiles(files: FileList | File[]) {
    const nextFiles = Array.from(files);
    if (nextFiles.length === 0) return;
    const currentSize = draftAttachments.reduce((total, item) => total + item.size, 0);
    const incomingSize = nextFiles.reduce((total, item) => total + item.size, 0);
    if (draftAttachments.length + nextFiles.length > 8) {
      setStatus("Keep attachments to 8 files or fewer for one submission.");
      return;
    }
    if (nextFiles.some((file) => file.size > 2.5 * 1024 * 1024)) {
      setStatus("Each attachment must be 2.5 MB or smaller.");
      return;
    }
    if (currentSize + incomingSize > 8 * 1024 * 1024) {
      setStatus("Total attachments must stay under 8 MB.");
      return;
    }

    const attachments = await Promise.all(nextFiles.map(readAttachment));
    setDraftAttachments((items) => [...items, ...attachments]);
    setDraftSavedAt(new Date().toISOString());
    setStatus("");
  }

  function removeDraftAttachment(id: string) {
    setDraftAttachments((items) => items.filter((item) => item.id !== id));
    setDraftSavedAt(new Date().toISOString());
  }

  function updateDraftBody(value: string) {
    setDraftBody(value);
    setDraftSavedAt(new Date().toISOString());
  }

  function loadSampleAnswer() {
    setDraftBody(sampleSubmission);
    setDraftSavedAt(new Date().toISOString());
    setResponseOpen(true);
  }

  async function answerVerification() {
    if (!todaySubmission || !verification.trim()) return;
    setBusy(true);
    try {
      await apiRequest(`/api/submissions/${todaySubmission.id}/verification`, {
        method: "POST",
        body: JSON.stringify({ answer: verification }),
      });
      await loadDashboard();
      setStatus("Verification recorded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Verification failed");
    } finally {
      setBusy(false);
    }
  }

  async function gradeSubmission() {
    if (!todaySubmission) return;
    setBusy(true);
    try {
      await apiRequest(`/api/submissions/${todaySubmission.id}/grade`, { method: "POST" });
      await loadDashboard();
      setStatus("Challenge graded. PIS, ERT, progress, and notebook updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Grading failed");
    } finally {
      setBusy(false);
    }
  }

  async function redeem(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest("/api/ert/redeem", {
        method: "POST",
        body: JSON.stringify({
          rewardName: String(form.get("rewardName") || ""),
          cost: Number(form.get("cost") || 0),
          date: String(form.get("date") || ""),
          note: String(form.get("note") || ""),
        }),
      });
      event.currentTarget.reset();
      await loadDashboard();
      setStatus("ERT redemption logged.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Redemption failed");
    } finally {
      setBusy(false);
    }
  }

  async function addFriend(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest("/api/social/friends", {
        method: "POST",
        body: JSON.stringify({ email: String(form.get("email") || "") }),
      });
      event.currentTarget.reset();
      await loadDashboard();
      setStatus("Friend added to your public profile graph.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Friend lookup failed");
    } finally {
      setBusy(false);
    }
  }

  async function enrollMarketplace(challengeId: string) {
    setBusy(true);
    setStatus("");
    try {
      await apiRequest("/api/marketplace/enroll", {
        method: "POST",
        body: JSON.stringify({ challengeId }),
      });
      await loadDashboard();
      setStatus("Enrollment saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Enrollment failed");
    } finally {
      setBusy(false);
    }
  }

  const deadline = useMemo(
    () =>
      today
        ? new Intl.DateTimeFormat("en-ZA", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "short",
          }).format(new Date(today.deadlineAt))
        : "",
    [today],
  );
  const nextUnlock = useMemo(
    () =>
      nextChallengeUnlockAt
        ? new Intl.DateTimeFormat("en-ZA", {
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "short",
          }).format(new Date(nextChallengeUnlockAt))
        : "",
    [nextChallengeUnlockAt],
  );

  if (!dashboard || !user || !today) {
    return (
      <main className="app-background min-h-screen text-slate-950">
        <AppHeader />
        <section className="soft-enter mx-auto grid w-full max-w-6xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="flex flex-col justify-center rounded-md px-1 py-4">
            <p className="w-fit rounded-md border border-teal-700/20 bg-teal-50 px-3 py-1 font-mono text-xs uppercase tracking-[0.16em] text-teal-800">
              Personal engineering discipline
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-normal sm:text-5xl">
              Daily practical challenges with strict scoring and real consequences.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              GURUnet tracks challenge submissions, missed days, PIS, ERT,
              recovery work, redemptions, and a reusable engineering notebook.
            </p>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Metric icon={<CircleGauge size={18} />} label="PIS starts" value="50" />
              <Metric icon={<CalendarClock size={18} />} label="Deadline" value="12:00" />
              <Metric icon={<LockKeyhole size={18} />} label="Solutions" value="Locked" />
            </div>
          </div>

          <form
            onSubmit={handleAuth}
            className="glass-panel interactive-lift rounded-md p-5"
          >
            <div className="flex rounded-md bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setAuthMode("signup")}
                className={`interactive-lift flex h-10 flex-1 items-center justify-center gap-2 rounded-md text-sm font-semibold ${authMode === "signup" ? "bg-white text-teal-800 shadow-sm" : "text-slate-600"}`}
              >
                <UserPlus size={16} />
                Sign up
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("login")}
                className={`interactive-lift flex h-10 flex-1 items-center justify-center gap-2 rounded-md text-sm font-semibold ${authMode === "login" ? "bg-white text-teal-800 shadow-sm" : "text-slate-600"}`}
              >
                <KeyRound size={16} />
                Login
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              {authMode === "signup" && (
                <Field label="Name" name="name" placeholder="Network Engineer" />
              )}
              <Field label="Email" name="email" placeholder="you@example.com" type="email" />
              <Field label="Password" name="password" placeholder="Minimum 8 characters" type="password" />
              {authMode === "signup" && (
                <Field label="Timezone" name="timezone" defaultValue="Africa/Johannesburg" />
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                window.location.assign("/api/auth/google");
              }}
              className="interactive-lift mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm"
            >
              <GoogleMark />
              Continue with Google
            </button>

            {authError && (
              <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                {authError}
              </p>
            )}

            <button
              disabled={busy}
              className="interactive-lift mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white shadow-sm shadow-teal-900/15 disabled:opacity-60"
            >
              {busy ? <Loader2 className="animate-spin" size={16} /> : <ChevronRight size={16} />}
              Enter GURUnet
            </button>
          </form>
        </section>
        <Footer />
      </main>
    );
  }

  return (
    <main className="app-background min-h-screen text-slate-950">
      <AppHeader user={user} onLogout={logout} />

      <section className="soft-enter border-b border-teal-950/10">
        <div className="mx-auto w-full max-w-7xl px-5 py-6 sm:px-8">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <StatusPill status={today.status} />
            <span className="rounded-md border border-teal-700/15 bg-white/70 px-3 py-1 font-mono text-xs uppercase tracking-[0.14em] text-teal-800">
              {today.dateKey} · {today.difficulty}
            </span>
            <span className="rounded-md border border-amber-700/15 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              Due {deadline}
            </span>
          </div>

          <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
            <article className="glass-panel rounded-md p-5">
              <p className="text-sm font-semibold text-teal-800">{today.topic}</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-normal">
                {today.title}
              </h1>
              <p className="mt-3 max-w-5xl leading-7 text-slate-600">
                {today.scenario}
              </p>

              <div className="mt-5 border-t border-slate-200 pt-4">
                <h2 className="text-xl font-semibold">Objective</h2>
                <p className="mt-2 leading-7 text-slate-600">{today.objective}</p>
              </div>

              <ChallengeAccordions challenge={today} />

              <SubmissionControl
                busy={busy}
                draftSavedAt={draftSavedAt}
                hasDraft={hasDraft}
                onOpen={() => setResponseOpen(true)}
                onSample={loadSampleAnswer}
                status={status}
                submission={todaySubmission ?? null}
                grade={todayGrade}
                verification={verification}
                setVerification={setVerification}
                onVerify={answerVerification}
                onGrade={gradeSubmission}
              />
            </article>

            <Panel icon={<ShieldCheck size={19} />} title="Solution gate">
              {todayGrade ? (
                <p className="text-sm leading-6 text-slate-600">{today.solution}</p>
              ) : (
                <p className="text-sm leading-6 text-slate-600">
                  The solution remains hidden until submission and grading are complete.
                </p>
              )}
            </Panel>
          </div>
        </div>
      </section>

      <section className="border-b border-teal-950/10 bg-white/25">
        <div className="mx-auto grid w-full max-w-7xl gap-5 px-5 py-6 sm:px-8">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ScoreMeter value={user.pisScore} label="PIS" />
            <Metric icon={<Trophy size={18} />} label="ERT balance" value={String(user.ertBalance)} />
            <Metric icon={<Flame size={18} />} label="Current streak" value={`${user.currentStreak} days`} />
            <Metric icon={<CalendarClock size={18} />} label="Next challenge" value={nextUnlock} />
          </div>

          <div className="grid gap-5 lg:grid-cols-[0.95fr_1.05fr]">
            <Panel icon={<CircleGauge size={19} />} title="Discipline pulse">
              <FrequencyPolygon rows={dashboard.progress} />
            </Panel>
            <Panel icon={<CalendarClock size={19} />} title="Discipline map">
              <ActivityGrid rows={dashboard.progress} />
            </Panel>
            <Panel icon={<AlertTriangle size={19} />} title="Penalty engine">
              <List
                items={[
                  "Missed challenge: 0/20, -1 PIS, streak reset.",
                  "After 16:00: no PIS growth and no ERT.",
                  "Unsafe answer: score cap and no rewards.",
                  "Two misses in a week: PIS gain cap reduced.",
                ]}
              />
            </Panel>
            {todayGrade ? (
              <GradeSummary grade={todayGrade} />
            ) : (
              <Panel icon={<FileText size={19} />} title="Daily scoresheet">
                <p className="text-sm leading-6 text-slate-600">
                  The scoresheet appears here after grading.
                </p>
              </Panel>
            )}
          </div>

          <ProgressPanel rows={dashboard.progress} />
        </div>
      </section>

      <section>
        <div className="mx-auto grid w-full max-w-7xl gap-5 px-5 py-6 sm:px-8">
          <SocialPanel
            social={dashboard.social}
            busy={busy}
            onAddFriend={addFriend}
            onEnroll={enrollMarketplace}
          />
          <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
            <RewardPanel busy={busy} onRedeem={redeem} />
            <NotebookPanel entries={dashboard.notebookEntries} redemptions={dashboard.redemptions} />
          </div>
        </div>
      </section>

      <ResponseEditorModal
        attachments={draftAttachments}
        body={draftBody}
        busy={busy}
        open={responseOpen}
        savedAt={draftSavedAt}
        onAddFiles={addDraftFiles}
        onBodyChange={updateDraftBody}
        onOpenChange={setResponseOpen}
        onRemoveAttachment={removeDraftAttachment}
        onSubmit={submitAnswer}
      />
      <Footer />
    </main>
  );
}

function GoogleMark() {
  return (
    <Image
      src="/google_icon.png"
      alt=""
      width={20}
      height={20}
      aria-hidden="true"
    />
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = status.includes("Missed")
    ? "border-red-200 bg-red-50 text-red-700"
    : status.includes("Late")
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : status.includes("Recovery")
        ? "border-sky-200 bg-sky-50 text-sky-800"
        : "border-teal-200 bg-teal-50 text-teal-800";

  return (
    <span className={`rounded-md border px-3 py-1 text-xs font-semibold ${tone}`}>
      {status}
    </span>
  );
}

function ScoreMeter({ value, label }: { value: number; label: string }) {
  const clamped = Math.max(0, Math.min(100, value));
  const tone =
    clamped >= 70
      ? "text-teal-800"
      : clamped >= 45
        ? "text-slate-800"
        : "text-amber-800";
  return (
    <div className="rounded-md border border-teal-950/10 bg-white/60 p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {label}
          </p>
          <p className={`mt-1 text-4xl font-semibold ${tone}`}>{clamped.toFixed(1)}</p>
        </div>
        <span className="mb-1 rounded-md border border-teal-700/15 bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800">
          {clamped >= 70 ? "Strong" : clamped >= 45 ? "Stable" : "Recovery"}
        </span>
      </div>
      <div className="mt-4 h-2 rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-teal-700"
          style={{ width: `${clamped}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[10px] font-medium text-slate-500">
        <span>0</span>
        <span>50</span>
        <span>100</span>
      </div>
    </div>
  );
}

function ActivityGrid({ rows }: { rows: ProgressRow[] }) {
  const cells = Array.from({ length: 28 }, (_, index) => rows[index]);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
          Discipline map
        </p>
        <p className="text-xs text-slate-500">recent work</p>
      </div>
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: "repeat(14, minmax(0, 1fr))" }}
      >
        {cells.map((row, index) => (
          <span
            key={`${row?.id ?? "empty"}-${index}`}
            title={row ? `${row.date}: ${row.status}` : "No record"}
            className={`size-3 rounded-[3px] transition-transform hover:scale-125 ${
              row
                ? row.finalScore && row.finalScore >= 15
                  ? "bg-teal-700"
                  : row.status.includes("Missed")
                    ? "bg-red-400"
                    : "bg-teal-200"
                : "bg-slate-200/80"
            }`}
          />
        ))}
      </div>
    </div>
  );
}

function FrequencyPolygon({ rows }: { rows: ProgressRow[] }) {
  const bins = [
    { label: "0-4", min: 0, max: 4 },
    { label: "5-8", min: 5, max: 8 },
    { label: "9-12", min: 9, max: 12 },
    { label: "13-16", min: 13, max: 16 },
    { label: "17-20", min: 17, max: 20 },
  ];
  const graded = rows
    .map((row) => row.finalScore)
    .filter((score): score is number => typeof score === "number");
  const frequencies = bins.map(
    (bin) => graded.filter((score) => score >= bin.min && score <= bin.max).length,
  );
  const max = Math.max(1, ...frequencies);
  const width = 260;
  const height = 116;
  const padX = 18;
  const padY = 18;
  const points = frequencies.map((count, index) => {
    const x = padX + (index / (bins.length - 1)) * (width - padX * 2);
    const y = height - padY - (count / max) * (height - padY * 2);
    return { x, y, count };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");

  return (
    <div className="grid gap-4">
      <div className="rounded-md border border-teal-950/10 bg-white/50 p-3">
        {graded.length === 0 ? (
          <p className="grid h-28 place-items-center text-sm text-slate-500">
            No graded attempts yet.
          </p>
        ) : (
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="h-32 w-full"
            role="img"
            aria-label="Final score frequency polygon"
          >
            <line
              x1={padX}
              x2={width - padX}
              y1={height - padY}
              y2={height - padY}
              stroke="rgba(15,23,42,0.18)"
            />
            <line
              x1={padX}
              x2={padX}
              y1={padY}
              y2={height - padY}
              stroke="rgba(15,23,42,0.12)"
            />
            <polyline
              points={line}
              fill="none"
              stroke="#0f766e"
              strokeWidth="3"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {points.map((point, index) => (
              <g key={bins[index].label}>
                <circle cx={point.x} cy={point.y} r="4" fill="#0f766e" />
                <text
                  x={point.x}
                  y={height - 3}
                  textAnchor="middle"
                  className="fill-slate-500 text-[9px]"
                >
                  {bins[index].label}
                </text>
                <text
                  x={point.x}
                  y={Math.max(10, point.y - 8)}
                  textAnchor="middle"
                  className="fill-slate-700 text-[10px] font-semibold"
                >
                  {point.count}
                </text>
              </g>
            ))}
          </svg>
        )}
      </div>
      <p className="text-sm leading-6 text-slate-600">
        Final scores are grouped into ranges, then connected to show where recent
        performance is clustering.
      </p>
    </div>
  );
}

function AppHeader({ user, onLogout }: { user?: SafeUser; onLogout?: () => void }) {
  return (
    <header className="border-b border-teal-950/10 bg-white/55 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-5 py-4 sm:px-8">
        <div className="flex items-center gap-3">
          <Image
            src="/gurunet.svg"
            alt="GURUnet"
            width={40}
            height={40}
            className="size-10 rounded-md"
            priority
          />
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-teal-700">
              GURUnet
            </p>
            <h2 className="text-lg font-semibold">Engineering discipline</h2>
          </div>
        </div>
        {user && (
          <div className="flex items-center gap-3">
            <span className="hidden text-sm font-medium text-slate-600 sm:inline">
              {user.name}
            </span>
            <button
              onClick={onLogout}
              className="interactive-lift grid size-10 place-items-center rounded-md border border-slate-300 bg-white text-slate-700 shadow-sm"
              aria-label="Logout"
            >
              <LogOut size={17} />
            </button>
          </div>
        )}
      </div>
    </header>
  );
}

function Field({
  label,
  name,
  type = "text",
  placeholder,
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  placeholder?: string;
  defaultValue?: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm font-medium text-slate-700">
      {label}
      <input
        name={name}
        type={type}
        placeholder={placeholder}
        defaultValue={defaultValue}
        suppressHydrationWarning
        required
        minLength={name === "password" ? 8 : name === "name" ? 2 : undefined}
        autoComplete={autoCompleteFor(name, type)}
        className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
      />
    </label>
  );
}

function autoCompleteFor(name: string, type: string) {
  if (name === "email") return "email";
  if (name === "password") return type === "password" ? "current-password" : "off";
  if (name === "name") return "name";
  return "off";
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-md border border-teal-950/10 bg-white/55 p-4">
      <div className="flex items-center gap-2 text-teal-700">{icon}</div>
      <p className="mt-4 text-sm font-medium text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function ChallengeAccordions({ challenge }: { challenge: Challenge }) {
  return (
    <div className="grid gap-2 py-5">
      <AccordionPanel title="Constraints" defaultOpen>
        <List items={challenge.constraints} />
      </AccordionPanel>
      <AccordionPanel title="Allowed tools">
        <List items={challenge.allowedTools} />
      </AccordionPanel>
      <AccordionPanel title="Expected answer">
        <p className="text-sm leading-6 text-slate-600">
          {challenge.expectedAnswerFormat}
        </p>
      </AccordionPanel>
      <AccordionPanel title="Anti-generic check">
        <p className="text-sm leading-6 text-slate-600">
          {challenge.antiGenericRequirement}
        </p>
      </AccordionPanel>
      <AccordionPanel title="Submission requirements">
        <List items={challenge.submissionRequirements} />
      </AccordionPanel>
    </div>
  );
}

function AccordionPanel({
  children,
  defaultOpen = false,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  title: string;
}) {
  return (
    <details
      className="group rounded-md border border-teal-950/10 bg-white/55"
      open={defaultOpen}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-slate-900 marker:hidden">
        {title}
        <ChevronRight
          size={16}
          className="text-teal-700 transition-transform group-open:rotate-90"
        />
      </summary>
      <div className="border-t border-slate-200 px-4 pb-4 pt-2">{children}</div>
    </details>
  );
}

function List({ items }: { items: string[] }) {
  return (
    <div className="mt-2 grid gap-2">
      {items.map((item) => (
        <div key={item} className="flex gap-2 text-sm leading-6 text-slate-600">
          <CheckCircle2 className="mt-1 shrink-0 text-teal-700" size={14} />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

function Panel({
  icon,
  title,
  children,
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="quiet-panel interactive-lift rounded-md p-5">
      <div className="mb-4 flex items-center gap-2 text-teal-700">
        {icon}
        <h3 className="font-semibold text-slate-950">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function SubmissionControl({
  busy,
  draftSavedAt,
  hasDraft,
  onOpen,
  onSample,
  status,
  submission,
  grade,
  verification,
  setVerification,
  onVerify,
  onGrade,
}: {
  busy: boolean;
  draftSavedAt: string;
  hasDraft: boolean;
  onOpen: () => void;
  onSample: () => void;
  status: string;
  submission: Submission | null;
  grade: Grade | null;
  verification: string;
  setVerification: (value: string) => void;
  onVerify: () => void;
  onGrade: () => void;
}) {
  return (
    <div className="quiet-panel rounded-md p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <LockKeyhole size={16} className="text-teal-700" />
          Submission
        </div>
        {!submission && hasDraft && (
          <span className="rounded-md bg-teal-50 px-2 py-1 text-xs font-semibold text-teal-800">
            Draft saved
          </span>
        )}
      </div>

      {submission ? (
        <SubmittedPanel
          submission={submission}
          grade={grade}
          verification={verification}
          setVerification={setVerification}
          onVerify={onVerify}
          onGrade={onGrade}
          busy={busy}
        />
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="button"
            onClick={onOpen}
            className="interactive-lift flex h-11 items-center justify-center gap-2 rounded-md bg-teal-700 px-5 text-sm font-semibold text-white shadow-sm shadow-teal-900/15"
          >
            <FileText size={16} />
            {hasDraft ? "Continue response" : "Respond"}
          </button>
          <button
            type="button"
            onClick={onSample}
            className="interactive-lift flex h-11 items-center justify-center rounded-md border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700"
          >
            Load sample answer
          </button>
          {draftSavedAt && (
            <p className="text-xs text-slate-500">
              Autosaved {new Intl.DateTimeFormat("en-ZA", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(draftSavedAt))}
            </p>
          )}
        </div>
      )}
      {status && <p className="mt-3 text-sm font-medium text-teal-800">{status}</p>}
    </div>
  );
}

function ResponseEditorModal({
  attachments,
  body,
  busy,
  open,
  savedAt,
  onAddFiles,
  onBodyChange,
  onOpenChange,
  onRemoveAttachment,
  onSubmit,
}: {
  attachments: SubmissionAttachment[];
  body: string;
  busy: boolean;
  open: boolean;
  savedAt: string;
  onAddFiles: (files: FileList | File[]) => void;
  onBodyChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
  onRemoveAttachment: (id: string) => void;
  onSubmit: () => void;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const canSubmit = body.trim().length > 0 || attachments.length > 0;

  function insert(before: string, after = "", fallback = "text") {
    const textarea = textareaRef.current;
    if (!textarea) {
      onBodyChange(`${body}${before}${fallback}${after}`);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = body.slice(start, end) || fallback;
    const next = `${body.slice(0, start)}${before}${selected}${after}${body.slice(end)}`;
    onBodyChange(next);
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + before.length, start + before.length + selected.length);
    });
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    if (event.target.files) void onAddFiles(event.target.files);
    event.target.value = "";
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    event.preventDefault();
    void onAddFiles(files);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] overflow-hidden sm:max-w-5xl"
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Challenge response</DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
          <div className="grid min-h-0 gap-3">
            <div className="flex flex-wrap gap-2 rounded-md border border-slate-200 bg-white/70 p-2">
              <EditorButton label="Heading" onClick={() => insert("## ", "", "Section")}>
                <Heading2 size={15} />
              </EditorButton>
              <EditorButton label="Bold" onClick={() => insert("**", "**", "important")}>
                <Bold size={15} />
              </EditorButton>
              <EditorButton label="Italic" onClick={() => insert("_", "_", "note")}>
                <Italic size={15} />
              </EditorButton>
              <EditorButton label="Inline code" onClick={() => insert("`", "`", "show command")}>
                <Code2 size={15} />
              </EditorButton>
              <EditorButton label="Code block" onClick={() => insert("\n```text\n", "\n```\n", "paste output here")}>
                <FileText size={15} />
              </EditorButton>
              <EditorButton label="Bullets" onClick={() => insert("\n- ", "", "evidence item")}>
                <ListIcon size={15} />
              </EditorButton>
              <EditorButton label="Numbered" onClick={() => insert("\n1. ", "", "ordered check")}>
                <ListOrdered size={15} />
              </EditorButton>
              <EditorButton label="Reference" onClick={() => insert("[", "](https://)", "source")}>
                <LinkIcon size={15} />
              </EditorButton>
              <EditorButton label="Attach" onClick={() => fileRef.current?.click()}>
                <ImagePlus size={15} />
              </EditorButton>
              <input
                ref={fileRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileChange}
                accept="image/*,.txt,.log,.md,.json,.csv,.pcap,.pcapng,.conf,.cfg"
              />
            </div>

            <textarea
              ref={textareaRef}
              value={body}
              onChange={(event) => onBodyChange(event.target.value)}
              onPaste={handlePaste}
              className="min-h-[24rem] resize-none rounded-md border border-slate-300 bg-white p-4 font-mono text-sm leading-6 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
              placeholder="Write with headings, bullets, command output, code blocks, and attached screenshots or files."
            />
          </div>

          <div className="grid min-h-0 gap-3">
            <div className="max-h-[22rem] overflow-auto rounded-md border border-slate-200 bg-white/70 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Preview
              </p>
              <RichSubmissionBody body={body || "Draft preview appears here."} />
            </div>
            <AttachmentList
              attachments={attachments}
              onRemove={onRemoveAttachment}
            />
          </div>
        </div>

        <div className="flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-slate-500">
            {savedAt
              ? `Autosaved ${new Intl.DateTimeFormat("en-ZA", {
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(savedAt))}`
              : "Draft autosaves as you type."}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onSubmit}
              disabled={busy || !canSubmit}
              className="flex h-10 items-center justify-center gap-2 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {busy ? <Loader2 className="animate-spin" size={16} /> : <ChevronRight size={16} />}
              Submit response
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function EditorButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="grid size-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 hover:border-teal-700/30 hover:text-teal-800"
    >
      {children}
    </button>
  );
}

function SubmittedPanel({
  submission,
  grade,
  verification,
  setVerification,
  onVerify,
  onGrade,
  busy,
}: {
  submission: Submission;
  grade: Grade | null;
  verification: string;
  setVerification: (value: string) => void;
  onVerify: () => void;
  onGrade: () => void;
  busy: boolean;
}) {
  return (
    <div className="grid gap-4">
      <SubmissionViewer content={submission.content} />
      {submission.requiresVerification && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-900">
            {submission.verificationQuestion}
          </p>
          <textarea
            value={verification}
            onChange={(event) => setVerification(event.target.value)}
            className="mt-3 min-h-24 w-full rounded-md border border-amber-200 bg-white p-3 text-sm outline-none"
          />
          <button
            onClick={onVerify}
            disabled={busy || !verification.trim()}
            className="interactive-lift mt-3 h-10 rounded-md bg-amber-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            Save verification
          </button>
        </div>
      )}
      {!grade && (
        <button
          onClick={onGrade}
          disabled={busy || submission.requiresVerification}
          className="interactive-lift flex h-11 w-fit items-center justify-center gap-2 rounded-md bg-teal-700 px-5 text-sm font-semibold text-white shadow-sm shadow-teal-900/15 disabled:opacity-60"
        >
          {busy ? <Loader2 className="animate-spin" size={16} /> : <ChevronRight size={16} />}
          Grade submission
        </button>
      )}
    </div>
  );
}

function SubmissionViewer({ content }: { content: string }) {
  const parsed = parseSubmissionContent(content);
  return (
    <div className="grid gap-3 rounded-md bg-white p-4 text-sm leading-6 text-slate-600">
      <RichSubmissionBody body={parsed.body} />
      {parsed.attachments.length > 0 && (
        <AttachmentList attachments={parsed.attachments} readonly />
      )}
    </div>
  );
}

function AttachmentList({
  attachments,
  onRemove,
  readonly = false,
}: {
  attachments: SubmissionAttachment[];
  onRemove?: (id: string) => void;
  readonly?: boolean;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white/70 p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          Attachments
        </p>
        <p className="text-xs text-slate-500">{attachments.length} files</p>
      </div>
      {attachments.length === 0 ? (
        <p className="text-sm text-slate-500">No attachments.</p>
      ) : (
        <div className="grid gap-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-md border border-slate-200 bg-white p-2"
            >
              {attachment.kind === "image" && attachment.dataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={attachment.dataUrl}
                  alt=""
                  className="size-12 rounded-md object-cover"
                />
              ) : (
                <div className="grid size-12 place-items-center rounded-md bg-slate-100 text-slate-500">
                  <FileText size={18} />
                </div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">
                  {attachment.name}
                </p>
                <p className="text-xs text-slate-500">
                  {attachment.type || "unknown"} · {formatBytes(attachment.size)}
                </p>
              </div>
              {!readonly && onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(attachment.id)}
                  className="h-8 rounded-md border border-slate-200 px-2 text-xs font-semibold text-slate-600"
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RichSubmissionBody({ body }: { body: string }) {
  const lines = body.split("\n");
  const nodes: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      nodes.push(
        <pre
          key={`code-${index}`}
          className="overflow-auto rounded-md bg-slate-950 p-3 text-xs leading-5 text-slate-100"
        >
          <code>{code.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (/^\s{0,3}#{1,4}\s+\S/.test(line)) {
      nodes.push(
        <h4 key={`heading-${index}`} className="font-semibold text-slate-950">
          {line.replace(/^\s{0,3}#{1,4}\s+/, "")}
        </h4>,
      );
    } else if (/^\s*(-|\*)\s+\S/.test(line)) {
      nodes.push(
        <div key={`bullet-${index}`} className="flex gap-2">
          <span className="text-teal-700">-</span>
          <span>{line.replace(/^\s*(-|\*)\s+/, "")}</span>
        </div>,
      );
    } else if (/^\s*\d+\.\s+\S/.test(line)) {
      nodes.push(
        <div key={`number-${index}`} className="flex gap-2">
          <span className="font-semibold text-teal-800">
            {line.match(/^\s*(\d+\.)/)?.[1]}
          </span>
          <span>{line.replace(/^\s*\d+\.\s+/, "")}</span>
        </div>,
      );
    } else if (line.trim() === "") {
      nodes.push(<div key={`space-${index}`} className="h-1" />);
    } else {
      nodes.push(
        <p key={`p-${index}`} className="whitespace-pre-wrap">
          {line}
        </p>,
      );
    }
    index += 1;
  }

  return <div className="grid gap-2">{nodes}</div>;
}

function GradeSummary({ grade }: { grade: Grade }) {
  return (
    <Panel icon={<Medal size={19} />} title="Daily scoresheet">
      <div className="grid gap-3">
        <div className="grid gap-3 sm:grid-cols-4">
          <Result label="Verdict" value={grade.verdict} />
          <Result label="Raw /20" value={grade.rawScore} />
          <Result label="Final /20" value={grade.finalScore} />
          <Result label="ERT earned" value={grade.ertEarned} />
        </div>
        <p className="text-sm leading-6 text-slate-600">{grade.correction}</p>
        <p className="text-sm font-semibold text-teal-900">
          Next target: {grade.nextImprovementTarget}
        </p>
      </div>
    </Panel>
  );
}

function Result({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className="text-xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function RewardPanel({
  busy,
  onRedeem,
}: {
  busy: boolean;
  onRedeem: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <Panel icon={<WalletCards size={19} />} title="Redeem ERT">
      <form onSubmit={onRedeem} className="grid gap-3">
        <input name="rewardName" className="h-10 rounded-md border border-slate-300 px-3 text-sm" placeholder="Reward name" />
        <div className="grid grid-cols-2 gap-2">
          <input name="cost" type="number" min="1" className="h-10 rounded-md border border-slate-300 px-3 text-sm" placeholder="Cost" />
          <input name="date" type="date" className="h-10 rounded-md border border-slate-300 px-3 text-sm" />
        </div>
        <input name="note" className="h-10 rounded-md border border-slate-300 px-3 text-sm" placeholder="Note" />
        <button disabled={busy} className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
          Redeem
        </button>
      </form>
    </Panel>
  );
}

function ProgressPanel({ rows }: { rows: ProgressRow[] }) {
  return (
    <div>
      <div className="rounded-md border border-teal-950/10 bg-white p-5 shadow-sm">
        <h2 className="text-xl font-semibold">Progress tracker</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                {["Date", "Challenge", "Status", "Final", "PIS", "ERT", "Next focus"].map((head) => (
                  <th key={head} className="py-3 pr-4 font-semibold">{head}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-3 pr-4">{row.date}</td>
                  <td className="py-3 pr-4 font-medium">{row.challenge}</td>
                  <td className="py-3 pr-4">{row.status}</td>
                  <td className="py-3 pr-4">{row.finalScore ?? "-"}</td>
                  <td className="py-3 pr-4">{row.pis}</td>
                  <td className="py-3 pr-4">{row.ertEarned}</td>
                  <td className="py-3 pr-4 text-slate-600">{row.nextFocus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SocialPanel({
  social,
  busy,
  onAddFriend,
  onEnroll,
}: {
  social: SocialSnapshot;
  busy: boolean;
  onAddFriend: (event: FormEvent<HTMLFormElement>) => void;
  onEnroll: (challengeId: string) => void;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
      <Panel icon={<Medal size={20} />} title="Leaderboard">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-left text-sm">
            <thead className="border-b border-slate-200 text-slate-500">
              <tr>
                {["Rank", "Engineer", "PIS", "Streak", "Latest"].map((head) => (
                  <th key={head} className="py-2 pr-3 font-semibold">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {social.leaderboard.map((row) => (
                <tr key={row.id} className="border-b border-slate-100">
                  <td className="py-3 pr-3 font-semibold text-teal-800">#{row.rank}</td>
                  <td className="py-3 pr-3">
                    <p className="font-medium text-slate-900">
                      {row.name}
                      {row.isYou ? " (you)" : ""}
                    </p>
                    <p className="text-xs text-slate-500">{row.handle}</p>
                  </td>
                  <td className="py-3 pr-3">{row.pisScore.toFixed(1)}</td>
                  <td className="py-3 pr-3">{row.currentStreak}</td>
                  <td className="py-3 pr-3">{row.latestScore ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel icon={<Users size={20} />} title="Friends and public profiles">
        <form onSubmit={onAddFriend} className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            name="email"
            type="email"
            required
            className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-700/15"
            placeholder="friend@example.com"
          />
          <button
            disabled={busy}
            className="h-10 rounded-md bg-teal-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            Add friend
          </button>
        </form>
        <div className="mt-4 grid gap-3">
          {social.profiles.map((profile) => (
            <div
              key={profile.id}
              className="grid grid-cols-[1fr_auto] gap-3 rounded-md border border-slate-200 bg-white/65 p-3"
            >
              <div>
                <p className="font-medium text-slate-900">
                  {profile.name}
                  {profile.isYou ? " (you)" : ""}
                </p>
                <p className="text-xs text-slate-500">{profile.handle}</p>
              </div>
              <div className="text-right text-sm">
                <p className="font-semibold text-teal-800">{profile.pisScore.toFixed(1)} PIS</p>
                <p className="text-xs text-slate-500">{profile.challengeCount} challenges</p>
              </div>
            </div>
          ))}
          {social.friends.length === 0 && (
            <p className="text-sm leading-6 text-slate-600">
              Add a friend by email to compare public profiles and shared challenge progress.
            </p>
          )}
        </div>
      </Panel>

      <div className="lg:col-span-2">
        <Panel icon={<Store size={20} />} title="Challenge marketplace">
          <div className="grid gap-3 lg:grid-cols-3">
            {social.marketplace.map((item) => (
              <div
                key={item.id}
                className="flex min-h-[13rem] flex-col rounded-md border border-slate-200 bg-white/65 p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-teal-800">
                      {item.topic}
                    </p>
                    <h3 className="mt-2 font-semibold text-slate-950">{item.title}</h3>
                  </div>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
                    {item.difficulty}
                  </span>
                </div>
                <p className="mt-3 flex-1 text-sm leading-6 text-slate-600">{item.summary}</p>
                <div className="mt-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-500">
                    {item.estimatedMinutes} min · {item.enrollmentCount} enrolled
                  </p>
                  <button
                    type="button"
                    onClick={() => onEnroll(item.id)}
                    disabled={busy || item.isEnrolled}
                    className="h-9 rounded-md border border-teal-700/20 bg-teal-50 px-3 text-sm font-semibold text-teal-800 disabled:opacity-60"
                  >
                    {item.isEnrolled ? "Enrolled" : "Enroll"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function NotebookPanel({
  entries,
  redemptions,
}: {
  entries: NotebookEntry[];
  redemptions: Redemption[];
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Panel icon={<NotebookTabs size={20} />} title="Engineering notebook">
        <div className="grid gap-3">
          {entries.length === 0 && <p className="text-sm text-slate-600">No graded entries yet.</p>}
          {entries.map((entry) => (
            <div key={entry.id} className="rounded-md border border-slate-200 p-3">
              <p className="font-medium text-slate-800">{entry.title}</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">{entry.summary}</p>
            </div>
          ))}
        </div>
      </Panel>
      <Panel icon={<BookOpenText size={20} />} title="Redemption ledger">
        <div className="grid gap-3">
          {redemptions.length === 0 && <p className="text-sm text-slate-600">No redemptions yet.</p>}
          {redemptions.map((item) => (
            <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-md border border-slate-200 p-3">
              <div>
                <p className="font-medium text-slate-800">{item.rewardName}</p>
                <p className="text-sm text-slate-500">{item.date}</p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-teal-800">-{item.cost}</p>
                <p className="text-xs text-slate-500">Bal {item.balanceAfter}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function readAttachment(file: File): Promise<SubmissionAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      resolve({
        id:
          typeof crypto !== "undefined" && "randomUUID" in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        type: file.type || "application/octet-stream",
        size: file.size,
        kind: file.type.startsWith("image/") ? "image" : "file",
        dataUrl: typeof reader.result === "string" ? reader.result : undefined,
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function Footer() {
  return (
    <footer className="mx-auto flex w-full max-w-7xl flex-col gap-2 px-5 pb-8 pt-2 text-xs text-slate-500 sm:px-8 md:flex-row md:items-center md:justify-between">
      <p>© {new Date().getFullYear()} GURUnet. All rights reserved.</p>
      <p className="font-mono text-teal-800">Created by Zed with love.</p>
    </footer>
  );
}
