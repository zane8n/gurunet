"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent, FormEvent, ReactNode } from "react";
import {
  BookOpenText,
  Bold,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Code2,
  Command,
  Download,
  FileText,
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
  Moon,
  NotebookTabs,
  Pencil,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
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
  weakPatterns: string[];
  unsafePatterns: string[];
  rubric: Record<string, { label: string; description: string }>;
  targetDifficulty: string;
  weeklyTimeBudgetHours: number;
  preferenceNotes?: string;
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
  weakPatterns: string[];
  unsafePatterns: string[];
  rubric: Record<string, { label: string; description: string }>;
  targetDifficulty: string;
  weeklyTimeBudgetHours: number;
  preferenceNotes?: string;
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
type ThemeMode = "light" | "dark";
const themeStorageKey = "gurunet.theme.v1";

function initialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  try {
    const saved = localStorage.getItem(themeStorageKey);
    if (saved === "dark" || saved === "light") return saved;
    return "light";
  } catch {
    return "light";
  }
}

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

const professionalGoalOptions = [
  "Stronger troubleshooting discipline",
  "Better technical communication",
  "Production-ready judgment",
  "Broader STEM fluency",
  "Interview/certification readiness",
  "Build a reusable notebook",
];

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
  const [commandOpen, setCommandOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => initialTheme());
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
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem(themeStorageKey, theme);
  }, [theme]);

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

  async function exportLearningRecord() {
    setBusy(true);
    setStatus("");
    try {
      const response = await fetch("/api/me/export", { cache: "no-store" });
      if (!response.ok) {
        const text = await response.text();
        let message = text || response.statusText;
        try {
          const parsed = JSON.parse(text) as { error?: string };
          message = parsed.error || message;
        } catch {
          // Keep the raw response when it is not JSON.
        }
        throw new Error(message);
      }

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
      setStatus("Learning export downloaded.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Learning export failed");
    } finally {
      setBusy(false);
    }
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

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (dashboard && user && today) setCommandOpen((open) => !open);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dashboard, today, user]);

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

  function updateAccountUser(updatedUser: SafeUser) {
    setDashboard((current) => (current ? { ...current, user: updatedUser } : current));
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
  const commandActions = useMemo(
    () =>
      dashboard && user && today
        ? [
            {
              id: "focus",
              title: "Open focus mode",
              description: "Work from a clean challenge workspace with only the assessment and actions.",
              shortcut: "O",
              action: () => setFocusOpen(true),
            },
            {
              id: "respond",
              title: todaySubmission ? "View submitted response" : hasDraft ? "Continue response" : "Respond to challenge",
              description: "Open the response editor and evidence workspace.",
              shortcut: "R",
              action: () => setResponseOpen(true),
            },
            {
              id: "examiner",
              title: "Talk to examiner",
              description: "Ask about grading, rules, delays, excuses, or future challenge settings.",
              shortcut: "E",
              action: () => void openExaminer(),
            },
            {
              id: "challenge",
              title: "Go to challenge",
              description: "Jump to today's assessment brief.",
              shortcut: "1",
              action: () => scrollToSection("daily-challenge"),
            },
            {
              id: "metrics",
              title: "Go to metrics",
              description: "Review PIS, ERT, streaks, distribution, and recent history.",
              shortcut: "2",
              action: () => scrollToSection("metrics"),
            },
            {
              id: "social",
              title: "Go to social and cohorts",
              description: "Open leaderboards, marketplace, cohorts, notebook, and rewards.",
              shortcut: "3",
              action: () => scrollToSection("social"),
            },
            {
              id: "sample",
              title: "Load sample response",
              description: "Insert a model response outline into the editor.",
              shortcut: "S",
              action: loadSampleAnswer,
            },
            {
              id: "refresh",
              title: "Refresh dashboard",
              description: "Reload challenge, metrics, notebook, and social state.",
              shortcut: "F",
              action: () => void loadDashboard(),
            },
            {
              id: "export",
              title: "Export learning record",
              description: "Download your profile, challenges, grades, notebook, and social learning state.",
              shortcut: "X",
              action: () => void exportLearningRecord(),
            },
            {
              id: "account",
              title: "Account settings",
              description: "Update profile details, change password, export data, or delete your account.",
              shortcut: "A",
              action: () => setAccountOpen(true),
            },
          ]
        : [],
    [dashboard, hasDraft, today, todaySubmission, user],
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
            <p className="w-fit rounded-md border border-slate-300 bg-white/75 px-3 py-1 font-mono text-xs uppercase tracking-[0.16em] text-slate-600">
              Daily capacity builder
            </p>
            <h1 className="mt-5 max-w-3xl text-4xl font-semibold tracking-normal sm:text-5xl">
              Build professional judgment through one serious challenge a day.
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
              GURUnet is a structured practice platform for technical learners.
              It gives you a daily assessment, grades the evidence you submit,
              tracks discipline over time, and turns corrections into a reusable
              engineering notebook.
            </p>
            <div className="mt-6 grid gap-3 text-sm leading-6 text-slate-600 md:grid-cols-3">
              <div className="rounded-md border border-slate-200 bg-white/60 p-4">
                <p className="font-semibold text-slate-950">Practice loop</p>
                <p className="mt-2">Receive one tailored challenge, submit work before the deadline, and review the correction.</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-white/60 p-4">
                <p className="font-semibold text-slate-950">Evidence first</p>
                <p className="mt-2">Responses can include notes, commands, screenshots, files, and structured reasoning.</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-white/60 p-4">
                <p className="font-semibold text-slate-950">Long memory</p>
                <p className="mt-2">PIS, ERT, streaks, and notebook entries show whether your discipline is compounding.</p>
              </div>
            </div>
            <div className="mt-6 grid gap-3 sm:grid-cols-3">
              <Metric icon={<CircleGauge size={18} />} label="PIS starts" value="50" />
              <Metric icon={<CalendarClock size={18} />} label="Deadline" value="15:00" />
              <Metric icon={<LockKeyhole size={18} />} label="Solutions" value="Locked" />
            </div>
            <LandingDepthStrip />
          </div>

          <form
            onSubmit={handleAuth}
            className="glass-panel interactive-lift self-start rounded-md p-5"
          >
            <div className="flex rounded-md bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setAuthMode("signup")}
                className={`interactive-lift flex h-10 flex-1 items-center justify-center gap-2 rounded-md text-sm font-semibold ${authMode === "signup" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"}`}
              >
                <UserPlus size={16} />
                Sign up
              </button>
              <button
                type="button"
                onClick={() => setAuthMode("login")}
                className={`interactive-lift flex h-10 flex-1 items-center justify-center gap-2 rounded-md text-sm font-semibold ${authMode === "login" ? "bg-white text-slate-950 shadow-sm" : "text-slate-600"}`}
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
              className="interactive-lift mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm shadow-slate-900/15 disabled:opacity-60"
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
      <AppHeader
        user={user}
        onAccount={() => setAccountOpen(true)}
        onCommand={() => setCommandOpen(true)}
        onExport={() => void exportLearningRecord()}
        onThemeToggle={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
        onLogout={logout}
        theme={theme}
      />
      <DashboardWorkspace
        busy={busy}
        dashboard={dashboard}
        deadline={deadline}
        disciplines={disciplines}
        draftSavedAt={draftSavedAt}
        grade={todayGrade}
        hasDraft={hasDraft}
        nextUnlock={nextUnlock}
        onAddFriend={addFriend}
        onCreateCohort={createCohort}
        onEnrollMarketplace={enrollMarketplace}
        onExaminer={openExaminer}
        onFocus={() => setFocusOpen(true)}
        onGrade={gradeSubmission}
        onJoinCohort={joinCohort}
        onOpenResponse={() => setResponseOpen(true)}
        onRedeem={redeem}
        onSample={loadSampleAnswer}
        onSaveProfile={saveStudyProfile}
        onSaveSettings={saveChallengeSettings}
        onVerify={answerVerification}
        profileErrors={profileErrors}
        setVerification={setVerification}
        status={status}
        submission={todaySubmission ?? null}
        user={user}
        verification={verification}
      />

      <ResponseEditorModal
        attachments={draftAttachments}
        body={draftBody}
        busy={busy}
        challenge={today}
        open={responseOpen}
        savedAt={draftSavedAt}
        onAddFiles={addDraftFiles}
        onBodyChange={updateDraftBody}
        onOpenChange={setResponseOpen}
        onRemoveAttachment={removeDraftAttachment}
        onSubmit={submitAnswer}
      />
      <ChallengeFocusModal
        challenge={today}
        deadline={deadline}
        hasDraft={hasDraft}
        nextUnlock={nextUnlock}
        open={focusOpen}
        submission={todaySubmission ?? null}
        grade={todayGrade}
        onExaminer={openExaminer}
        onOpenChange={setFocusOpen}
        onRespond={() => setResponseOpen(true)}
      />
      <ExaminerChatModal
        busy={busy}
        messages={examinerMessages}
        notice={dashboard.todayNotice}
        open={examinerOpen}
        onOpenChange={setExaminerOpen}
        onSend={sendExaminerMessage}
      />
      <CommandPalette
        actions={commandActions}
        open={commandOpen}
        onOpenChange={setCommandOpen}
      />
      {user && (
        <AccountSettingsModal
          key={`${user.id}:${accountOpen ? "open" : "closed"}`}
          open={accountOpen}
          user={user}
          onDeleted={() => {
            setAccountOpen(false);
            setDashboard(null);
            window.location.assign("/");
          }}
          onExport={() => void exportLearningRecord()}
          onOpenChange={setAccountOpen}
          onUserUpdated={updateAccountUser}
        />
      )}
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

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function LandingDepthStrip() {
  const items = [
    {
      title: "Profile-driven",
      text: "Challenges adapt to discipline, level, evidence style, weak areas, and preferred formats.",
    },
    {
      title: "Strict correction",
      text: "The solution gate teaches what was right, false, vague, missing, and unsafe after grading.",
    },
    {
      title: "Cohort-ready",
      text: "Use friends, leaderboards, shared windows, and invite codes when training with other testers.",
    },
  ];
  return (
    <div className="mt-6 rounded-md border border-slate-200 bg-white/55 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
        Inside the platform
      </p>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.title} className="rounded-md bg-white/60 p-3">
            <p className="font-semibold text-slate-950">{item.title}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">{item.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DashboardWorkspace({
  busy,
  dashboard,
  deadline,
  disciplines,
  draftSavedAt,
  grade,
  hasDraft,
  nextUnlock,
  onAddFriend,
  onCreateCohort,
  onEnrollMarketplace,
  onExaminer,
  onFocus,
  onGrade,
  onJoinCohort,
  onOpenResponse,
  onRedeem,
  onSample,
  onSaveProfile,
  onSaveSettings,
  onVerify,
  profileErrors,
  setVerification,
  status,
  submission,
  user,
  verification,
}: {
  busy: boolean;
  dashboard: Dashboard;
  deadline: string;
  disciplines: DisciplineTemplate[];
  draftSavedAt: string;
  grade: Grade | null;
  hasDraft: boolean;
  nextUnlock: string;
  onAddFriend: (event: FormEvent<HTMLFormElement>) => void;
  onCreateCohort: (event: FormEvent<HTMLFormElement>) => void;
  onEnrollMarketplace: (challengeId: string) => void;
  onExaminer: () => void;
  onFocus: () => void;
  onGrade: () => void;
  onJoinCohort: (event: FormEvent<HTMLFormElement>) => void;
  onOpenResponse: () => void;
  onRedeem: (event: FormEvent<HTMLFormElement>) => void;
  onSample: () => void;
  onSaveProfile: (input: unknown) => void;
  onSaveSettings: (settings: ChallengeSettings) => void;
  onVerify: () => void;
  profileErrors: string[];
  setVerification: (value: string) => void;
  status: string;
  submission: Submission | null;
  user: SafeUser;
  verification: string;
}) {
  return (
    <section className="astrowind-shell">
      <DashboardHero
        dashboard={dashboard}
        deadline={deadline}
        grade={grade}
        hasDraft={hasDraft}
        nextUnlock={nextUnlock}
        onExaminer={onExaminer}
        onGrade={onGrade}
        onOpenResponse={onOpenResponse}
        submission={submission}
        user={user}
      />

      <AstroSection
        id="daily-challenge"
        eyebrow="Daily assessment"
        title="Today's challenge"
        text="A single evidence-led brief, a response workspace, and the examiner route in one focused section."
      >
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,0.42fr)]">
          <ChallengeWidget
            busy={busy}
            challenge={dashboard.today}
            draftSavedAt={draftSavedAt}
            grade={grade}
            hasDraft={hasDraft}
            nextUnlock={nextUnlock}
            notice={dashboard.todayNotice}
            onExaminer={onExaminer}
            onFocus={onFocus}
            onGrade={onGrade}
            onOpen={onOpenResponse}
            onSample={onSample}
            onVerify={onVerify}
            setVerification={setVerification}
            status={status}
            submission={submission}
            verification={verification}
          />
          <div className="grid content-start gap-4">
            {grade ? (
              <GradeSummary grade={grade} plain />
            ) : (
              <AstroCard title="Score unlock">
                <EmptyState
                  title="No grade yet"
                  text="Submit and grade today's response to unlock the daily scoresheet, correction, PIS movement, and ERT result."
                />
              </AstroCard>
            )}
            <RewardPanel busy={busy} onRedeem={onRedeem} plain />
          </div>
        </div>
      </AstroSection>

      <AstroSection
        id="metrics"
        eyebrow="Signals"
        title="Progress without the control room clutter"
        text="The key training signals are grouped as a simple reading section: trend, distribution, streak behavior, and recent history."
      >
        <div className="grid gap-4 lg:grid-cols-3">
          <AstroCard title="PIS trend" className="lg:col-span-2">
            <PisTrendChart currentPis={user.pisScore} rows={dashboard.progress} />
          </AstroCard>
          <AstroCard title="Streak map">
            <ActivityGrid rows={dashboard.progress} />
          </AstroCard>
          <AstroCard title="Score distribution">
            <FrequencyPolygon rows={dashboard.progress} />
          </AstroCard>
          <AstroCard title="Recent history" className="lg:col-span-2">
            <ProgressPanel rows={dashboard.progress} />
          </AstroCard>
        </div>
      </AstroSection>

      <AstroSection
        id="learning"
        eyebrow="Learning layer"
        title="Corrections, notebook, and examiner memory"
        text="Keep the teaching loop visible, but separate from the daily brief so the assessment itself stays calm."
      >
        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <AstroCard title="Assessment teaching">
            <TeachingPanel challenge={dashboard.today} grade={grade} submission={submission} plain />
          </AstroCard>
          <AstroCard title="Notebook">
            <NotebookPanel
              key={dashboard.notebookEntries.map((entry) => entry.id).join(":")}
              busy={busy}
              entries={dashboard.notebookEntries}
              redemptions={dashboard.redemptions}
              onAskExaminer={onExaminer}
              showRedemptions={false}
              plain
            />
          </AstroCard>
        </div>
      </AstroSection>

      <AstroSection
        id="social"
        eyebrow="Network"
        title="Community, cohorts, and configuration"
        text="Social comparison and challenge configuration live at the bottom of the page where they support the core loop without interrupting it."
      >
        <div className="grid gap-5">
          <AstroCard title="Social hub">
            <SocialPanel
              social={dashboard.social}
              busy={busy}
              onAddFriend={onAddFriend}
              onEnroll={onEnrollMarketplace}
              plain
            />
          </AstroCard>
          <AstroCard title="Challenge settings and cohorts">
            <VersatilityPanel
              busy={busy}
              activeDiscipline={dashboard.activeDiscipline}
              cohorts={dashboard.cohorts}
              disciplines={disciplines}
              profile={dashboard.studyProfile}
              profileErrors={profileErrors}
              settings={dashboard.challengeSettings}
              onCreateCohort={onCreateCohort}
              onJoinCohort={onJoinCohort}
              onSaveProfile={onSaveProfile}
              onSaveSettings={onSaveSettings}
              plain
            />
          </AstroCard>
        </div>
      </AstroSection>
    </section>
  );
}

function DashboardHero({
  dashboard,
  deadline,
  grade,
  hasDraft,
  nextUnlock,
  onExaminer,
  onGrade,
  onOpenResponse,
  submission,
  user,
}: {
  dashboard: Dashboard;
  deadline: string;
  grade: Grade | null;
  hasDraft: boolean;
  nextUnlock: string;
  onExaminer: () => void;
  onGrade: () => void;
  onOpenResponse: () => void;
  submission: Submission | null;
  user: SafeUser;
}) {
  const primaryAction = grade
    ? { label: "Review teaching", action: () => scrollToSection("learning") }
    : submission
      ? { label: "Grade response", action: onGrade }
      : { label: hasDraft ? "Continue response" : "Respond", action: onOpenResponse };
  return (
    <section className="astrowind-hero">
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(22rem,0.95fr)] lg:items-center">
        <div className="min-w-0">
          <p className="astrowind-kicker">GURUnet operating loop</p>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            One rigorous challenge. One submitted answer. One serious correction.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
            {dashboard.activeDiscipline.label} training for {user.name}. Today&apos;s brief is{" "}
            <span className="font-semibold text-slate-900">{dashboard.today.title}</span>, due {deadline}.
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={primaryAction.action}
              className="interactive-lift h-11 rounded-md bg-slate-950 px-5 text-sm font-semibold text-white"
            >
              {primaryAction.label}
            </button>
            <button
              type="button"
              onClick={onExaminer}
              className="interactive-lift h-11 rounded-md border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700"
            >
              Talk to examiner
            </button>
          </div>
          <p className="mt-4 text-sm text-slate-500">
            Next challenge unlocks {nextUnlock}. Current status: {dashboard.today.status}.
          </p>
        </div>

        <div className="astrowind-feature-card">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={dashboard.today.status} />
            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-semibold text-slate-600">
              {dashboard.today.dateKey} · {dashboard.today.difficulty}
            </span>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <MiniStat label="PIS" value={user.pisScore.toFixed(1)} />
            <MiniStat label="ERT" value={String(user.ertBalance)} />
            <MiniStat label="Streak" value={`${user.currentStreak}d`} />
          </div>
          <div className="mt-6 rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Today&apos;s focus
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              {dashboard.today.topic}. Submit evidence, reasoning, exact checks, risk, rollback, and a defensible recommendation.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white/58 px-3 py-2">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function AstroSection({
  children,
  eyebrow,
  id,
  text,
  title,
}: {
  children: ReactNode;
  eyebrow: string;
  id: string;
  text: string;
  title: string;
}) {
  return (
    <section id={id} className="astrowind-section">
      <div className="mx-auto mb-10 max-w-3xl text-center">
        <p className="astrowind-kicker">{eyebrow}</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          {title}
        </h2>
        <p className="mt-4 text-base leading-7 text-slate-600">{text}</p>
      </div>
      {children}
    </section>
  );
}

function AstroCard({
  children,
  className = "",
  title,
}: {
  children: ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <section className={`astrowind-card ${className}`}>
      <h3 className="mb-4 text-lg font-semibold tracking-tight text-slate-950">{title}</h3>
      {children}
    </section>
  );
}

const packetHeadings = new Set([
  "Scenario / Background",
  "Topology / Context",
  "Evidence Provided",
  "Recovery Component",
  "Optional Lab",
  "Submission Deadline",
  "CPU",
  "MAC Table",
  "Logs",
  "STP",
  "CDP",
  "ACL excerpt",
  "Interface excerpt",
  "auth.log excerpt",
  "last excerpt",
  "authorized_keys timestamp",
]);

function PacketText({ compact = false, text }: { compact?: boolean; text: string }) {
  const lines = text.split("\n");
  return (
    <div className={`challenge-packet ${compact ? "challenge-packet-compact" : ""}`}>
      {lines.map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={`gap-${index}`} className="h-2" />;
        if (packetHeadings.has(trimmed)) {
          return (
            <p key={`${trimmed}-${index}`} className="challenge-packet-heading">
              {trimmed}
            </p>
          );
        }
        if (/^(\d+\.|- )/.test(trimmed)) {
          return (
            <p key={`${trimmed}-${index}`} className="challenge-packet-list">
              {line}
            </p>
          );
        }
        if (/^(SW-|ip access-list|interface | ip | \d+ |PID |CPU |Vlan |%|Jun |\/|svc_|show |[A-Z0-9-]+#)/.test(line)) {
          return (
            <pre key={`${trimmed}-${index}`} className="challenge-packet-code">
              {line}
            </pre>
          );
        }
        return (
          <p key={`${trimmed}-${index}`} className="challenge-packet-line">
            {line}
          </p>
        );
      })}
    </div>
  );
}

function ChallengeWidget({
  busy,
  challenge,
  draftSavedAt,
  grade,
  hasDraft,
  nextUnlock,
  notice,
  onExaminer,
  onFocus,
  onGrade,
  onOpen,
  onSample,
  onVerify,
  setVerification,
  status,
  submission,
  verification,
}: {
  busy: boolean;
  challenge: Challenge;
  draftSavedAt: string;
  grade: Grade | null;
  hasDraft: boolean;
  nextUnlock: string;
  notice: ChallengeNotice | null;
  onExaminer: () => void;
  onFocus: () => void;
  onGrade: () => void;
  onOpen: () => void;
  onSample: () => void;
  onVerify: () => void;
  setVerification: (value: string) => void;
  status: string;
  submission: Submission | null;
  verification: string;
}) {
  return (
    <div className="grid gap-4">
      {submission ? (
        <div className="rounded-md border border-cyan-700/15 bg-cyan-50 p-4">
          <p className="text-sm font-semibold text-cyan-800">Submitted response</p>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            This assessment stays focused on the submitted work until the next challenge unlocks at {nextUnlock}.
          </p>
        </div>
      ) : (
        <div>
          <p className="text-sm font-semibold text-cyan-800">{challenge.topic}</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">
            {challenge.title}
          </h2>
          <div className="mt-4">
            <PacketText text={challenge.scenario} />
          </div>
          <div className="mt-4 rounded-md border border-slate-200 bg-white/55 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Objective
            </p>
            <p className="mt-1 leading-7 text-slate-700">{challenge.objective}</p>
          </div>
        </div>
      )}

      {submission ? (
        <details className="rounded-md border border-slate-200 bg-white/55">
          <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-slate-900 marker:hidden">
            Challenge prompt
            <ChevronRight size={16} className="text-cyan-700" />
          </summary>
          <div className="border-t border-slate-200 px-4 py-4">
            <p className="text-sm font-semibold text-cyan-800">{challenge.topic}</p>
            <p className="mt-2 text-lg font-semibold text-slate-950">{challenge.title}</p>
            <div className="mt-3">
              <PacketText compact text={challenge.scenario} />
            </div>
            <p className="mt-4 font-semibold text-slate-900">Objective</p>
            <p className="mt-1 leading-7 text-slate-600">{challenge.objective}</p>
            <ChallengeAccordions challenge={challenge} />
          </div>
        </details>
      ) : (
        <ChallengeAccordions challenge={challenge} />
      )}

      <SubmissionControl
        busy={busy}
        draftSavedAt={draftSavedAt}
        hasDraft={hasDraft}
        onFocus={onFocus}
        onOpen={onOpen}
        onSample={onSample}
        status={status}
        submission={submission}
        grade={grade}
        verification={verification}
        setVerification={setVerification}
        onVerify={onVerify}
        onGrade={onGrade}
        notice={notice}
        onExaminer={onExaminer}
      />
    </div>
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
  return (
    <section className="astrowind-shell">
      <section className="astrowind-hero">
        <div className="mx-auto max-w-4xl text-center">
          <p className="astrowind-kicker">Study profile</p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
            Calibrate GURUnet before it starts challenging you.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-8 text-slate-600">
            The profile anchors the discipline, evidence standards, response format,
            examiner language, challenge topics, and notebook emphasis.
          </p>
        </div>
      </section>

      <AstroSection
        id="profile-calibration"
        eyebrow="Configuration"
        title="Build a governed capacity profile"
        text="Choose from the governed STEM and technical domains. Use written preferences only for bespoke nuance, not vague standards."
      >
        <StudyProfileForm
          busy={busy}
          disciplines={disciplines}
          errors={errors}
          status={status}
          onSave={onSave}
        />
      </AstroSection>
    </section>
  );
}

function StudyProfileForm({
  busy,
  disciplines,
  errors,
  initialProfile,
  status,
  submitLabel = "Save profile",
  onSave,
}: {
  busy: boolean;
  disciplines: DisciplineTemplate[];
  errors: string[];
  initialProfile?: StudyProfile | null;
  status: string;
  submitLabel?: string;
  onSave: (input: unknown) => void;
}) {
  const first = disciplines[0];
  const [selectedId, setSelectedId] = useState(initialProfile?.primaryDiscipline ?? first?.id ?? "networking");
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
    <div className="grid gap-6">
      <div className="astrowind-card">
        <div className="grid gap-4 text-sm leading-6 text-slate-600 md:grid-cols-3">
          <div>
            <p className="font-semibold text-slate-950">What it controls</p>
            <p className="mt-1">Challenge topics, formats, response templates, evidence standards, grading language, and notebook emphasis.</p>
          </div>
          <div>
            <p className="font-semibold text-slate-950">What to avoid</p>
            <p className="mt-1">Selecting everything. A focused profile gives the examiner sharper judgment and better recovery work.</p>
          </div>
          <div>
            <p className="font-semibold text-slate-950">Minimum signal</p>
            <p className="mt-1">Pick 3+ topics, 2+ formats, 2+ evidence types, 1 weak area, 1 goal, and 1-40 weekly hours.</p>
          </div>
        </div>
        <CalibrationPath />
      </div>

      <form onSubmit={submit} className="grid gap-5">
        <div className="astrowind-card">
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
              <span className="text-xs font-normal leading-5 text-slate-500">
                The primary discipline is the fallback template for all generated challenges.
              </span>
            </label>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
              <p>{selected?.summary}</p>
              <p className="mt-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Governed topics
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{topics.join(", ")}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-5 lg:grid-cols-2">
          <SurveyGroup title="Ranked topic interests">
            <CheckboxGrid
              key={`${selectedId}-rankedTopics`}
              name="rankedTopics"
              values={topics}
              defaultValues={initialProfile?.rankedTopics}
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
              defaultValues={initialProfile?.preferredFormats}
              min={2}
              max={6}
              limitHint="Pick 2-6. Lab/hands-on selections are treated as real generation rules."
            />
          </SurveyGroup>
          <SurveyGroup title="Expected evidence/output">
            <CheckboxGrid
              key={`${selectedId}-evidenceTypes`}
              name="evidenceTypes"
              values={evidenceTypes}
              defaultValues={initialProfile?.evidenceTypes}
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
              defaultValues={initialProfile?.weakAreas}
              min={1}
              max={8}
              limitHint="Pick 1-8. These become pressure points and recovery targets."
            />
          </SurveyGroup>
        </div>

        <div className="astrowind-card">
          <div className="grid gap-3 md:grid-cols-4">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Current level
              <select name="currentLevel" defaultValue={initialProfile?.currentLevel ?? "Intermediate"} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
                {[
                  ["Beginner", "I need guided tasks and examples."],
                  ["Intermediate", "I can execute with structure."],
                  ["Advanced", "I can reason through ambiguity."],
                  ["Production", "I operate under real constraints."],
                  ["Expert", "I need high-pressure edge cases."],
                ].map(([value, label]) => <option key={value} value={value}>{value} - {label}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Target difficulty
              <select name="targetDifficulty" defaultValue={initialProfile?.targetDifficulty ?? "Normal"} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
                {difficultyOptions.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Weekly hours
              <input name="weeklyTimeBudgetHours" type="number" min={1} max={40} defaultValue={initialProfile?.weeklyTimeBudgetHours ?? 4} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" />
            </label>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Custom path request
              <input name="customDiscipline" defaultValue={initialProfile?.customDiscipline ?? ""} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" placeholder="Optional specialty" />
              <span className="text-xs font-normal leading-5 text-slate-500">
                Draft only. The governed discipline remains the fallback.
              </span>
            </label>
          </div>
          <label className="mt-4 grid gap-1.5 text-sm font-medium text-slate-700">
            Written preferences
            <textarea
              name="preferenceNotes"
              className="min-h-24 rounded-md border border-slate-300 bg-white p-3 text-sm leading-6"
              maxLength={1000}
              defaultValue={initialProfile?.preferenceNotes ?? ""}
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
              defaultValues={initialProfile?.secondaryInterests}
              max={4}
              limitHint="Optional. Pick up to 4 adjacent areas for occasional cross-training."
            />
          </SurveyGroup>
          <SurveyGroup title="Professional goals">
            <CheckboxGrid
              name="goals"
              values={professionalGoalOptions}
              defaultValues={initialProfile?.goals}
              min={1}
              max={6}
              limitHint="Pick 1-6. These steer the examiner's long-term emphasis."
            />
          </SurveyGroup>
        </div>

        <SurveyGroup title="Avoid areas">
          <CheckboxGrid
            key={`${selectedId}-avoidAreas`}
            name="avoidAreas"
            values={topics}
            defaultValues={initialProfile?.avoidAreas}
            max={8}
            limitHint="Optional. Avoid areas are de-emphasized and cannot also be weak-area targets."
          />
        </SurveyGroup>

        {(status || visibleErrors.length > 0) && (
          <div className={`rounded-md border p-4 text-sm leading-6 ${
            visibleErrors.length > 0
              ? "border-orange-200 bg-orange-50 text-orange-900"
              : "border-slate-200 bg-white/70 text-slate-700"
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
        <button disabled={busy} className="h-11 w-fit rounded-md bg-slate-950 px-5 text-sm font-semibold text-white disabled:opacity-60">
          {submitLabel}
        </button>
      </form>
    </div>
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

function CalibrationPath() {
  const steps = [
    ["1", "Choose a governed discipline", "This anchors the rubric and prevents vague AI-made standards."],
    ["2", "Select evidence and formats", "This tells GURUnet whether to create labs, triage, reviews, documentation, or design work."],
    ["3", "Declare weak areas", "The system uses these as pressure points and recovery targets."],
    ["4", "Add written preferences", "Use this for bespoke guidance without loosening grading quality."],
  ];
  return (
    <div className="mt-4 grid gap-2 md:grid-cols-4">
      {steps.map(([number, title, text]) => (
        <div key={number} className="rounded-md border border-slate-200 bg-white/55 p-3">
          <span className="grid size-6 place-items-center rounded-md bg-slate-950 font-mono text-xs font-semibold text-white">
            {number}
          </span>
          <p className="mt-3 text-sm font-semibold text-slate-950">{title}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">{text}</p>
        </div>
      ))}
    </div>
  );
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
  defaultValues,
  max,
  min,
  name,
  values,
  limitHint,
}: {
  defaultValues?: string[];
  max?: number;
  min?: number;
  name: string;
  values: CheckboxOption[];
  limitHint?: string;
}) {
  const allowedValues = useMemo(
    () => new Set(values.map((option) => (typeof option === "string" ? option : option.value))),
    [values],
  );
  const [selected, setSelected] = useState<string[]>(
    () => (defaultValues ?? []).filter((value) => allowedValues.has(value)).slice(0, max),
  );

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
        ? "text-slate-700"
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
                  ? "border-slate-400 bg-slate-50 text-slate-950"
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

function AccountSettingsModal({
  open,
  user,
  onDeleted,
  onExport,
  onOpenChange,
  onUserUpdated,
}: {
  open: boolean;
  user: SafeUser;
  onDeleted: () => void;
  onExport: () => void;
  onOpenChange: (open: boolean) => void;
  onUserUpdated: (user: SafeUser) => void;
}) {
  const [name, setName] = useState(user.name);
  const [timezone, setTimezone] = useState(user.timezone);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [deletePassword, setDeletePassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [localBusy, setLocalBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function saveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalBusy(true);
    setMessage("");
    try {
      const result = await apiRequest<{ user: SafeUser }>("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ name, timezone }),
      });
      onUserUpdated(result.user);
      setMessage("Account details updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account update failed.");
    } finally {
      setLocalBusy(false);
    }
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalBusy(true);
    setMessage("");
    try {
      await apiRequest<{ user: SafeUser }>("/api/me", {
        method: "PATCH",
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setMessage("Password updated.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Password update failed.");
    } finally {
      setLocalBusy(false);
    }
  }

  async function deleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLocalBusy(true);
    setMessage("");
    try {
      await apiRequest<{ ok: true }>("/api/me", {
        method: "DELETE",
        body: JSON.stringify({ confirmation, password: deletePassword }),
      });
      onDeleted();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Account deletion failed.");
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Account and data controls</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4">
          <section className="rounded-md border border-slate-200 bg-white/70 p-4">
            <p className="text-sm font-semibold text-slate-950">Profile details</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Change the details GURUnet uses to identify your account inside the platform.
            </p>
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
              <label className="grid gap-1.5 text-sm font-medium text-slate-700">
                Timezone
                <input
                  value={timezone}
                  onChange={(event) => setTimezone(event.target.value)}
                  minLength={3}
                  maxLength={80}
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/15"
                  required
                />
              </label>
              <div className="sm:col-span-2">
                <p className="text-xs text-slate-500">
                  Email changes are intentionally not editable here until verified email-change flow is added.
                </p>
                <button
                  type="submit"
                  disabled={localBusy}
                  className="mt-3 h-10 rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
                >
                  Save details
                </button>
              </div>
            </form>
          </section>

          <section className="rounded-md border border-slate-200 bg-white/70 p-4">
            <p className="text-sm font-semibold text-slate-950">Password</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Password-backed accounts must provide the current password. Google-only accounts can set a local password while signed in.
            </p>
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
              <button
                type="submit"
                disabled={localBusy}
                className="h-10 w-fit rounded-md border border-cyan-700/20 bg-cyan-50 px-4 text-sm font-semibold text-cyan-800 disabled:opacity-60"
              >
                Change password
              </button>
            </form>
          </section>

          <section className="rounded-md border border-slate-200 bg-white/70 p-4">
            <p className="text-sm font-semibold text-slate-950">Your data</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Export your learning record as machine-readable JSON, or permanently delete the account and its linked records.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onExport}
                className="flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
              >
                <Download size={15} />
                Export data
              </button>
            </div>
            <form onSubmit={deleteAccount} className="mt-4 grid gap-3 rounded-md border border-red-200 bg-red-50 p-3">
              <p className="text-sm font-semibold text-red-900">Delete account</p>
              <p className="text-sm leading-6 text-red-800">
                This removes your account, sessions, study profile, challenges, submissions, grades, notebook entries, social records, and local uploaded files.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
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
              </div>
              <button
                type="submit"
                disabled={localBusy || confirmation !== "DELETE"}
                className="h-10 w-fit rounded-md bg-red-700 px-4 text-sm font-semibold text-white disabled:opacity-60"
              >
                Permanently delete account
              </button>
            </form>
          </section>

          {message && (
            <p className="rounded-md bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {message}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AppHeader({
  user,
  onAccount,
  onCommand,
  onExport,
  onThemeToggle,
  onLogout,
  theme,
}: {
  user?: SafeUser;
  onAccount?: () => void;
  onCommand?: () => void;
  onExport?: () => void;
  onThemeToggle?: () => void;
  onLogout?: () => void;
  theme?: ThemeMode;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between px-4 py-3 sm:px-6">
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
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-stone-500">
              GURUnet
            </p>
            <h2 className="text-base font-semibold text-stone-950 sm:text-lg">Capacity builder</h2>
          </div>
        </div>
        {user && (
          <div className="flex items-center gap-3">
            <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 lg:flex">
              <button type="button" onClick={() => scrollToSection("daily-challenge")} className="nav-link">
                Today
              </button>
              <button type="button" onClick={() => scrollToSection("metrics")} className="nav-link">
                Metrics
              </button>
              <button type="button" onClick={() => scrollToSection("learning")} className="nav-link">
                Learning
              </button>
              <button type="button" onClick={() => scrollToSection("social")} className="nav-link">
                Network
              </button>
            </nav>
            <span className="hidden text-sm font-medium text-stone-600 sm:inline">
              {user.name}
            </span>
            <button
              onClick={onAccount}
              className="grid size-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              aria-label="Account settings"
              type="button"
            >
              <Settings size={15} />
            </button>
            <button
              onClick={onCommand}
              className="grid size-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              aria-label="Open command palette"
              type="button"
            >
              <Command size={15} />
            </button>
            <button
              onClick={onExport}
              className="grid size-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              aria-label="Export learning record"
              type="button"
            >
              <Download size={15} />
            </button>
            <button
              onClick={onThemeToggle}
              className="grid size-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              type="button"
            >
              {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button
              onClick={onLogout}
              className="grid size-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
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
        className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-500/10"
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
    <div className="rounded-md border border-slate-200 bg-white/58 p-4">
      <div className="flex items-center gap-2 text-slate-600">{icon}</div>
      <p className="mt-4 text-sm font-medium text-slate-500">{label}</p>
      <p className="text-2xl font-semibold text-slate-950">{value}</p>
    </div>
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
        <PacketText compact text={challenge.expectedAnswerFormat} />
      </AccordionPanel>
      <AccordionPanel title="Rubric lens">
        <ChallengeRubricLens challenge={challenge} />
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

const fallbackRubric: Record<string, { label: string; description: string }> = {
  creativity: {
    label: "Creativity",
    description: "Originality, tradeoff awareness, and non-template thinking.",
  },
  ingenuity: {
    label: "Ingenuity",
    description: "Practical problem solving, tool choice, and operational judgment.",
  },
  reporting: {
    label: "Reporting",
    description: "Clear explanation, evidence chain, assumptions, and reproducible steps.",
  },
  alienness: {
    label: "Lateral thinking",
    description: "Ability to test unusual paths, disprove assumptions, and avoid tunnel vision.",
  },
  neatness: {
    label: "Neatness",
    description: "Structured response, precision, safety, rollback, and concise execution.",
  },
};

function ChallengeRubricLens({
  challenge,
  compact = false,
}: {
  challenge: Challenge;
  compact?: boolean;
}) {
  const snapshot = challenge.disciplineSnapshot;
  const evidence =
    snapshot?.evidenceTypes?.length ? snapshot.evidenceTypes : challenge.submissionRequirements;
  const sections = snapshot?.responseSections ?? [];

  return (
    <div className="grid gap-3">
      <RubricGrid rubric={snapshot?.rubric ?? fallbackRubric} compact={compact} />
      {!compact && (
        <div className="rounded-md border border-slate-200 bg-white/65 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Evidence standard
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {evidence.map((item) => (
              <span
                key={item}
                className="rounded-md border border-cyan-700/15 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-900"
              >
                {item}
              </span>
            ))}
          </div>
          {sections.length > 0 && (
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Suggested response spine: {sections.join(", ")}.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function RubricGrid({
  compact = false,
  rubric,
}: {
  compact?: boolean;
  rubric: Record<string, { label: string; description: string }>;
}) {
  const entries = Object.entries(rubric).slice(0, compact ? 3 : 5);
  return (
    <div className={`grid gap-2 ${compact ? "" : "sm:grid-cols-2"}`}>
      {entries.map(([key, axis], index) => (
        <div key={key} className="rounded-md border border-slate-200 bg-white/65 p-3">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-800">
            Axis {index + 1}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-slate-950">{axis.label}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{axis.description}</p>
        </div>
      ))}
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

function PlainSection({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="grid gap-3">
      <div className="flex items-center gap-2 text-cyan-700">
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
  onFocus,
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
  onFocus: () => void;
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
            onClick={onFocus}
            className="interactive-lift flex h-11 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-5 text-sm font-semibold text-slate-700"
          >
            <ShieldCheck size={16} />
            Focus mode
          </button>
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

function ChallengeFocusModal({
  challenge,
  deadline,
  grade,
  hasDraft,
  nextUnlock,
  onExaminer,
  onOpenChange,
  onRespond,
  open,
  submission,
}: {
  challenge: Challenge;
  deadline: string;
  grade: Grade | null;
  hasDraft: boolean;
  nextUnlock: string;
  onExaminer: () => void;
  onOpenChange: (open: boolean) => void;
  onRespond: () => void;
  open: boolean;
  submission: Submission | null;
}) {
  function respond() {
    onOpenChange(false);
    onRespond();
  }

  function examiner() {
    onOpenChange(false);
    void onExaminer();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Challenge focus mode</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(19rem,0.85fr)]">
          <article className="rounded-md border border-slate-200 bg-white/75 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <StatusPill status={challenge.status} />
              <span className="rounded-md border border-slate-200 bg-white px-2 py-1 font-mono text-xs font-semibold text-slate-600">
                {challenge.dateKey} · {challenge.difficulty}
              </span>
              <span className="rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800">
                Due {deadline}
              </span>
            </div>
            <p className="mt-4 text-sm font-semibold text-cyan-800">{challenge.topic}</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-normal text-slate-950">
              {challenge.title}
            </h2>
            <div className="mt-5">
              <PacketText text={challenge.scenario} />
            </div>
            <div className="mt-5 rounded-md border border-slate-200 bg-slate-50/80 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Objective
              </p>
              <p className="mt-2 leading-7 text-slate-700">{challenge.objective}</p>
            </div>
          </article>

          <aside className="grid content-start gap-3">
            <div className="rounded-md border border-slate-200 bg-white/70 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                Work state
              </p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {grade
                  ? `Teaching is unlocked. Next challenge opens ${nextUnlock}.`
                  : submission
                    ? "Response submitted. Grade it from the dashboard to unlock teaching."
                    : hasDraft
                      ? "Draft exists. Continue it or ask the examiner before submitting."
                      : "No draft yet. Start with evidence, assumptions, checks, risk, and recommendation."}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {!submission && (
                  <button
                    type="button"
                    onClick={respond}
                    className="h-10 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white"
                  >
                    {hasDraft ? "Continue response" : "Respond"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={examiner}
                  className="h-10 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
                >
                  Ask examiner
                </button>
              </div>
            </div>

            <AccordionPanel title="Submission requirements" defaultOpen>
              <List items={challenge.submissionRequirements} />
            </AccordionPanel>
            <AccordionPanel title="Constraints">
              <List items={challenge.constraints} />
            </AccordionPanel>
            <AccordionPanel title="Allowed tools">
              <List items={challenge.allowedTools} />
            </AccordionPanel>
            <AccordionPanel title="Expected answer">
              <PacketText compact text={challenge.expectedAnswerFormat} />
            </AccordionPanel>
            <AccordionPanel title="Rubric lens">
              <ChallengeRubricLens challenge={challenge} compact />
            </AccordionPanel>
          </aside>
        </div>
      </DialogContent>
    </Dialog>
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

type CommandAction = {
  id: string;
  title: string;
  description: string;
  shortcut: string;
  action: () => void;
};

function CommandPalette({
  actions,
  open,
  onOpenChange,
}: {
  actions: CommandAction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [query, setQuery] = useState("");
  const filtered = actions.filter((item) => {
    const haystack = `${item.title} ${item.description}`.toLowerCase();
    return haystack.includes(query.toLowerCase());
  });

  const setPaletteOpen = useCallback((nextOpen: boolean) => {
    if (!nextOpen) setQuery("");
    onOpenChange(nextOpen);
  }, [onOpenChange]);

  function run(action: CommandAction) {
    setPaletteOpen(false);
    action.action();
  }

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPaletteOpen(false);
        return;
      }
      if (query.trim()) return;
      const action = actions.find(
        (item) => item.shortcut.toLowerCase() === event.key.toLowerCase(),
      );
      if (!action) return;
      event.preventDefault();
      setPaletteOpen(false);
      action.action();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actions, open, query, setPaletteOpen]);

  return (
    <Dialog open={open} onOpenChange={setPaletteOpen}>
      <DialogContent className="max-h-[82vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Command palette</DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 gap-3">
          <label className="flex h-11 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-600">
            <Search size={16} className="text-slate-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-full min-w-0 flex-1 bg-transparent outline-none"
              autoFocus
              placeholder="Search actions, sections, examiner, response..."
            />
          </label>

          <div className="max-h-[24rem] overflow-auto rounded-md border border-slate-200 bg-white/70 p-2">
            {filtered.length === 0 ? (
              <p className="grid h-24 place-items-center text-sm text-slate-500">
                No matching command.
              </p>
            ) : (
              <div className="grid gap-1">
                {filtered.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => run(item)}
                    className="grid gap-1 rounded-md px-3 py-2 text-left transition-colors hover:bg-slate-100"
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="text-sm font-semibold text-slate-950">{item.title}</span>
                      <kbd className="rounded-sm bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-500 shadow-sm">
                        {item.shortcut}
                      </kbd>
                    </span>
                    <span className="text-xs leading-5 text-slate-500">{item.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <p className="text-xs leading-5 text-slate-500">
            Open with Ctrl K or Cmd K. Use this as the fast lane through the platform.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ResponseEditorModal({
  attachments,
  body,
  busy,
  challenge,
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
  challenge: Challenge;
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
    () => responseReadiness(body, attachments, challenge),
    [attachments, body, challenge],
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

function responseReadiness(
  body: string,
  attachments: SubmissionAttachment[],
  challenge: Challenge,
) {
  const text = body.trim();
  const lower = text.toLowerCase();
  const words = text.split(/\s+/).filter(Boolean);
  const lines = text.split(/\r?\n/);
  const headings = lines.filter((line) => /^#{1,3}\s+\S/.test(line)).length;
  const listItems = lines.filter((line) => /^\s*(-|\*|\d+\.)\s+\S/.test(line)).length;
  const codeBlocks = (text.match(/```[\s\S]*?```/g) ?? []).length;
  const inlineCode = (text.match(/`[^`\n]+`/g) ?? []).length;
  const commandLikeLines = lines.filter((line) =>
    /^\s*(\$|>|#)\s+\S/.test(line) ||
    /\b(show|journalctl|tcpdump|dig|curl|kubectl|grep|awk|systemctl|ip\s|ss\s|ping|traceroute|nslookup|docker|terraform|ansible|python|node|npm|pnpm|git)\b/i.test(line),
  ).length;
  const artifactSignals =
    codeBlocks +
    inlineCode +
    commandLikeLines +
    attachments.length +
    lines.filter((line) => /\b(error|log|trace|output|config|screenshot|packet|metric|status|diff|json|csv|pcap)\b/i.test(line)).length;
  const reasoningConnectors = (lower.match(/\b(because|therefore|so that|which means|this implies|however|given that|assumption|trade[- ]off)\b/g) ?? []).length;
  const validationSignals = (lower.match(/\b(verify|validate|confirm|test|check|measure|compare|disprove|reproduce|baseline|control)\b/g) ?? []).length;
  const riskSignals = (lower.match(/\b(risk|rollback|blast radius|contain|avoid|do not|impact|fallback|backout|safe|change window)\b/g) ?? []).length;
  const actionSignals = (lower.match(/\b(recommend|fix|change|next step|plan|correct|mitigate|resolve|document|monitor)\b/g) ?? []).length;
  const expectedTouchCount = challenge.submissionRequirements.filter((requirement) =>
    requirement
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 4)
      .some((word) => lower.includes(word)),
  ).length;
  const checks = [
    {
      label: "Enough substance",
      complete: words.length >= 90 || attachments.length > 0,
      guidance: "Add enough explanation for the examiner to follow your reasoning, not just the final answer.",
    },
    {
      label: "Organized response",
      complete: headings >= 2 || listItems >= 4 || text.includes("##"),
      guidance: `Use the expected format as scaffolding: ${challenge.expectedAnswerFormat}`,
    },
    {
      label: "Observable evidence",
      complete: artifactSignals >= 2,
      guidance: "Include command output, logs, screenshots, config snippets, metrics, code, or attached artifacts.",
    },
    {
      label: "Reasoning chain",
      complete: reasoningConnectors >= 2 || /\b(root cause|hypothesis|likely|unlikely|suspect)\b/i.test(text),
      guidance: "Show why the evidence supports your conclusion and state any assumptions.",
    },
    {
      label: "Validation plan",
      complete: validationSignals >= 2,
      guidance: "State how you would prove the fix or disprove your main hypothesis.",
    },
    {
      label: "Risk and rollback",
      complete: riskSignals >= 1,
      guidance: "Mention what could go wrong, blast radius, and how you would back out safely.",
    },
    {
      label: "Actionable conclusion",
      complete: actionSignals >= 1,
      guidance: "Finish with a specific recommendation, next step, or decision.",
    },
    {
      label: "Challenge requirements",
      complete: expectedTouchCount >= Math.min(2, challenge.submissionRequirements.length),
      guidance: `Touch the required evidence: ${challenge.submissionRequirements.slice(0, 3).join("; ")}`,
    },
  ];
  const score = Math.round((checks.filter((check) => check.complete).length / checks.length) * 100);
  const next = checks.find((check) => !check.complete)?.guidance ?? "Looks ready for submission. The grader will still judge correctness and depth.";
  return { checks, score, next };
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
      <p className="mb-3 text-xs leading-5 text-slate-500">
        This is a pre-flight guide, not a score prediction. {readiness.next}
      </p>
      <div className="h-2 rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-cyan-700"
          style={{ width: `${readiness.score}%` }}
        />
      </div>
      <div className="mt-3 grid gap-2">
        {readiness.checks.map((check) => (
          <div key={check.label} className="flex items-start gap-2 text-sm text-slate-600">
            <CheckCircle2
              size={15}
              className={`mt-0.5 shrink-0 ${check.complete ? "text-cyan-700" : "text-slate-300"}`}
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

function GradeSummary({ grade, plain = false }: { grade: Grade; plain?: boolean }) {
  const content = (
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
        {grade.rubricSnapshot && (
          <div className="rounded-md border border-slate-200 bg-white/65 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Rubric used
            </p>
            <div className="mt-2">
              <RubricGrid rubric={grade.rubricSnapshot} compact />
            </div>
          </div>
        )}
        <p className="rounded-md bg-cyan-50 px-3 py-2 text-sm font-semibold leading-6 text-cyan-900">
          Next target: {grade.nextImprovementTarget}
        </p>
      </div>
  );
  return plain ? content : <Panel icon={<Medal size={19} />} title="Daily scoresheet">{content}</Panel>;
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
  plain = false,
}: {
  busy: boolean;
  onRedeem: (event: FormEvent<HTMLFormElement>) => void;
  plain?: boolean;
}) {
  const content = (
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
  );
  return plain ? content : <Panel icon={<WalletCards size={19} />} title="Redeem ERT">{content}</Panel>;
}

function ProgressPanel({ rows }: { rows: ProgressRow[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        title="No history yet"
        text="Your recent challenge history appears here after the first submission is graded."
      />
    );
  }
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

function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-md border border-dashed border-slate-300 bg-white/45 p-4 text-sm leading-6 text-slate-600">
      <p className="font-semibold text-slate-900">{title}</p>
      <p className="mt-1">{text}</p>
    </div>
  );
}

function VersatilityPanel({
  activeDiscipline,
  busy,
  cohorts,
  disciplines,
  plain = false,
  profile,
  profileErrors,
  settings,
  onCreateCohort,
  onJoinCohort,
  onSaveProfile,
  onSaveSettings,
}: {
  activeDiscipline: ActiveDiscipline;
  busy: boolean;
  cohorts: CohortSummary[];
  disciplines: DisciplineTemplate[];
  plain?: boolean;
  profile: StudyProfile | null;
  profileErrors: string[];
  settings: ChallengeSettings;
  onCreateCohort: (event: FormEvent<HTMLFormElement>) => void;
  onJoinCohort: (event: FormEvent<HTMLFormElement>) => void;
  onSaveProfile: (input: unknown) => void;
  onSaveSettings: (settings: ChallengeSettings) => void;
}) {
  const TrackShell = plain ? PlainSection : Panel;
  const domainOptions = disciplines.length
    ? disciplines.map((discipline) => [discipline.id, discipline.label] as const)
    : trackOptions;
  return (
    <div className="grid gap-6">
      <TrackShell icon={<CircleGauge size={20} />} title="Active study profile">
        <div className="grid gap-4">
          <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-950">{activeDiscipline.label}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Future challenges use this governed profile for topics, formats, evidence expectations,
              response sections, weak-pattern penalties, unsafe-pattern penalties, and rubric language.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {activeDiscipline.formats.slice(0, 4).map((format) => (
                <span key={format} className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-semibold text-slate-600">
                  {format}
                </span>
              ))}
            </div>
          </div>
          {profile ? (
            <details className="rounded-md border border-slate-200 bg-white/70 p-4">
              <summary className="cursor-pointer list-none text-sm font-semibold text-slate-950 marker:hidden">
                Edit governed study profile
              </summary>
              <div className="mt-5 border-t border-slate-200 pt-5">
                <StudyProfileForm
                  busy={busy}
                  disciplines={disciplines}
                  errors={profileErrors}
                  initialProfile={profile}
                  status=""
                  submitLabel="Update profile"
                  onSave={onSaveProfile}
                />
              </div>
            </details>
          ) : (
            <EmptyState
              title="No completed profile"
              text="Complete onboarding to unlock discipline-specific challenge generation and grading language."
            />
          )}
        </div>
      </TrackShell>

      <div className="grid gap-5 lg:grid-cols-[0.88fr_1.12fr]">
      <TrackShell icon={<Settings size={20} />} title="Daily challenge overrides">
        <form
          className="grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            const form = new FormData(event.currentTarget);
            onSaveSettings({
              track: activeDiscipline.id,
              durationMinutes: Number(form.get("durationMinutes") || 45),
              difficultyFloor: String(form.get("difficultyFloor") || "Normal"),
              topicFocus: String(form.get("topicFocus") || ""),
              recoveryMode: form.get("recoveryMode") === "on",
              teamMode: form.get("teamMode") === "on",
            });
          }}
        >
          <p className="rounded-md border border-slate-200 bg-white/65 px-3 py-2 text-sm leading-6 text-slate-600">
            The domain comes from the study profile: <strong className="font-semibold text-slate-900">{activeDiscipline.label}</strong>.
            These settings only tune the next generated challenge.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Difficulty floor
              <select
                name="difficultyFloor"
                defaultValue={settings.difficultyFloor || activeDiscipline.targetDifficulty}
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
              <select
                name="topicFocus"
                defaultValue={settings.topicFocus}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm"
              >
                <option value="">Use profile priority order</option>
                {activeDiscipline.topics.map((topic) => (
                  <option key={topic} value={topic}>{topic}</option>
                ))}
                {settings.topicFocus && !activeDiscipline.topics.includes(settings.topicFocus) && (
                  <option value={settings.topicFocus}>{settings.topicFocus}</option>
                )}
              </select>
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
      </TrackShell>

      <TrackShell icon={<Users size={20} />} title="Cohort challenges">
        <div className="grid gap-4">
          <form onSubmit={onCreateCohort} className="grid gap-2 lg:grid-cols-[1fr_0.7fr_0.7fr_0.45fr_auto]">
            <input name="name" required className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" placeholder="Cohort name" />
            <select name="track" className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" defaultValue={settings.track}>
              {domainOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
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
      </TrackShell>
      </div>
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
  plain = false,
}: {
  social: SocialSnapshot;
  busy: boolean;
  onAddFriend: (event: FormEvent<HTMLFormElement>) => void;
  onEnroll: (challengeId: string) => void;
  plain?: boolean;
}) {
  const content = (
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
                {social.leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8">
                      <EmptyState
                        title="No leaderboard yet"
                        text="Leaderboard rows appear after users complete graded challenges."
                      />
                    </td>
                  </tr>
                ) : social.leaderboard.map((row) => (
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
  );
  return plain ? content : <Panel icon={<Users size={20} />} title="Social hub">{content}</Panel>;
}

function NotebookPanel({
  busy,
  entries,
  plain = false,
  redemptions,
  showRedemptions = true,
  onAskExaminer,
}: {
  busy: boolean;
  entries: NotebookEntry[];
  plain?: boolean;
  redemptions: Redemption[];
  showRedemptions?: boolean;
  onAskExaminer: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [localEntries, setLocalEntries] = useState(() => entries);
  const NotebookShell = plain ? PlainSection : Panel;

  return (
    <div className="grid gap-5">
      <NotebookShell icon={<NotebookTabs size={20} />} title="Engineering notebook">
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
      </NotebookShell>

      {showRedemptions && (
        <NotebookShell icon={<BookOpenText size={20} />} title="Redemption ledger">
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
        </NotebookShell>
      )}

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
    <footer className="mt-auto flex w-full flex-col gap-2 px-2 pb-6 pt-4 text-xs text-slate-500 sm:px-3 md:flex-row md:items-center md:justify-between">
      <p>© {new Date().getFullYear()} GURUnet. Licensed under Apache-2.0.</p>
      <div className="flex items-center gap-3">
        <a href="/admin" className="text-slate-400 transition-colors hover:text-slate-800" aria-label="System settings" title="System">
          <Settings size={15} />
        </a>
        <p className="font-mono text-slate-600">GURUnet · Designed by Kikandi.</p>
      </div>
    </footer>
  );
}
