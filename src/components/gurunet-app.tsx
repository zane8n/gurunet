"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent, FormEvent, ReactNode } from "react";
import {
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
  Pencil,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
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
  submittedAt: string | null;
  deadlineAt: string;
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
  preferredProfession: string;
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

type ChallengeNotice = {
  id: string;
  kind: string;
  reason: string;
  accepted: boolean;
  reply: string;
  createdAt: string;
};

type ChallengeSettings = {
  track: string;
  durationMinutes: number;
  difficultyFloor: string;
  topicFocus: string;
  recoveryMode: boolean;
  teamMode: boolean;
};

type DisciplineTemplate = {
  id: string;
  label: string;
  summary: string;
  topics: string[];
  formats: string[];
  evidenceTypes: string[];
  responseSections: string[];
  rubric: Record<string, { label: string; description: string }>;
};

type CheckboxOption = string | { value: string; label: string };

type ApiIssue = {
  path?: Array<string | number>;
  message?: string;
};

class ApiRequestError extends Error {
  issues: ApiIssue[];

  constructor(message: string, issues: ApiIssue[] = []) {
    super(message);
    this.name = "ApiRequestError";
    this.issues = issues;
  }
}

type StudyProfile = {
  userId: string;
  primaryDiscipline: string;
  secondaryInterests: string[];
  rankedTopics: string[];
  currentLevel: string;
  preferredFormats: string[];
  evidenceTypes: string[];
  weeklyTimeBudgetHours: number;
  targetDifficulty: string;
  weakAreas: string[];
  avoidAreas: string[];
  goals: string[];
  customDiscipline?: string;
  customStatus?: string;
  preferenceNotes?: string;
  completedAt?: string;
};

type ActiveDiscipline = {
  id: string;
  label: string;
  topics: string[];
  formats: string[];
  evidenceTypes: string[];
  responseSections: string[];
  rubric: Record<string, { label: string; description: string }>;
};

type CohortSummary = {
  id: string;
  name: string;
  track: string;
  difficulty: string;
  completionWindowHours: number;
  inviteCode: string;
  memberCount: number;
  isOwner: boolean;
  createdAt: string;
  leaderboard: {
    id: string;
    rank: number;
    name: string;
    pisScore: number;
    currentStreak: number;
    latestScore: number | null;
  }[];
};

type ExaminerMessage = {
  id: string;
  role: string;
  content: string;
  actions?: unknown;
  createdAt: string;
};

type Dashboard = {
  user: SafeUser;
  today: Challenge;
  todayNotice: ChallengeNotice | null;
  challengeSettings: ChallengeSettings;
  onboardingRequired: boolean;
  studyProfile: StudyProfile | null;
  activeDiscipline: ActiveDiscipline;
  cohorts: CohortSummary[];
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
    let issues: ApiIssue[] = [];
    try {
      const parsed = JSON.parse(text) as { error?: string; issues?: ApiIssue[] };
      message = parsed.error || message;
      issues = Array.isArray(parsed.issues) ? parsed.issues : [];
    } catch {
      // Keep the original response text when the body is not JSON.
    }
    throw new ApiRequestError(message, issues);
  }
  return response.json() as Promise<T>;
}

function formatApiIssue(issue: ApiIssue) {
  const field = issue.path?.join(".") || "profile";
  return `${profileFieldLabel(field)}: ${issue.message ?? "Please check this value."}`;
}

function profileFieldLabel(field: string) {
  const labels: Record<string, string> = {
    primaryDiscipline: "Primary discipline",
    secondaryInterests: "Secondary interests",
    rankedTopics: "Ranked topic interests",
    currentLevel: "Current level",
    preferredFormats: "Preferred challenge formats",
    evidenceTypes: "Expected evidence/output",
    weeklyTimeBudgetHours: "Weekly hours",
    targetDifficulty: "Target difficulty",
    weakAreas: "Weak areas",
    avoidAreas: "Avoid areas",
    goals: "Professional goals",
    customDiscipline: "Custom request",
    preferenceNotes: "Written preferences",
  };
  return labels[field] ?? field;
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

const responseTemplates = [
  {
    label: "Triage",
    body: `## Hypothesis

## Evidence
- 

## Checks
1. 
2. 
3. 

## Risk and rollback

## Recommendation
`,
  },
  {
    label: "Incident",
    body: `## Impact

## Timeline
- 

## Findings
- 

## Containment

## Follow-up
`,
  },
  {
    label: "Change",
    body: `## Goal

## Pre-checks
- 

## Change steps
1. 

## Validation
- 

## Rollback
`,
  },
];

const responseOutlineChips = [
  "Hypothesis",
  "Evidence",
  "Checks",
  "Risk and rollback",
  "Recommendation",
];

const trackOptions = [
  ["networking", "Networking"],
  ["linux_systems", "Linux / Systems"],
  ["cybersecurity", "Cybersecurity"],
  ["software_engineering", "Software Engineering"],
  ["automation_scripting", "Automation / Scripting"],
  ["cloud_devops", "Cloud / DevOps"],
  ["data_ai", "Data / AI"],
  ["applied_engineering", "Applied Engineering / Troubleshooting"],
  ["technical_writing", "Technical Writing / Documentation"],
] as const;

const difficultyOptions = ["Guided", "Normal", "Advanced", "Production", "Expert"] as const;

export function GurunetApp() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [disciplines, setDisciplines] = useState<DisciplineTemplate[]>([]);
  const [profileGate, setProfileGate] = useState<{
    onboardingRequired: boolean;
    studyProfile: StudyProfile | null;
    activeDiscipline: ActiveDiscipline;
  } | null>(null);
  const [bootstrapped, setBootstrapped] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [authError, setAuthError] = useState("");
  const [profileErrors, setProfileErrors] = useState<string[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [responseOpen, setResponseOpen] = useState(false);
  const [examinerOpen, setExaminerOpen] = useState(false);
  const [examinerMessages, setExaminerMessages] = useState<ExaminerMessage[]>([]);
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
          const [profile, catalog] = await Promise.all([
            apiRequest<{
              onboardingRequired: boolean;
              studyProfile: StudyProfile | null;
              activeDiscipline: ActiveDiscipline;
            }>("/api/study-profile"),
            apiRequest<{ disciplines: DisciplineTemplate[] }>("/api/disciplines"),
          ]);
          setDisciplines(catalog.disciplines);
          setProfileGate(profile);
          if (profile.onboardingRequired) {
            setDashboard(null);
            return;
          }
          const data = await apiRequest<Dashboard>("/api/me/stats");
          setDashboard(data);
        } else {
          setDashboard(null);
        }
      } catch (error) {
        console.error("Session bootstrap failed", error);
        setDashboard(null);
      } finally {
        setBootstrapped(true);
      }
    }

    void bootstrap();
  }, []);

  async function loadDashboard() {
    const data = await apiRequest<Dashboard>("/api/me/stats");
    setDashboard(data);
    setProfileGate({
      onboardingRequired: data.onboardingRequired,
      studyProfile: data.studyProfile,
      activeDiscipline: data.activeDiscipline,
    });
    setVerification("");
  }

  async function saveStudyProfile(input: unknown) {
    setBusy(true);
    setStatus("");
    setProfileErrors([]);
    try {
      const profile = await apiRequest<{
        onboardingRequired: boolean;
        studyProfile: StudyProfile | null;
        activeDiscipline: ActiveDiscipline;
      }>("/api/study-profile", {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      setProfileGate(profile);
      await loadDashboard();
      setStatus("Study profile saved.");
    } catch (error) {
      if (error instanceof ApiRequestError && error.issues.length > 0) {
        setProfileErrors(error.issues.map(formatApiIssue));
      }
      setStatus(error instanceof Error ? error.message : "Study profile update failed");
    } finally {
      setBusy(false);
    }
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

  async function openExaminer() {
    setExaminerOpen(true);
    try {
      const data = await apiRequest<{ messages: ExaminerMessage[] }>("/api/examiner/chat");
      setExaminerMessages(data.messages);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Examiner chat failed");
    }
  }

  async function sendExaminerMessage(message: string) {
    if (!today || !message.trim()) return;
    setBusy(true);
    setStatus("");
    try {
      const optimistic: ExaminerMessage = {
        id: `local-${Date.now()}`,
        role: "user",
        content: message,
        createdAt: new Date().toISOString(),
      };
      setExaminerMessages((items) => [...items, optimistic]);
      const response = await apiRequest<{ reply: ExaminerMessage }>("/api/examiner/chat", {
        method: "POST",
        body: JSON.stringify({ message, challengeId: today.id }),
      });
      setExaminerMessages((items) => [...items, response.reply]);
      await loadDashboard();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Examiner chat failed");
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

  async function saveChallengeSettings(input: ChallengeSettings) {
    setBusy(true);
    setStatus("");
    try {
      await apiRequest("/api/challenge-settings", {
        method: "PATCH",
        body: JSON.stringify(input),
      });
      await loadDashboard();
      setStatus("Challenge settings saved. The next generated challenge will use them.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Settings update failed");
    } finally {
      setBusy(false);
    }
  }

  async function createCohort(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest("/api/cohorts", {
        method: "POST",
        body: JSON.stringify({
          name: String(form.get("name") || ""),
          track: String(form.get("track") || "networking"),
          difficulty: String(form.get("difficulty") || "Normal"),
          completionWindowHours: Number(form.get("completionWindowHours") || 24),
        }),
      });
      event.currentTarget.reset();
      await loadDashboard();
      setStatus("Cohort challenge created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Cohort creation failed");
    } finally {
      setBusy(false);
    }
  }

  async function joinCohort(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setStatus("");
    const form = new FormData(event.currentTarget);
    try {
      await apiRequest("/api/cohorts/join", {
        method: "POST",
        body: JSON.stringify({ inviteCode: String(form.get("inviteCode") || "") }),
      });
      event.currentTarget.reset();
      await loadDashboard();
      setStatus("Cohort joined.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Cohort join failed");
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

  if (!bootstrapped) {
    return (
      <main className="app-background min-h-screen text-slate-950">
        <AppHeader />
        <DashboardSkeleton />
        <Footer />
      </main>
    );
  }

  if (profileGate?.onboardingRequired) {
    return (
      <main className="app-background min-h-screen text-slate-950">
        <AppHeader />
        <StudyProfileOnboarding
          busy={busy}
          disciplines={disciplines}
          errors={profileErrors}
          status={status}
          onSave={saveStudyProfile}
        />
        <Footer />
      </main>
    );
  }

  if (!dashboard || !user || !today) {
    return (
      <main className="app-background min-h-screen text-slate-950">
        <AppHeader />
        <section className="soft-enter grid w-full gap-6 px-2 py-6 sm:px-3 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="flex flex-col justify-center rounded-md px-1 py-4">
            <p className="w-fit rounded-md border border-cyan-700/20 bg-cyan-50 px-3 py-1 font-mono text-xs uppercase tracking-[0.16em] text-cyan-800">
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
              <Metric icon={<CalendarClock size={18} />} label="Deadline" value="15:00" />
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
                className={`interactive-lift flex h-10 flex-1 items-center justify-center gap-2 rounded-md text-sm font-semibold ${authMode === "signup" ? "bg-white text-cyan-800 shadow-sm" : "text-slate-600"}`}
              >
                <UserPlus size={16} />
                Sign up
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("login")}
                className={`interactive-lift flex h-10 flex-1 items-center justify-center gap-2 rounded-md text-sm font-semibold ${authMode === "login" ? "bg-white text-cyan-800 shadow-sm" : "text-slate-600"}`}
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
              className="interactive-lift mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white shadow-sm shadow-cyan-900/15 disabled:opacity-60"
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
      <SectionNav />

      <section id="daily-challenge" className="scroll-mt-28 border-b border-cyan-950/10">
        <div className="w-full px-2 py-4 sm:px-3">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <StatusPill status={today.status} />
            <span className="rounded-md border border-cyan-700/15 bg-white/70 px-3 py-1 font-mono text-xs uppercase tracking-[0.14em] text-cyan-800">
              {today.dateKey} · {today.difficulty}
            </span>
            <span className="rounded-md border border-amber-700/15 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">
              Due {deadline}
            </span>
          </div>

          <div className="grid gap-4">
            <article className="glass-panel rounded-md p-4 sm:p-5">
              {todaySubmission ? (
                <div className="rounded-md border border-cyan-700/15 bg-gradient-to-br from-cyan-50 to-white p-4">
                  <p className="text-sm font-semibold text-cyan-800">Submitted response</p>
                  <h1 className="mt-2 text-2xl font-semibold tracking-normal">
                    {today.title}
                  </h1>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    Your assessment stays focused on the submitted work until the next
                    challenge unlocks at {nextUnlock}.
                  </p>
                </div>
              ) : (
                <>
                  <p className="text-sm font-semibold text-cyan-800">{today.topic}</p>
                  <h1 className="mt-2 text-3xl font-semibold tracking-normal">
                    {today.title}
                  </h1>
                  <p className="mt-3 leading-7 text-slate-600">
                    {today.scenario}
                  </p>

                  <div className="mt-5 border-t border-slate-200 pt-4">
                    <h2 className="text-xl font-semibold">Objective</h2>
                    <p className="mt-2 leading-7 text-slate-600">{today.objective}</p>
                  </div>
                </>
              )}

              {todaySubmission ? (
                <details className="my-5 rounded-md border border-slate-200 bg-white/55">
                  <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-slate-900 marker:hidden">
                    Challenge prompt
                    <ChevronRight size={16} className="text-cyan-700" />
                  </summary>
                  <div className="border-t border-slate-200 px-4 py-4">
                    <p className="text-sm font-semibold text-cyan-800">{today.topic}</p>
                    <p className="mt-2 text-lg font-semibold text-slate-950">{today.title}</p>
                    <p className="mt-2 leading-7 text-slate-600">{today.scenario}</p>
                    <p className="mt-4 font-semibold text-slate-900">Objective</p>
                    <p className="mt-1 leading-7 text-slate-600">{today.objective}</p>
                    <ChallengeAccordions challenge={today} />
                  </div>
                </details>
              ) : (
                <ChallengeAccordions challenge={today} />
              )}

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
                notice={dashboard.todayNotice}
                onExaminer={openExaminer}
              />
            </article>

            <details className="quiet-panel rounded-md p-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-900 marker:hidden">
                Assessment teaching
                <ChevronRight size={16} className="text-cyan-700" />
              </summary>
              <div className="mt-4">
                <TeachingPanel challenge={today} grade={todayGrade} submission={todaySubmission ?? null} plain />
              </div>
            </details>
          </div>
        </div>
      </section>

      <section id="metrics" className="scroll-mt-28 border-b border-cyan-950/10 bg-white/25">
        <div className="grid w-full gap-4 px-2 py-4 sm:px-3">
          <MetricsBand
            grade={todayGrade}
            nextUnlock={nextUnlock}
            rows={dashboard.progress}
            user={user}
          />
        </div>
      </section>

      <section id="social" className="scroll-mt-28">
        <div className="grid w-full gap-4 px-2 py-4 sm:px-3">
          <SocialPanel
            social={dashboard.social}
            busy={busy}
            onAddFriend={addFriend}
            onEnroll={enrollMarketplace}
          />
          <CompactDetails title="Challenge settings and cohorts">
            <VersatilityPanel
              busy={busy}
              cohorts={dashboard.cohorts}
              settings={dashboard.challengeSettings}
              onCreateCohort={createCohort}
              onJoinCohort={joinCohort}
              onSaveSettings={saveChallengeSettings}
            />
          </CompactDetails>
          <CompactDetails title="Notebook and rewards" defaultOpen>
            <div className="grid gap-4 lg:grid-cols-[0.72fr_1.28fr]">
              <RewardPanel busy={busy} onRedeem={redeem} />
              <NotebookPanel
                key={dashboard.notebookEntries.map((entry) => entry.id).join(":")}
                busy={busy}
                entries={dashboard.notebookEntries}
                redemptions={dashboard.redemptions}
                onAskExaminer={openExaminer}
              />
            </div>
          </CompactDetails>
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
      <ExaminerChatModal
        busy={busy}
        messages={examinerMessages}
        notice={dashboard.todayNotice}
        open={examinerOpen}
        onOpenChange={setExaminerOpen}
        onSend={sendExaminerMessage}
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

function StudyProfileOnboarding({
  busy,
  disciplines,
  errors,
  status,
  onSave,
}: {
  busy: boolean;
  disciplines: DisciplineTemplate[];
  errors: string[];
  status: string;
  onSave: (input: unknown) => void;
}) {
  const first = disciplines[0];
  const [selectedId, setSelectedId] = useState(first?.id ?? "networking");
  const selected = disciplines.find((item) => item.id === selectedId) ?? first;
  const topics = selected?.topics ?? [];
  const formats = selected?.formats ?? [];
  const evidenceTypes = selected?.evidenceTypes ?? [];
  const [clientErrors, setClientErrors] = useState<string[]>([]);
  const visibleErrors = [...clientErrors, ...errors];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      primaryDiscipline: String(form.get("primaryDiscipline") || selectedId),
      secondaryInterests: form.getAll("secondaryInterests").map(String),
      rankedTopics: form.getAll("rankedTopics").map(String),
      currentLevel: String(form.get("currentLevel") || "Intermediate"),
      preferredFormats: form.getAll("preferredFormats").map(String),
      evidenceTypes: form.getAll("evidenceTypes").map(String),
      weeklyTimeBudgetHours: Number(form.get("weeklyTimeBudgetHours") || 4),
      targetDifficulty: String(form.get("targetDifficulty") || "Normal"),
      weakAreas: form.getAll("weakAreas").map(String),
      avoidAreas: form.getAll("avoidAreas").map(String),
      goals: form.getAll("goals").map(String),
      customDiscipline: String(form.get("customDiscipline") || "") || undefined,
      preferenceNotes: String(form.get("preferenceNotes") || "") || undefined,
    };
    const nextErrors = validateStudyProfileInput(input);
    setClientErrors(nextErrors);
    if (nextErrors.length > 0) return;
    onSave(input);
  }

  return (
    <section className="grid w-full gap-5 px-2 py-4 sm:px-3">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.16em] text-cyan-800">
          Study profile
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-normal">
          Configure GURUnet as a rigorous capacity builder.
        </h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-600">
          Choose a governed STEM/technical discipline and concrete evidence
          standards. The examiner will use this to shape challenges, response
          templates, grading language, and notebook guidance.
        </p>
        <div className="mt-4 grid gap-2 rounded-md border border-cyan-700/15 bg-cyan-50 p-4 text-sm leading-6 text-cyan-950">
          <p className="font-semibold">How validation works</p>
          <p>
            Pick focused options, not every option. GURUnet uses these choices to
            generate daily challenges, select evidence standards, tune grading
            language, and shape the notebook. Broad selections make the system
            less rigorous, so some groups have maximum limits.
          </p>
          <p>
            Required: primary discipline, at least 3 ranked topics, at least 2
            formats, at least 2 evidence types, at least 1 weak area, at least 1
            professional goal, 1-40 weekly hours, and a difficulty target.
          </p>
        </div>
      </div>

      <form onSubmit={submit} className="grid gap-5">
        <div className="quiet-panel rounded-md p-5">
          <div className="grid gap-4 md:grid-cols-[0.75fr_1.25fr]">
            <label className="grid gap-2 text-sm font-medium text-slate-700">
              Primary discipline
              <select
                name="primaryDiscipline"
                value={selectedId}
                onChange={(event) => setSelectedId(event.target.value)}
                className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                {disciplines.map((discipline) => (
                  <option key={discipline.id} value={discipline.id}>
                    {discipline.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-md bg-white/60 p-3 text-sm leading-6 text-slate-600">
              {selected?.summary}
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <SurveyGroup title="Ranked topic interests">
            <CheckboxGrid
              key={`${selectedId}-rankedTopics`}
              name="rankedTopics"
              values={topics}
              min={3}
              max={8}
              limitHint="Pick 3-8. These become the priority topic pool for generated challenges."
            />
          </SurveyGroup>
          <SurveyGroup title="Preferred challenge formats">
            <CheckboxGrid
              key={`${selectedId}-preferredFormats`}
              name="preferredFormats"
              values={formats}
              min={2}
              max={6}
              limitHint="Pick 2-6. This controls the shape of the task, not the discipline itself."
            />
          </SurveyGroup>
          <SurveyGroup title="Expected evidence/output">
            <CheckboxGrid
              key={`${selectedId}-evidenceTypes`}
              name="evidenceTypes"
              values={evidenceTypes}
              min={2}
              max={8}
              limitHint="Pick 2-8. These are the proof types the grader expects to see."
            />
          </SurveyGroup>
          <SurveyGroup title="Weak areas">
            <CheckboxGrid
              key={`${selectedId}-weakAreas`}
              name="weakAreas"
              values={topics}
              min={1}
              max={8}
              limitHint="Pick 1-8. These become pressure points and recovery targets."
            />
          </SurveyGroup>
        </div>

        <div className="quiet-panel rounded-md p-5">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Current level
              <select name="currentLevel" defaultValue="Intermediate" className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
                {["Beginner", "Intermediate", "Advanced", "Production", "Expert"].map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Target difficulty
              <select name="targetDifficulty" defaultValue="Normal" className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
                {difficultyOptions.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Weekly hours
              <input name="weeklyTimeBudgetHours" type="number" min={1} max={40} defaultValue={4} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Custom request
              <input name="customDiscipline" className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" placeholder="Optional" />
            </label>
          </div>
          <label className="mt-4 grid gap-1.5 text-sm font-medium text-slate-700">
            Written preferences
            <textarea
              name="preferenceNotes"
              className="min-h-24 rounded-md border border-slate-300 bg-white p-3 text-sm leading-6"
              maxLength={1000}
              placeholder="Example: I prefer hands-on lab challenges with clear setup, tasks, evidence capture, and validation. Avoid purely theoretical questions unless needed."
            />
            <span className="text-xs font-normal leading-5 text-slate-500">
              Optional. Use this for bespoke preferences that do not fit the checkboxes. The backend stores this as guidance; it does not override safety or grading rules.
            </span>
          </label>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <SurveyGroup title="Secondary interests">
            <CheckboxGrid
              key={`${selectedId}-secondaryInterests`}
              name="secondaryInterests"
              values={disciplines
                .filter((item) => item.id !== selectedId)
                .map((item) => ({ value: item.id, label: item.label }))}
              max={4}
              limitHint="Optional. Pick up to 4 adjacent areas for occasional cross-training."
            />
          </SurveyGroup>
          <SurveyGroup title="Professional goals">
            <CheckboxGrid
              name="goals"
              values={[
                "Stronger troubleshooting discipline",
                "Better technical communication",
                "Production-ready judgment",
                "Broader STEM fluency",
                "Interview/certification readiness",
                "Build a reusable notebook",
              ]}
              min={1}
              max={6}
              limitHint="Pick 1-6. These steer the examiner's long-term emphasis."
            />
          </SurveyGroup>
        </div>

        {(status || visibleErrors.length > 0) && (
          <div className={`rounded-md border p-4 text-sm leading-6 ${
            visibleErrors.length > 0
              ? "border-orange-200 bg-orange-50 text-orange-900"
              : "border-cyan-700/15 bg-cyan-50 text-cyan-900"
          }`}>
            {status && <p className="font-semibold">{status}</p>}
            {visibleErrors.length > 0 && (
              <ul className="mt-2 grid gap-1">
                {visibleErrors.map((error) => (
                  <li key={error}>- {error}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        <button disabled={busy} className="h-11 w-fit rounded-md bg-cyan-700 px-5 text-sm font-semibold text-white disabled:opacity-60">
          Save profile
        </button>
      </form>
    </section>
  );
}

function validateStudyProfileInput(input: {
  rankedTopics: string[];
  preferredFormats: string[];
  evidenceTypes: string[];
  weeklyTimeBudgetHours: number;
  weakAreas: string[];
  goals: string[];
}) {
  const errors: string[] = [];
  if (input.rankedTopics.length < 3) errors.push("Ranked topic interests: pick at least 3 focused topics.");
  if (input.rankedTopics.length > 8) errors.push("Ranked topic interests: pick no more than 8 topics.");
  if (input.preferredFormats.length < 2) errors.push("Preferred challenge formats: pick at least 2 formats.");
  if (input.preferredFormats.length > 6) errors.push("Preferred challenge formats: pick no more than 6 formats.");
  if (input.evidenceTypes.length < 2) errors.push("Expected evidence/output: pick at least 2 evidence types.");
  if (input.evidenceTypes.length > 8) errors.push("Expected evidence/output: pick no more than 8 evidence types.");
  if (input.weakAreas.length < 1) errors.push("Weak areas: pick at least 1 area for targeted capacity building.");
  if (input.weakAreas.length > 8) errors.push("Weak areas: pick no more than 8 areas.");
  if (input.goals.length < 1) errors.push("Professional goals: pick at least 1 goal.");
  if (input.goals.length > 6) errors.push("Professional goals: pick no more than 6 goals.");
  if (!Number.isInteger(input.weeklyTimeBudgetHours) || input.weeklyTimeBudgetHours < 1 || input.weeklyTimeBudgetHours > 40) {
    errors.push("Weekly hours: enter a whole number from 1 to 40.");
  }
  return errors;
}

function SurveyGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="quiet-panel rounded-md p-5">
      <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function CheckboxGrid({
  max,
  min,
  name,
  values,
  limitHint,
}: {
  max?: number;
  min?: number;
  name: string;
  values: CheckboxOption[];
  limitHint?: string;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(value: string) {
    setSelected((current) => {
      if (current.includes(value)) return current.filter((item) => item !== value);
      if (max && current.length >= max) return current;
      return [...current, value];
    });
  }

  const countTone =
    min && selected.length < min
      ? "text-orange-700"
      : max && selected.length >= max
        ? "text-cyan-800"
        : "text-slate-500";

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {limitHint && <p className="text-xs text-slate-500">{limitHint}</p>}
        {(min || max) && (
          <p className={`text-xs font-semibold ${countTone}`}>
            {selected.length}
            {max ? `/${max}` : ""} selected
            {min && selected.length < min ? ` · ${min - selected.length} more required` : ""}
          </p>
        )}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {values.map((option) => {
          const value = typeof option === "string" ? option : option.value;
          const label = typeof option === "string" ? option : option.label;
          const checked = selected.includes(value);
          const disabled = Boolean(max && selected.length >= max && !checked);
          return (
            <label
              key={`${name}-${value}`}
              className={`flex items-start gap-2 rounded-md border px-3 py-2 text-sm ${
                checked
                  ? "border-cyan-700/30 bg-cyan-50 text-cyan-950"
                  : disabled
                    ? "border-slate-200 bg-slate-50 text-slate-400"
                    : "border-slate-200 bg-white/60 text-slate-700"
              }`}
            >
              <input
                checked={checked}
                disabled={disabled}
                name={name}
                value={value}
                type="checkbox"
                className="mt-1"
                onChange={() => toggle(value)}
              />
              <span>{label}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone = status.includes("Missed")
    ? "border-red-200 bg-red-50 text-red-700"
    : status.includes("Late")
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : status.includes("Recovery")
        ? "border-sky-200 bg-sky-50 text-sky-800"
        : "border-cyan-200 bg-cyan-50 text-cyan-800";

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
      ? "text-cyan-800"
      : clamped >= 45
        ? "text-slate-800"
        : "text-amber-800";
  return (
    <div className="rounded-md border border-cyan-950/10 bg-white/60 p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {label}
          </p>
          <p className={`mt-1 text-4xl font-semibold ${tone}`}>{clamped.toFixed(1)}</p>
        </div>
        <span className="mb-1 rounded-md border border-cyan-700/15 bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-800">
          {clamped >= 70 ? "Strong" : clamped >= 45 ? "Stable" : "Recovery"}
        </span>
      </div>
      <div className="mt-4 h-2 rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-cyan-700"
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
            title={activityTitle(row)}
            className="size-3.5 rounded-[2px] border transition-transform hover:scale-125"
            style={activityStyle(row)}
          />
        ))}
      </div>
    </div>
  );
}

function activityTitle(row?: ProgressRow) {
  if (!row) return "No record";
  const timing = row.submittedAt
    ? `${minutesBeforeDeadline(row)} min before deadline`
    : "not submitted";
  return `${row.date}: ${row.status}, ${row.finalScore ?? "-"} / 20, ${timing}`;
}

function minutesBeforeDeadline(row: ProgressRow) {
  if (!row.submittedAt) return 0;
  return Math.round((new Date(row.deadlineAt).getTime() - new Date(row.submittedAt).getTime()) / 60000);
}

function activityStyle(row?: ProgressRow) {
  if (!row) return { backgroundColor: "rgba(203, 213, 225, 0.72)", borderColor: "rgba(148, 163, 184, 0.45)" };
  if (row.status.includes("Missed")) return { backgroundColor: "#b91c1c", borderColor: "#991b1b" };
  if (!row.submittedAt) return { backgroundColor: "rgba(148, 163, 184, 0.82)", borderColor: "rgba(100, 116, 139, 0.5)" };

  const minutesEarly = minutesBeforeDeadline(row);
  const score = row.finalScore ?? 0;
  const scoreQuality = Math.max(0, Math.min(1, score / 20));
  const timingQuality = Math.max(0, Math.min(1, (minutesEarly + 20) / 160));
  const quality = Math.max(0, Math.min(1, scoreQuality * 0.72 + timingQuality * 0.28));
  const palette = [
    "#b91c1c",
    "#dc2626",
    "#ea580c",
    "#d97706",
    "#ca8a04",
    "#65a30d",
    "#0d9488",
    "#0891b2",
    "#0e7490",
  ];
  const index = Math.max(0, Math.min(palette.length - 1, Math.floor(quality * (palette.length - 1))));
  const color = minutesEarly < -120 || score < 5 ? palette[0] : palette[index];
  return { backgroundColor: color, borderColor: "rgba(15, 23, 42, 0.18)" };
}

function FrequencyPolygon({ rows }: { rows: ProgressRow[] }) {
  const bins = [
    { label: "0-2", min: 0, max: 2 },
    { label: "3-4", min: 3, max: 4 },
    { label: "5-6", min: 5, max: 6 },
    { label: "7-8", min: 7, max: 8 },
    { label: "9-10", min: 9, max: 10 },
    { label: "11-12", min: 11, max: 12 },
    { label: "13-14", min: 13, max: 14 },
    { label: "15-16", min: 15, max: 16 },
    { label: "17-18", min: 17, max: 18 },
    { label: "19-20", min: 19, max: 20 },
  ];
  const graded = rows
    .map((row) => row.finalScore)
    .filter((score): score is number => typeof score === "number");
  const sortedScores = [...graded].sort((a, b) => a - b);
  const frequencies = bins.map(
    (bin) => graded.filter((score) => score >= bin.min && score <= bin.max).length,
  );
  const max = Math.max(1, ...frequencies);
  const width = 420;
  const height = 116;
  const padX = 18;
  const padY = 18;
  const points = frequencies.map((count, index) => {
    const x = padX + (index / (bins.length - 1)) * (width - padX * 2);
    const y = height - padY - (count / max) * (height - padY * 2);
    return { x, y, count };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = `${padX},${height - padY} ${line} ${width - padX},${height - padY}`;
  const median =
    sortedScores.length === 0
      ? 0
      : sortedScores.length % 2
        ? sortedScores[Math.floor(sortedScores.length / 2)]
        : (sortedScores[sortedScores.length / 2 - 1] + sortedScores[sortedScores.length / 2]) / 2;
  const mean =
    graded.length === 0 ? 0 : graded.reduce((total, score) => total + score, 0) / graded.length;

  return (
    <div>
      {graded.length === 0 ? (
        <p className="grid h-24 place-items-center text-sm text-slate-500">
          No graded attempts yet.
        </p>
      ) : (
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-28 w-full"
          role="img"
          aria-label="Final score frequency polygon"
        >
          <defs>
            <linearGradient id="score-area" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#0891b2" stopOpacity="0.2" />
              <stop offset="100%" stopColor="#0891b2" stopOpacity="0.02" />
            </linearGradient>
          </defs>
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
          <polygon points={area} fill="url(#score-area)" />
          <polyline
            points={line}
            fill="none"
            stroke="#0891b2"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((point, index) => (
            <g key={bins[index].label}>
              <circle cx={point.x} cy={point.y} r="4" fill="#0891b2" />
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
      {graded.length > 0 && (
        <div className="mt-2 grid grid-cols-4 gap-1 text-[10px] text-slate-500">
          <span>
            min <strong className="font-mono font-medium text-slate-700">{sortedScores[0]}</strong>
          </span>
          <span>
            med <strong className="font-mono font-medium text-slate-700">{median.toFixed(1)}</strong>
          </span>
          <span>
            avg <strong className="font-mono font-medium text-slate-700">{mean.toFixed(1)}</strong>
          </span>
          <span>
            max{" "}
            <strong className="font-mono font-medium text-slate-700">
              {sortedScores[sortedScores.length - 1]}
            </strong>
          </span>
        </div>
      )}
    </div>
  );
}

function AppHeader({ user, onLogout }: { user?: SafeUser; onLogout?: () => void }) {
  return (
    <header className="border-b border-cyan-950/10 bg-white/55 backdrop-blur-xl">
      <div className="flex w-full items-center justify-between px-2 py-3 sm:px-3">
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
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-cyan-700">
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
        className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/15"
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
    <div className="rounded-md border border-cyan-950/10 bg-white/55 p-4">
      <div className="flex items-center gap-2 text-cyan-700">{icon}</div>
      <p className="mt-4 text-sm font-medium text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function SectionNav() {
  const items = [
    { href: "#daily-challenge", label: "Challenge", icon: <ShieldCheck size={15} /> },
    { href: "#metrics", label: "Metrics", icon: <CircleGauge size={15} /> },
    { href: "#social", label: "Social", icon: <Users size={15} /> },
  ];
  return (
    <nav className="sticky top-0 z-30 border-b border-cyan-950/10 bg-white/72 backdrop-blur-xl">
      <div className="flex w-full gap-6 overflow-x-auto px-2 py-2 sm:px-3">
        {items.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className="nav-link group flex h-8 shrink-0 items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-600 transition-colors hover:text-cyan-800"
          >
            <span className="text-cyan-700/80 group-hover:text-cyan-800">{item.icon}</span>
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}

function DashboardSkeleton() {
  return (
    <section className="grid w-full gap-4 px-2 py-4 sm:px-3">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(20rem,0.65fr)]">
        <div className="glass-panel rounded-md p-5">
          <SkeletonLine className="h-5 w-32" />
          <SkeletonLine className="mt-4 h-10 w-2/3" />
          <SkeletonLine className="mt-4 h-4 w-full" />
          <SkeletonLine className="mt-2 h-4 w-5/6" />
          <div className="mt-6 grid gap-2">
            <SkeletonLine className="h-12 w-full" />
            <SkeletonLine className="h-12 w-full" />
            <SkeletonLine className="h-12 w-full" />
          </div>
        </div>
        <div className="quiet-panel rounded-md p-5">
          <SkeletonLine className="h-5 w-36" />
          <SkeletonLine className="mt-4 h-4 w-full" />
          <SkeletonLine className="mt-2 h-4 w-4/5" />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-md border border-cyan-950/10 bg-white/55 p-4">
            <SkeletonLine className="h-4 w-16" />
            <SkeletonLine className="mt-5 h-8 w-24" />
          </div>
        ))}
      </div>
    </section>
  );
}

function SkeletonLine({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-slate-200/80 ${className}`} />;
}

function MetricsBand({
  grade,
  nextUnlock,
  rows,
  user,
}: {
  grade: Grade | null;
  nextUnlock: string;
  rows: ProgressRow[];
  user: SafeUser;
}) {
  return (
    <>
      <div className="grid gap-4">
        <Panel icon={<CircleGauge size={19} />} title="PIS trend">
          <PisTrendChart currentPis={user.pisScore} rows={rows} />
        </Panel>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <ScoreMeter value={user.pisScore} label="PIS" />
          <Metric icon={<Trophy size={18} />} label="ERT balance" value={String(user.ertBalance)} />
          <Metric icon={<Flame size={18} />} label="Current streak" value={`${user.currentStreak} days`} />
          <Metric icon={<CalendarClock size={18} />} label="Next challenge" value={nextUnlock} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(13rem,0.7fr)_minmax(13rem,0.7fr)]">
        <Panel icon={<Medal size={19} />} title="Score distribution" compact>
          <FrequencyPolygon rows={rows} />
        </Panel>
        <Panel icon={<CalendarClock size={19} />} title="Streak map" compact>
          <ActivityGrid rows={rows} />
        </Panel>
      </div>
      <div>
        {grade ? (
          <GradeSummary grade={grade} />
        ) : (
          <Panel icon={<FileText size={19} />} title="Daily scoresheet">
            <div className="grid gap-2">
              <SkeletonLine className="h-4 w-28" />
              <SkeletonLine className="h-4 w-full" />
              <SkeletonLine className="h-4 w-2/3" />
            </div>
          </Panel>
        )}
      </div>

      <CompactDetails title="Recent history">
        <ProgressPanel rows={rows} />
      </CompactDetails>
    </>
  );
}

function PisTrendChart({ currentPis, rows }: { currentPis: number; rows: ProgressRow[] }) {
  const series = rows
    .slice()
    .reverse()
    .slice(-14)
    .map((row) => ({ label: row.date.slice(5), value: row.pis }));
  if (series.length === 0) {
    series.push({ label: "Now", value: currentPis });
  }
  const values = series.map((item) => item.value);
  const min = Math.min(0, Math.floor(Math.min(...values) / 10) * 10);
  const max = Math.max(100, Math.ceil(Math.max(...values) / 10) * 10);
  const width = 620;
  const height = 190;
  const padX = 34;
  const padY = 24;
  const range = Math.max(1, max - min);
  const points = series.map((item, index) => {
    const x = padX + (series.length === 1 ? 0.5 : index / (series.length - 1)) * (width - padX * 2);
    const y = height - padY - ((item.value - min) / range) * (height - padY * 2);
    return { ...item, x, y };
  });
  const line = points.map((point) => `${point.x},${point.y}`).join(" ");
  const last = points[points.length - 1];

  return (
    <div className="grid gap-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-56 w-full rounded-md border border-cyan-950/10 bg-white/55"
        role="img"
        aria-label="PIS trend over recent challenges"
      >
        {[25, 50, 75].map((tick) => {
          const y = height - padY - ((tick - min) / range) * (height - padY * 2);
          return (
            <g key={tick}>
              <line x1={padX} x2={width - padX} y1={y} y2={y} stroke="rgba(15,23,42,0.08)" />
              <text x={8} y={y + 4} className="fill-slate-500 text-[10px]">
                {tick}
              </text>
            </g>
          );
        })}
        <polyline
          points={line}
          fill="none"
          stroke="#0891b2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        {points.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle cx={point.x} cy={point.y} r={index === points.length - 1 ? 5 : 3.5} fill="#0891b2" />
            {(index === 0 || index === points.length - 1 || index % 4 === 0) && (
              <text x={point.x} y={height - 6} textAnchor="middle" className="fill-slate-500 text-[10px]">
                {point.label}
              </text>
            )}
          </g>
        ))}
        <text x={last.x} y={Math.max(14, last.y - 12)} textAnchor="middle" className="fill-cyan-800 text-[12px] font-semibold">
          {last.value.toFixed(1)}
        </text>
      </svg>
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
      className="group rounded-md border border-cyan-950/10 bg-white/55"
      open={defaultOpen}
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-slate-900 marker:hidden">
        {title}
        <ChevronRight
          size={16}
          className="text-cyan-700 transition-transform group-open:rotate-90"
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
          <CheckCircle2 className="mt-1 shrink-0 text-cyan-700" size={14} />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );
}

function Panel({
  compact = false,
  icon,
  title,
  children,
}: {
  compact?: boolean;
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className={`quiet-panel rounded-md ${compact ? "p-4" : "p-5"}`}>
      <div className={`${compact ? "mb-3" : "mb-4"} flex items-center gap-2 text-cyan-700`}>
        {icon}
        <h3 className="font-semibold text-slate-950">{title}</h3>
      </div>
      {children}
    </section>
  );
}

function CompactDetails({
  children,
  defaultOpen = false,
  title,
}: {
  children: ReactNode;
  defaultOpen?: boolean;
  title: string;
}) {
  return (
    <details className="quiet-panel rounded-md p-4" open={defaultOpen}>
      <summary className="flex min-h-8 cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-900 marker:hidden">
        {title}
        <ChevronRight size={16} className="text-cyan-700" />
      </summary>
      <div className="mt-4">{children}</div>
    </details>
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
  notice,
  onExaminer,
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
  notice: ChallengeNotice | null;
  onExaminer: () => void;
}) {
  return (
    <div className="quiet-panel rounded-md p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <LockKeyhole size={16} className="text-cyan-700" />
          Submission
        </div>
        {!submission && hasDraft && (
          <span className="rounded-md bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-800">
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
            className="interactive-lift flex h-11 items-center justify-center gap-2 rounded-md bg-cyan-700 px-5 text-sm font-semibold text-white shadow-sm shadow-cyan-900/15"
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
      {!submission && (
        <div className="mt-4 rounded-md border border-slate-200 bg-white/65 p-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-800">Examiner</p>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Ask questions, explain constraints, state delays or excuses, or adjust future challenge behavior.
              </p>
            </div>
            <button
              type="button"
              onClick={onExaminer}
              className="interactive-lift h-10 rounded-md border border-cyan-700/20 bg-cyan-50 px-4 text-sm font-semibold text-cyan-800"
            >
              Talk to examiner
            </button>
          </div>
          {notice && (
            <p className="mt-3 rounded-md bg-slate-50 px-3 py-2 text-sm leading-6 text-slate-600">
              {notice.reply}
            </p>
          )}
        </div>
      )}
      {status && <p className="mt-3 text-sm font-medium text-cyan-800">{status}</p>}
    </div>
  );
}

function TeachingPanel({
  challenge,
  grade,
  plain = false,
  submission,
}: {
  challenge: Challenge;
  grade: Grade | null;
  plain?: boolean;
  submission: Submission | null;
}) {
  const wrap = (children: ReactNode) =>
    plain ? children : <Panel icon={<ShieldCheck size={19} />} title="Assessment teaching">{children}</Panel>;

  if (!submission) {
    return wrap(
        <div className="grid gap-3 text-sm leading-6 text-slate-600">
          <p>
            The full worked solution unlocks after you submit and grade the
            response. Until then, use the examiner chat for clarification without
            exposing the answer.
          </p>
          <p className="rounded-md bg-white/65 px-3 py-2 font-medium text-slate-800">
            Gate status: locked
          </p>
        </div>
    );
  }

  if (!grade) {
    return wrap(
        <div className="grid gap-3 text-sm leading-6 text-slate-600">
          <p>
            Your response is recorded. Grade it to unlock the worked solution,
            correction notes, and the next learning target.
          </p>
          <p className="rounded-md bg-cyan-50 px-3 py-2 font-medium text-cyan-900">
            Gate status: awaiting assessment
          </p>
        </div>
    );
  }

  const parsed = parseSubmissionContent(submission.content);
  const gaveEvidence = /\b(show|log|trace|output|because|therefore|verify|evidence|screenshot|config)\b/i.test(parsed.body);
  const gaveRisk = /\b(risk|rollback|avoid|blast radius|do not|contain)\b/i.test(parsed.body);
  const gaveRecommendation = /\b(recommend|fix|correct|next|validate|verify)\b/i.test(parsed.body);

  return wrap(
      <div className="grid gap-4">
        <div className="rounded-md border border-cyan-700/15 bg-cyan-50 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-800">
            Worked solution
          </p>
          <p className="mt-2 text-sm leading-6 text-cyan-950">{challenge.solution}</p>
        </div>

        <div className="grid gap-2 text-sm leading-6 text-slate-600">
          <AssessmentLine
            label="Correct"
            complete={gaveEvidence || grade.finalScore >= 13}
            text={gaveEvidence ? "You anchored at least part of the answer in observable evidence." : "The score indicates some useful reasoning, but the evidence trail needs sharper proof."}
          />
          <AssessmentLine
            label="Vague"
            complete={!gaveRecommendation || grade.technicalCap !== "NONE"}
            text="Any claim that is not tied to a command, artifact, measurement, or explicit tradeoff should be rewritten as testable evidence."
          />
          <AssessmentLine
            label="Risk"
            complete={gaveRisk}
            text={gaveRisk ? "You included risk or rollback thinking." : "Add rollback, blast radius, and what not to change before validation."}
          />
          <AssessmentLine
            label="Correction"
            complete={false}
            text={grade.correction}
          />
        </div>

        <p className="rounded-md bg-white/70 px-3 py-2 text-sm font-semibold leading-6 text-cyan-900">
          Next assessment focus: {grade.nextImprovementTarget}
        </p>
      </div>
  );
}

function AssessmentLine({
  complete,
  label,
  text,
}: {
  complete: boolean;
  label: string;
  text: string;
}) {
  return (
    <div className="rounded-md border border-slate-200 bg-white/65 p-3">
      <div className="flex items-center gap-2">
        <CheckCircle2 size={15} className={complete ? "text-cyan-700" : "text-amber-600"} />
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
          {label}
        </p>
      </div>
      <p className="mt-1">{text}</p>
    </div>
  );
}

function ExaminerChatModal({
  busy,
  messages,
  notice,
  open,
  onOpenChange,
  onSend,
}: {
  busy: boolean;
  messages: ExaminerMessage[];
  notice: ChallengeNotice | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSend: (message: string) => void;
}) {
  const [message, setMessage] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim()) return;
    onSend(message);
    setMessage("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Examiner chat</DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 gap-3">
          {notice && (
            <div className="rounded-md border border-cyan-700/15 bg-cyan-50 px-3 py-2 text-sm leading-6 text-cyan-900">
              {notice.reply}
            </div>
          )}
          <div className="max-h-[26rem] min-h-[16rem] overflow-auto rounded-md border border-slate-200 bg-white/70 p-3">
            {messages.length === 0 ? (
              <div className="grid h-44 place-items-center text-center text-sm leading-6 text-slate-500">
                <p>
                  Ask the examiner about rules, grading expectations, late work,
                  excuses, or future challenge preferences.
                </p>
              </div>
            ) : (
              <div className="grid gap-3">
                {messages.map((item) => (
                  <div
                    key={item.id}
                    className={`max-w-[88%] rounded-md px-3 py-2 text-sm leading-6 ${
                      item.role === "user"
                        ? "ml-auto bg-cyan-700 text-white"
                        : "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {item.content}
                  </div>
                ))}
              </div>
            )}
          </div>

          <form onSubmit={submit} className="grid gap-2">
            <textarea
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              className="min-h-24 resize-none rounded-md border border-slate-300 bg-white p-3 text-sm outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/15"
              placeholder="Example: I will be late because of a work outage. Also make my next challenge Linux-focused and 60 minutes."
            />
            <div className="flex justify-end">
              <button
                disabled={busy || !message.trim()}
                className="flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                {busy ? <Loader2 className="animate-spin" size={16} /> : <ChevronRight size={16} />}
                Send
              </button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
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
  const readiness = useMemo(
    () => responseReadiness(body, attachments),
    [attachments, body],
  );
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

  function applyTemplate(templateBody: string) {
    const next = body.trim() ? `${body.trimEnd()}\n\n${templateBody}` : templateBody;
    onBodyChange(next);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function insertSection(title: string) {
    insert(`${body.trim() ? "\n\n" : ""}## `, "\n", title);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[92vh] overflow-y-auto sm:max-w-5xl"
        onPointerDownOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Challenge response</DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.9fr)]">
          <div className="grid min-h-0 gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {responseTemplates.map((template) => (
                <button
                  key={template.label}
                  type="button"
                  onClick={() => applyTemplate(template.body)}
                  className="h-8 rounded-md border border-cyan-700/15 bg-cyan-50 px-3 text-xs font-semibold text-cyan-800"
                >
                  {template.label}
                </button>
              ))}
              <span className="mx-1 h-5 w-px bg-slate-200" />
              {responseOutlineChips.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => insertSection(chip)}
                  className="h-8 rounded-md border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-600"
                >
                  {chip}
                </button>
              ))}
            </div>

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
              className="min-h-[24rem] max-h-[55vh] resize-y overflow-auto rounded-md border border-slate-300 bg-white p-4 font-mono text-sm leading-6 outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/15"
              placeholder="Write with headings, bullets, command output, code blocks, and attached screenshots or files."
            />
          </div>

          <div className="grid min-h-0 gap-3">
            <ResponseReadinessPanel readiness={readiness} />
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
              className="flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
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

function responseReadiness(body: string, attachments: SubmissionAttachment[]) {
  const text = body.trim();
  const checks = [
    {
      label: "Clear hypothesis",
      complete: /\b(hypothesis|likely|root cause|suspect)\b/i.test(text),
    },
    {
      label: "Evidence trail",
      complete: /^\s*(-|\*|\d+\.)\s+\S/m.test(text) || attachments.length > 0,
    },
    {
      label: "Commands or artifacts",
      complete: /```[\s\S]+```/.test(text) || /\b(show|journalctl|tcpdump|dig|curl|kubectl|grep|awk|systemctl|ip\s)\b/i.test(text),
    },
    {
      label: "Risk / rollback",
      complete: /\b(risk|rollback|contain|do not|avoid|blast radius)\b/i.test(text),
    },
    {
      label: "Recommendation",
      complete: /\b(recommend|fix|correct|next|validate|verify)\b/i.test(text),
    },
  ];
  const score = Math.round((checks.filter((check) => check.complete).length / checks.length) * 100);
  return { checks, score };
}

function ResponseReadinessPanel({
  readiness,
}: {
  readiness: ReturnType<typeof responseReadiness>;
}) {
  const tone =
    readiness.score >= 80
      ? "text-cyan-800"
      : readiness.score >= 50
        ? "text-amber-800"
        : "text-slate-600";

  return (
    <div className="rounded-md border border-slate-200 bg-white/70 p-4">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Submit readiness
          </p>
          <p className={`text-2xl font-semibold ${tone}`}>{readiness.score}%</p>
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
          {readiness.checks.filter((check) => check.complete).length}/{readiness.checks.length}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-cyan-700"
          style={{ width: `${readiness.score}%` }}
        />
      </div>
      <div className="mt-3 grid gap-2">
        {readiness.checks.map((check) => (
          <div key={check.label} className="flex items-center gap-2 text-sm text-slate-600">
            <CheckCircle2
              size={15}
              className={check.complete ? "text-cyan-700" : "text-slate-300"}
            />
            <span>{check.label}</span>
          </div>
        ))}
      </div>
    </div>
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
      className="grid size-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 hover:border-cyan-700/30 hover:text-cyan-800"
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
          className="interactive-lift flex h-11 w-fit items-center justify-center gap-2 rounded-md bg-cyan-700 px-5 text-sm font-semibold text-white shadow-sm shadow-cyan-900/15 disabled:opacity-60"
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
          <span className="text-cyan-700">-</span>
          <span>{line.replace(/^\s*(-|\*)\s+/, "")}</span>
        </div>,
      );
    } else if (/^\s*\d+\.\s+\S/.test(line)) {
      nodes.push(
        <div key={`number-${index}`} className="flex gap-2">
          <span className="font-semibold text-cyan-800">
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
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Result label="Verdict" value={grade.verdict} />
          <Result label="Raw /20" value={grade.rawScore} />
          <Result label="Final /20" value={grade.finalScore} />
          <Result label="ERT earned" value={grade.ertEarned} />
        </div>
        <div className="rounded-md border border-slate-200 bg-white/65 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Examiner correction
          </p>
          <p className="mt-2 text-sm leading-6 text-slate-600">{grade.correction}</p>
        </div>
        <p className="rounded-md bg-cyan-50 px-3 py-2 text-sm font-semibold leading-6 text-cyan-900">
          Next target: {grade.nextImprovementTarget}
        </p>
      </div>
    </Panel>
  );
}

function Result({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-white/60 p-3">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 break-words text-lg font-semibold leading-6 text-slate-950">{value}</p>
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
        <button disabled={busy} className="h-10 rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
          Redeem
        </button>
      </form>
    </Panel>
  );
}

function ProgressPanel({ rows }: { rows: ProgressRow[] }) {
  return (
    <div className="grid gap-3">
        <h2 className="text-sm font-semibold text-slate-900">Progress tracker</h2>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
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
  );
}

function VersatilityPanel({
  busy,
  cohorts,
  settings,
  onCreateCohort,
  onJoinCohort,
  onSaveSettings,
}: {
  busy: boolean;
  cohorts: CohortSummary[];
  settings: ChallengeSettings;
  onCreateCohort: (event: FormEvent<HTMLFormElement>) => void;
  onJoinCohort: (event: FormEvent<HTMLFormElement>) => void;
  onSaveSettings: (settings: ChallengeSettings) => void;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
      <Panel icon={<CircleGauge size={20} />} title="Challenge tracks">
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            onSaveSettings({
              track: String(form.get("track") || "networking"),
              durationMinutes: Number(form.get("durationMinutes") || 45),
              difficultyFloor: String(form.get("difficultyFloor") || "Normal"),
              topicFocus: String(form.get("topicFocus") || ""),
              recoveryMode: form.get("recoveryMode") === "on",
              teamMode: form.get("teamMode") === "on",
            });
          }}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Track
              <select
                name="track"
                defaultValue={settings.track}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                {trackOptions.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Difficulty floor
              <select
                name="difficultyFloor"
                defaultValue={settings.difficultyFloor}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                {difficultyOptions.map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid gap-3 sm:grid-cols-[0.55fr_1fr]">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Duration
              <input
                name="durationMinutes"
                type="number"
                min={15}
                max={180}
                defaultValue={settings.durationMinutes}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Topic focus
              <input
                name="topicFocus"
                defaultValue={settings.topicFocus}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
                placeholder="BGP policy, journald, packet captures..."
              />
            </label>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white/60 px-3 py-2 text-sm text-slate-700">
              <input
                name="recoveryMode"
                type="checkbox"
                defaultChecked={settings.recoveryMode}
              />
              Recovery mode
            </label>
            <label className="flex items-center gap-2 rounded-md border border-slate-200 bg-white/60 px-3 py-2 text-sm text-slate-700">
              <input
                name="teamMode"
                type="checkbox"
                defaultChecked={settings.teamMode}
              />
              Team/cohort mode
            </label>
          </div>
          <button
            disabled={busy}
            className="h-10 w-fit rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
          >
            Save settings
          </button>
        </form>
      </Panel>

      <Panel icon={<Users size={20} />} title="Cohort challenges">
        <div className="grid gap-4">
          <form onSubmit={onCreateCohort} className="grid gap-2 lg:grid-cols-[1fr_0.7fr_0.7fr_0.45fr_auto]">
            <input name="name" required className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" placeholder="Cohort name" />
            <select name="track" className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" defaultValue={settings.track}>
              {trackOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select name="difficulty" className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" defaultValue={settings.difficultyFloor}>
              {difficultyOptions.map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
            <input name="completionWindowHours" type="number" min={4} max={168} defaultValue={24} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" />
            <button disabled={busy} className="h-10 rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white disabled:opacity-60">
              Create
            </button>
          </form>
          <form onSubmit={onJoinCohort} className="grid gap-2 sm:grid-cols-[1fr_auto]">
            <input name="inviteCode" required className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm uppercase" placeholder="Invite code" />
            <button disabled={busy} className="h-10 rounded-md border border-cyan-700/20 bg-cyan-50 px-4 text-sm font-semibold text-cyan-800 disabled:opacity-60">
              Join
            </button>
          </form>
          <div className="grid gap-3">
            {cohorts.length === 0 && (
              <p className="text-sm leading-6 text-slate-600">
                Create a cohort challenge to share an invite code, completion window, and team leaderboard.
              </p>
            )}
            {cohorts.map((cohort) => (
              <div key={cohort.id} className="rounded-md border border-slate-200 bg-white/65 p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <div>
                    <p className="font-semibold text-slate-900">{cohort.name}</p>
                    <p className="text-xs text-slate-500">
                      {trackName(cohort.track)} · {cohort.difficulty} · {cohort.completionWindowHours}h · {cohort.memberCount} members
                    </p>
                  </div>
                  <span className="h-fit rounded-md bg-slate-100 px-2 py-1 font-mono text-xs font-semibold text-slate-700">
                    {cohort.inviteCode}
                  </span>
                </div>
                {cohort.leaderboard.length > 0 && (
                  <div className="mt-3 grid gap-1">
                    {cohort.leaderboard.map((row) => (
                      <div key={row.id} className="grid grid-cols-[auto_1fr_auto] gap-3 text-sm text-slate-600">
                        <span className="font-semibold text-cyan-800">#{row.rank}</span>
                        <span>{row.name}</span>
                        <span>{row.pisScore.toFixed(1)} PIS</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </Panel>
    </div>
  );
}

function trackName(track: string) {
  return trackOptions.find(([value]) => value === track)?.[1] ?? track;
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
    <Panel icon={<Users size={20} />} title="Social hub">
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,0.72fr)]">
        <div className="grid gap-4">
          <div className="overflow-x-auto rounded-md border border-slate-200 bg-white/65">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 text-slate-500">
                <tr>
                {["Rank", "Profile", "Preferred profession", "PIS", "Streak", "Latest"].map((head) => (
                    <th key={head} className="px-3 py-3 font-semibold">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {social.leaderboard.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-3 font-semibold text-cyan-800">#{row.rank}</td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-900">
                        {row.name}
                        {row.isYou ? " (you)" : ""}
                      </p>
                      <p className="text-xs text-slate-500">{row.handle}</p>
                    </td>
                    <td className="px-3 py-3 text-slate-600">{row.preferredProfession}</td>
                    <td className="px-3 py-3">{row.pisScore.toFixed(1)}</td>
                    <td className="px-3 py-3">{row.currentStreak}</td>
                    <td className="px-3 py-3">{row.latestScore ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <details className="rounded-md border border-slate-200 bg-white/55 p-3">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-900 marker:hidden">
              Marketplace
              <span className="text-xs font-medium text-slate-500">
                {social.marketplace.length} challenges
              </span>
            </summary>
            <div className="mt-3 grid gap-2">
              {social.marketplace.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  className="grid gap-3 rounded-md border border-slate-200 bg-white/65 p-3 sm:grid-cols-[1fr_auto]"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.14em] text-cyan-800">
                      {item.topic} · {item.difficulty}
                    </p>
                    <h3 className="mt-1 font-semibold text-slate-950">{item.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-slate-600">{item.summary}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => onEnroll(item.id)}
                    disabled={busy || item.isEnrolled}
                    className="h-9 rounded-md border border-cyan-700/20 bg-cyan-50 px-3 text-sm font-semibold text-cyan-800 disabled:opacity-60"
                  >
                    {item.isEnrolled ? "Enrolled" : "Enroll"}
                  </button>
                </div>
              ))}
            </div>
          </details>
        </div>

        <aside className="rounded-md border border-slate-200 bg-white/60 p-4">
          <form onSubmit={onAddFriend} className="grid gap-3">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Add friend
              <input
                name="email"
                type="email"
                required
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/15"
                placeholder="friend@example.com"
              />
            </label>
            <button
              disabled={busy}
              className="h-10 rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              Add friend
            </button>
          </form>

          <div className="mt-5 grid gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Public profiles
            </p>
            {social.profiles.map((profile) => (
              <div
                key={profile.id}
                className="grid grid-cols-[1fr_auto] gap-3 rounded-md border border-slate-200 bg-white/70 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-900">
                    {profile.name}
                    {profile.isYou ? " (you)" : ""}
                  </p>
                  <p className="truncate text-xs text-slate-500">{profile.handle}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold text-cyan-800">{profile.pisScore.toFixed(1)} PIS</p>
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
        </aside>
      </div>
    </Panel>
  );
}

function NotebookPanel({
  busy,
  entries,
  redemptions,
  onAskExaminer,
}: {
  busy: boolean;
  entries: NotebookEntry[];
  redemptions: Redemption[];
  onAskExaminer: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [localEntries, setLocalEntries] = useState(() => entries);

  return (
    <div className="grid gap-5">
      <Panel icon={<NotebookTabs size={20} />} title="Engineering notebook">
        <div className="grid gap-4 md:grid-cols-[1fr_auto] md:items-center">
          <div>
            <p className="text-sm leading-6 text-slate-600">
              Search graded notes, add your own findings, revise lessons, and ask
              the examiner to use the notebook as context.
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              {localEntries.length} notes
            </p>
          </div>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="interactive-lift h-10 rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white"
          >
            Open notebook
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          {localEntries.length === 0 && <p className="text-sm text-slate-600">No notebook entries yet.</p>}
          {localEntries.slice(0, 3).map((entry) => (
            <div key={entry.id} className="rounded-md border border-slate-200 bg-white/60 p-3">
              <p className="font-medium text-slate-800">{entry.title}</p>
              <p className="mt-1 line-clamp-2 text-sm leading-6 text-slate-600">{entry.summary}</p>
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
                <p className="font-semibold text-cyan-800">-{item.cost}</p>
                <p className="text-xs text-slate-500">Bal {item.balanceAfter}</p>
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <NotebookAppModal
        busy={busy}
        entries={localEntries}
        open={open}
        onAskExaminer={onAskExaminer}
        onEntriesChange={setLocalEntries}
        onOpenChange={setOpen}
      />
    </div>
  );
}

function NotebookAppModal({
  busy,
  entries,
  open,
  onAskExaminer,
  onEntriesChange,
  onOpenChange,
}: {
  busy: boolean;
  entries: NotebookEntry[];
  open: boolean;
  onAskExaminer: () => void;
  onEntriesChange: (entries: NotebookEntry[]) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [notebookBusy, setNotebookBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [draft, setDraft] = useState({
    title: "",
    summary: "",
    lessons: "",
    tags: "",
  });
  const filtered = entries.filter((entry) => {
    const haystack = `${entry.title} ${entry.summary} ${entry.lessons.join(" ")} ${entry.tags.join(" ")}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  function resetDraft() {
    setEditingId(null);
    setDraft({ title: "", summary: "", lessons: "", tags: "" });
  }

  function edit(entry: NotebookEntry) {
    setEditingId(entry.id);
    setDraft({
      title: entry.title,
      summary: entry.summary,
      lessons: entry.lessons.join("\n"),
      tags: entry.tags.join(", "),
    });
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setNotebookBusy(true);
    setStatus("");
    const payload = {
      title: draft.title,
      summary: draft.summary,
      lessons: splitLines(draft.lessons),
      tags: splitTags(draft.tags),
    };
    try {
      if (editingId) {
        const result = await apiRequest<{ entry: NotebookEntry }>(`/api/notebook/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify({
            summary: payload.summary,
            lessons: payload.lessons,
            tags: payload.tags,
          }),
        });
        onEntriesChange(entries.map((entry) => (entry.id === editingId ? result.entry : entry)));
        setStatus("Notebook entry updated.");
      } else {
        const result = await apiRequest<{ entry: NotebookEntry }>("/api/notebook", {
          method: "POST",
          body: JSON.stringify(payload),
        });
        onEntriesChange([result.entry, ...entries]);
        setStatus("Notebook entry created.");
      }
      resetDraft();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Notebook save failed");
    } finally {
      setNotebookBusy(false);
    }
  }

  async function remove(entryId: string) {
    setNotebookBusy(true);
    setStatus("");
    try {
      await apiRequest<{ ok: true }>(`/api/notebook/${entryId}`, { method: "DELETE" });
      onEntriesChange(entries.filter((entry) => entry.id !== entryId));
      if (editingId === entryId) resetDraft();
      setStatus("Notebook entry deleted.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Notebook delete failed");
    } finally {
      setNotebookBusy(false);
    }
  }

  function askExaminerWithNotebook() {
    onOpenChange(false);
    onAskExaminer();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Engineering notebook</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(19rem,0.9fr)]">
          <div className="grid gap-3">
            <label className="flex h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-600">
              <Search size={16} className="text-cyan-700" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-full min-w-0 flex-1 bg-transparent outline-none"
                placeholder="Search notes, lessons, commands, tags"
              />
            </label>

            <div className="max-h-[32rem] overflow-auto rounded-md border border-slate-200 bg-white/65 p-3">
              {filtered.length === 0 ? (
                <p className="grid h-32 place-items-center text-sm text-slate-500">
                  No matching notes.
                </p>
              ) : (
                <div className="grid gap-3">
                  {filtered.map((entry) => (
                    <article key={entry.id} className="rounded-md border border-slate-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-slate-950">{entry.title}</h3>
                          <p className="mt-1 text-sm leading-6 text-slate-600">{entry.summary}</p>
                        </div>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => edit(entry)}
                            className="grid size-8 place-items-center rounded-md border border-slate-200 text-slate-600 hover:text-cyan-800"
                            title="Edit note"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button"
                            onClick={() => void remove(entry.id)}
                            disabled={busy || notebookBusy}
                            className="grid size-8 place-items-center rounded-md border border-slate-200 text-slate-600 hover:text-orange-700 disabled:opacity-50"
                            title="Delete note"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      {entry.lessons.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {entry.lessons.slice(0, 3).map((lesson) => (
                            <span key={lesson} className="rounded-md bg-cyan-50 px-2 py-1 text-xs font-medium text-cyan-900">
                              {lesson}
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </div>

          <form onSubmit={save} className="grid gap-3 rounded-md border border-slate-200 bg-white/65 p-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-slate-950">
                {editingId ? "Edit note" : "Create note"}
              </h3>
              {editingId && (
                <button type="button" onClick={resetDraft} className="text-xs font-semibold text-slate-500">
                  New note
                </button>
              )}
            </div>
            <input
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
              disabled={Boolean(editingId)}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm disabled:bg-slate-100"
              placeholder="Title"
            />
            <textarea
              value={draft.summary}
              onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))}
              className="min-h-36 rounded-md border border-slate-300 p-3 text-sm leading-6"
              placeholder="What did you learn, observe, or want to reuse?"
            />
            <textarea
              value={draft.lessons}
              onChange={(event) => setDraft((current) => ({ ...current, lessons: event.target.value }))}
              className="min-h-24 rounded-md border border-slate-300 p-3 text-sm leading-6"
              placeholder="Lessons, one per line"
            />
            <input
              value={draft.tags}
              onChange={(event) => setDraft((current) => ({ ...current, tags: event.target.value }))}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
              placeholder="Tags, comma separated"
            />
            <button
              disabled={busy || notebookBusy || !draft.summary.trim() || (!editingId && !draft.title.trim())}
              className="h-10 rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {editingId ? "Update note" : "Create note"}
            </button>
            <button
              type="button"
              onClick={askExaminerWithNotebook}
              className="h-10 rounded-md border border-cyan-700/20 bg-cyan-50 px-4 text-sm font-semibold text-cyan-800"
            >
              Ask examiner with notebook context
            </button>
            {status && <p className="text-sm font-medium text-cyan-800">{status}</p>}
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function splitLines(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function splitTags(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 12);
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
    <footer className="flex w-full flex-col gap-2 px-2 pb-6 pt-2 text-xs text-slate-500 sm:px-3 md:flex-row md:items-center md:justify-between">
      <p>© {new Date().getFullYear()} GURUnet. Licensed under Apache-2.0.</p>
      <div className="flex items-center gap-3">
        <a href="/admin" className="text-slate-400 transition-colors hover:text-cyan-800" aria-label="System settings" title="System">
          <Settings size={15} />
        </a>
        <p className="font-mono text-cyan-800">GURUnet · Designed by Kikandi.</p>
      </div>
    </footer>
  );
}
