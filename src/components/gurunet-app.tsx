"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent, ClipboardEvent, FormEvent, ReactNode } from "react";
import {
  Apple,
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  Bold,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  CircleGauge,
  Code2,
  Command,
  Compass,
  Download,
  FileText,
  GitBranch,
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
  Target,
  Trash2,
  UserRound,
  UserPlus,
  Users,
  WalletCards,
  Wrench,
} from "lucide-react";
import type {
  Challenge,
  Grade,
  NotebookEntry,
  Redemption,
  RetentionSnapshot,
  Submission,
  User,
} from "@/lib/domain";
import type { LearningClockSnapshot } from "@/lib/time";
import {
  formatBytes,
  parseSubmissionContent,
  type SubmissionAttachment,
} from "@/lib/submission-content";
import { initialPalette, paletteStorageKey, type ThemePaletteId } from "@/lib/theme-palettes";
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
  topic: string;
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
  primaryDiscipline: string;
  pisScore: number;
  ertBalance: number;
  currentStreak: number;
  challengeCount: number;
  latestScore: number | null;
  isFriend: boolean;
  isYou: boolean;
};

type LeaderboardRow = {
  id: string;
  name: string;
  rank: number;
  isYou: boolean;
  connectionState: "You" | "Available" | "Incoming" | "Outgoing" | "Connected";
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
  suggestions: Array<{
    id: string;
    name: string;
    rank: number | null;
    reason: string;
  }>;
  invitations: Array<{
    id: string;
    direction: "Incoming" | "Outgoing";
    createdAt: string;
    profile: {
      id: string;
      name: string;
    };
  }>;
  settings: {
    userId: string;
    discoverable: boolean;
    allowEmailInvites: boolean;
  };
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
  restDay: number;
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
  restDay?: number;
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
  challengeId?: string | null;
  role: string;
  content: string;
  actions?: Array<{ type: string; summary: string }>;
  createdAt: string;
};

type ExaminerSession = {
  id: string;
  dateKey: string;
  title: string;
  status: string;
  messageCount: number;
  active: boolean;
};

type AppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  deepLink: string | null;
  scheduledFor: string;
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
  clock: LearningClockSnapshot;
  nextChallengeUnlockAt: string;
  challengeGenerationStatus: "Queued" | "Running" | "Succeeded" | "Failed" | "FallbackUsed" | null;
  todaySubmission: Submission | null;
  todayGrade: Grade | null;
  progress: ProgressRow[];
  retention: RetentionSnapshot;
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

function detectedTimezone() {
  if (typeof Intl === "undefined") return "Africa/Johannesburg";
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "Africa/Johannesburg";
  } catch {
    return "Africa/Johannesburg";
  }
}

async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    cache: init?.cache ?? "no-store",
    headers: {
      "Content-Type": "application/json",
      "X-Client-Timezone": detectedTimezone(),
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
    restDay: "Weekly rest day",
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

function responseStarterForChallenge(challenge: Challenge) {
  const snapshotSections = challenge.disciplineSnapshot?.responseSections ?? [];
  const expectedSections = challenge.expectedAnswerFormat
    .split(/\n|;/)
    .map((line) => line.replace(/^\s*(\d+\.|-|\*)\s*/, "").trim())
    .filter((line) => line.length > 2 && line.length <= 64 && !line.includes(": "))
    .slice(0, 10);
  const sections = Array.from(
    new Set(
      (snapshotSections.length ? snapshotSections : expectedSections.length ? expectedSections : responseOutlineChips)
        .map((section) => section.replace(/\.$/, "").trim())
        .filter(Boolean),
    ),
  ).slice(0, 9);

  const body = sections.map((section) => `## ${section}\n\n- `).join("\n\n");
  const checklist = challenge.submissionRequirements
    .slice(0, 6)
    .map((item) => `- [ ] ${item}`)
    .join("\n");

  return `${body}

## Submission checklist

${checklist}
`;
}

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
const weekDayOptions = [
  { value: 0, label: "Sunday" },
  { value: 1, label: "Monday" },
  { value: 2, label: "Tuesday" },
  { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" },
  { value: 5, label: "Friday" },
  { value: 6, label: "Saturday" },
] as const;

export function GurunetApp() {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [sessionUser, setSessionUser] = useState<SafeUser | null>(null);
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
  const [focusOpen, setFocusOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => initialTheme());
  const [palette] = useState<ThemePaletteId>(() => initialPalette());
  const [deviceTimezone, setDeviceTimezone] = useState("Africa/Johannesburg");
  const [responseOpen, setResponseOpen] = useState(false);
  const [examinerOpen, setExaminerOpen] = useState(false);
  const [examinerLoading, setExaminerLoading] = useState(false);
  const [examinerMessages, setExaminerMessages] = useState<ExaminerMessage[]>([]);
  const [examinerSessions, setExaminerSessions] = useState<ExaminerSession[]>([]);
  const [examinerSessionId, setExaminerSessionId] = useState("");
  const [draftBody, setDraftBody] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<SubmissionAttachment[]>([]);
  const [draftSavedAt, setDraftSavedAt] = useState("");
  const [verification, setVerification] = useState("");
  const challengeRefresh = useRef({ challengeId: "", attempts: 0 });

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
    const frame = window.requestAnimationFrame(() => setDeviceTimezone(detectedTimezone()));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.palette = palette;
    localStorage.setItem(paletteStorageKey, palette);
  }, [palette]);

  useEffect(() => {
    async function bootstrap() {
      try {
        const data = await apiRequest<{
          user: SafeUser | null;
          profile: {
            onboardingRequired: boolean;
            studyProfile: StudyProfile | null;
            activeDiscipline: ActiveDiscipline;
          } | null;
          disciplines: DisciplineTemplate[];
          dashboard: Dashboard | null;
        }>("/api/bootstrap");
        setDisciplines(data.disciplines);
        if (data.user) {
          setSessionUser(data.user);
          setProfileGate(data.profile);
          setDashboard(data.dashboard);
        } else {
          setSessionUser(null);
          setProfileGate(null);
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

  useEffect(() => {
    const challengeId = dashboard?.today.id;
    const generationStatus = dashboard?.challengeGenerationStatus;
    if (
      !challengeId ||
      dashboard?.todaySubmission ||
      (generationStatus !== "Queued" && generationStatus !== "Running")
    ) return;
    if (challengeRefresh.current.challengeId !== challengeId) {
      challengeRefresh.current = { challengeId, attempts: 0 };
    }
    if (challengeRefresh.current.attempts >= 8) return;

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        challengeRefresh.current.attempts += 1;
        const result = await apiRequest<{
          challenge: Challenge;
          challengeGenerationStatus: Dashboard["challengeGenerationStatus"];
        }>("/api/challenges/today");
        if (cancelled) return;
        setDashboard((current) =>
          current?.today.id === challengeId
            ? {
                ...current,
                today: result.challenge,
                challengeGenerationStatus: result.challengeGenerationStatus,
              }
            : current,
        );
      } catch (error) {
        console.error("Challenge refresh failed", error);
      }
    }, 2500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [dashboard?.challengeGenerationStatus, dashboard?.today.id, dashboard?.todaySubmission]);

  async function loadDashboard() {
    const data = await apiRequest<Dashboard>("/api/me/stats");
    setSessionUser(data.user);
    setDashboard(data);
    setProfileGate({
      onboardingRequired: data.onboardingRequired,
      studyProfile: data.studyProfile,
      activeDiscipline: data.activeDiscipline,
    });
    setVerification("");
  }

  useEffect(() => {
    const storedTimezone = sessionUser?.timezone;
    if (!storedTimezone || storedTimezone === deviceTimezone) return;
    const syncKey = `gurunet.timezone-sync:${storedTimezone}:${deviceTimezone}`;
    if (sessionStorage.getItem(syncKey)) return;
    sessionStorage.setItem(syncKey, "attempted");

    let cancelled = false;
    void apiRequest<{ user: SafeUser }>("/api/me", {
      method: "PATCH",
      body: JSON.stringify({ timezone: deviceTimezone }),
    })
      .then(async () => {
        if (cancelled || !dashboard) return;
        const refreshed = await apiRequest<Dashboard>("/api/me/stats");
        if (cancelled) return;
        setSessionUser(refreshed.user);
        setDashboard(refreshed);
        setProfileGate({
          onboardingRequired: refreshed.onboardingRequired,
          studyProfile: refreshed.studyProfile,
          activeDiscipline: refreshed.activeDiscipline,
        });
      })
      .catch((error) => console.warn("Timezone synchronization failed", error));

    return () => {
      cancelled = true;
    };
  }, [dashboard, deviceTimezone, sessionUser?.timezone]);

  useEffect(() => {
    const clock = dashboard?.clock;
    if (!clock) return;
    const serverAtLoad = Date.parse(clock.serverNow);
    const boundary = Date.parse(clock.nextChallengeReleaseAt);
    if (!Number.isFinite(serverAtLoad) || !Number.isFinite(boundary)) return;
    const clientAtLoad = Date.now();
    let refreshing = false;

    async function refreshForBoundary() {
      if (refreshing) return;
      refreshing = true;
      try {
        const refreshed = await apiRequest<Dashboard>("/api/me/stats");
        setSessionUser(refreshed.user);
        setDashboard(refreshed);
        setProfileGate({
          onboardingRequired: refreshed.onboardingRequired,
          studyProfile: refreshed.studyProfile,
          activeDiscipline: refreshed.activeDiscipline,
        });
      } catch (error) {
        console.warn("Learning-day refresh failed", error);
        refreshing = false;
      }
    }

    const millisecondsUntilBoundary = Math.max(1_000, boundary - serverAtLoad + 1_500);
    const timer = window.setTimeout(() => void refreshForBoundary(), millisecondsUntilBoundary);
    function refreshIfBoundaryPassed() {
      if (document.visibilityState !== "visible") return;
      const estimatedServerNow = serverAtLoad + (Date.now() - clientAtLoad);
      if (estimatedServerNow >= boundary) void refreshForBoundary();
    }
    document.addEventListener("visibilitychange", refreshIfBoundaryPassed);
    window.addEventListener("focus", refreshIfBoundaryPassed);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", refreshIfBoundaryPassed);
      window.removeEventListener("focus", refreshIfBoundaryPassed);
    };
  }, [dashboard?.clock]);

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
    if (!dashboard?.user) return;
    let active = true;
    const seenKey = `gurunet.notifications.seen:${dashboard.user.id}`;

    async function pollNotifications() {
      try {
        const result = await apiRequest<{ notifications: AppNotification[] }>("/api/v1/notifications/inbox");
        if (!active) return;
        const stored = localStorage.getItem(seenKey);
        const seen = new Set<string>(stored ? JSON.parse(stored) as string[] : []);
        const unseen = result.notifications.filter((item) => !seen.has(item.id));
        localStorage.setItem(
          seenKey,
          JSON.stringify(result.notifications.slice(0, 60).map((item) => item.id)),
        );
        if (!stored || unseen.length === 0) return;
        const latest = unseen[0];
        setStatus(`${latest.title}: ${latest.body}`);
        if ("Notification" in window && Notification.permission === "granted") {
          const alert = new Notification(latest.title, { body: latest.body, tag: latest.id });
          alert.onclick = () => {
            window.focus();
            if (latest.deepLink) window.location.assign(latest.deepLink);
            alert.close();
          };
        }
      } catch {
        // Notification polling must never interrupt the learning workflow.
      }
    }

    void pollNotifications();
    const timer = window.setInterval(() => void pollNotifications(), 60_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [dashboard?.user]);

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
    setSessionUser(null);
    setDashboard(null);
  }

  const openResponseEditor = useCallback(() => {
    if (today?.status === "RestDay") {
      setStatus("No response is required on the selected weekly rest day.");
      return;
    }
    if (today && !todaySubmission && !draftBody.trim() && draftAttachments.length === 0) {
      setDraftBody(responseStarterForChallenge(today));
      setDraftSavedAt(new Date().toISOString());
    }
    setResponseOpen(true);
  }, [draftAttachments.length, draftBody, today, todaySubmission]);

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

  const loadExaminerSession = useCallback(async (challengeId: string) => {
    setExaminerLoading(true);
    setExaminerSessionId(challengeId);
    try {
      const data = await apiRequest<{ messages: ExaminerMessage[]; sessions: ExaminerSession[] }>(
        `/api/examiner/chat?challengeId=${encodeURIComponent(challengeId)}&activeChallengeId=${encodeURIComponent(today?.id ?? challengeId)}`,
      );
      setExaminerMessages(data.messages);
      setExaminerSessions(data.sessions);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Examiner chat failed");
    } finally {
      setExaminerLoading(false);
    }
  }, [today]);

  const openExaminer = useCallback(async () => {
    if (!today) return;
    setExaminerOpen(true);
    setExaminerSessionId(today.id);
    await loadExaminerSession(today.id);
  }, [loadExaminerSession, today]);

  async function sendExaminerMessage(message: string) {
    if (!today || !message.trim()) return;
    setBusy(true);
    setStatus("");
    try {
      const optimistic: ExaminerMessage = {
        id: `local-${Date.now()}`,
        challengeId: today.id,
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
      setExaminerSessions((items) =>
        items.map((session) =>
          session.id === today.id
            ? { ...session, messageCount: session.messageCount + 2 }
            : session,
        ),
      );
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
      setStatus("Connection request processed. The recipient must accept before profile details are shared.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Friend lookup failed");
    } finally {
      setBusy(false);
    }
  }

  async function inviteSuggestedUser(userId: string) {
    setBusy(true);
    setStatus("");
    try {
      await apiRequest("/api/v1/social/invitations", {
        method: "POST",
        body: JSON.stringify({ userId }),
      });
      await loadDashboard();
      setStatus("Connection request sent.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Connection request failed");
    } finally {
      setBusy(false);
    }
  }

  async function actOnInvitation(id: string, action: "accept" | "decline" | "cancel" | "block") {
    setBusy(true);
    setStatus("");
    try {
      await apiRequest(`/api/v1/social/invitations/${id}/${action}`, { method: "POST" });
      await loadDashboard();
      setStatus(action === "accept" ? "Connection accepted." : "Connection request updated.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Connection update failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveSocialSettings(settings: { discoverable: boolean; allowEmailInvites: boolean }) {
    setBusy(true);
    setStatus("");
    try {
      await apiRequest("/api/v1/social/settings", {
        method: "PATCH",
        body: JSON.stringify(settings),
      });
      await loadDashboard();
      setStatus("Connection privacy settings saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Privacy settings failed");
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
            timeZone: dashboard?.clock.timezone,
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "short",
          }).format(new Date(today.deadlineAt))
        : "",
    [dashboard?.clock.timezone, today],
  );
  const nextUnlock = useMemo(
    () =>
      nextChallengeUnlockAt
        ? new Intl.DateTimeFormat("en-ZA", {
            timeZone: dashboard?.clock.timezone,
            hour: "2-digit",
            minute: "2-digit",
            day: "2-digit",
            month: "short",
          }).format(new Date(nextChallengeUnlockAt))
        : "",
    [dashboard?.clock.timezone, nextChallengeUnlockAt],
  );
  const commandActions = useMemo(() => {
    if (!dashboard || !user || !today) return [];
    const isRestDay = today.status === "RestDay";
    const assessmentActions = isRestDay
      ? []
      : [
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
            action: openResponseEditor,
          },
          {
            id: "sample",
            title: "Load sample response",
            description: "Insert a model response outline into the editor.",
            shortcut: "S",
            action: loadSampleAnswer,
          },
        ];

    return [
      ...assessmentActions,
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
        title: "Go to network",
        description: "Open leaderboards, friends, marketplace challenges, and cohorts.",
        shortcut: "3",
        action: () => scrollToSection("social"),
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
        action: () => window.location.assign("/account"),
      },
    ];
  },
    [dashboard, hasDraft, openExaminer, openResponseEditor, today, todaySubmission, user],
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
                <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white/55 px-3 py-2 text-xs text-slate-600">
                  <CalendarClock size={15} className="shrink-0 text-cyan-700" />
                  <input type="hidden" name="timezone" value={deviceTimezone} />
                  Dates and deadlines will follow {deviceTimezone}.
                </div>
              )}
            </div>

            <div className="mt-5 grid gap-2">
              <ProviderButton provider="google" label="Continue with Google" icon={<GoogleMark />} />
              <div className="grid gap-2 sm:grid-cols-2">
                <ProviderButton provider="github" label="GitHub" icon={<GitBranch size={16} />} />
                <ProviderButton provider="apple" label="Apple" icon={<Apple size={16} />} />
              </div>
            </div>

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
        onAccount={() => window.location.assign("/account")}
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
        onInviteSuggestion={inviteSuggestedUser}
        onInvitationAction={actOnInvitation}
        onExaminer={openExaminer}
        onFocus={() => setFocusOpen(true)}
        onGrade={gradeSubmission}
        onJoinCohort={joinCohort}
        onOpenResponse={openResponseEditor}
        onRedeem={redeem}
        onSample={loadSampleAnswer}
        onSaveProfile={saveStudyProfile}
        onSaveSocialSettings={saveSocialSettings}
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
        onRespond={openResponseEditor}
      />
      <ExaminerChatModal
        activeChallengeId={today.id}
        busy={busy}
        loading={examinerLoading}
        messages={examinerMessages}
        notice={dashboard.todayNotice}
        open={examinerOpen}
        selectedSessionId={examinerSessionId}
        sessions={examinerSessions}
        onOpenChange={setExaminerOpen}
        onSelectSession={(challengeId) => void loadExaminerSession(challengeId)}
        onSend={sendExaminerMessage}
      />
      <CommandPalette
        actions={commandActions}
        open={commandOpen}
        onOpenChange={setCommandOpen}
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

function ProviderButton({
  provider,
  label,
  icon,
}: {
  provider: "google" | "github" | "apple";
  label: string;
  icon: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        window.location.assign(`/api/auth/signin/${provider}`);
      }}
      className="interactive-lift flex h-11 w-full items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 shadow-sm"
    >
      {icon}
      {label}
    </button>
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
  onInviteSuggestion,
  onInvitationAction,
  onExaminer,
  onFocus,
  onGrade,
  onJoinCohort,
  onOpenResponse,
  onRedeem,
  onSample,
  onSaveProfile,
  onSaveSocialSettings,
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
  onInviteSuggestion: (userId: string) => void;
  onInvitationAction: (id: string, action: "accept" | "decline" | "cancel" | "block") => void;
  onExaminer: () => void;
  onFocus: () => void;
  onGrade: () => void;
  onJoinCohort: (event: FormEvent<HTMLFormElement>) => void;
  onOpenResponse: () => void;
  onRedeem: (event: FormEvent<HTMLFormElement>) => void;
  onSample: () => void;
  onSaveProfile: (input: unknown) => void;
  onSaveSocialSettings: (settings: { discoverable: boolean; allowEmailInvites: boolean }) => void;
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
        title="Assessment workspace"
        text="Read the brief, build the response, and review the result in one continuous flow."
      >
        <div className="dashboard-task-layout">
          <div className="grid min-w-0 content-start gap-8">
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

            {grade && submission && (
              <section id="assessment-feedback" className="scroll-mt-24 border-t border-slate-200 pt-6">
                <div className="mb-5 max-w-2xl">
                  <h3 className="text-xl font-semibold text-slate-950">Result and worked correction</h3>
                  <p className="mt-1 text-sm leading-6 text-slate-600">
                    See how the score was formed, then compare your reasoning with the worked solution.
                  </p>
                </div>
                <div className="grid gap-8">
                  <GradeSummary grade={grade} plain showStrip={false} />
                  <TeachingPanel challenge={dashboard.today} grade={grade} submission={submission} plain />
                </div>
              </section>
            )}
          </div>

          <aside className="dashboard-task-rail" aria-label="Daily progress and rewards">
            <DailyMomentumPanel
              busy={busy}
              grade={grade}
              nextUnlock={nextUnlock}
              onRedeem={onRedeem}
              retention={dashboard.retention}
              restDay={dashboard.today.status === "RestDay"}
              user={user}
            />
          </aside>
        </div>
      </AstroSection>

      <AstroSection
        id="metrics"
        title="Progress"
        text="Start with the long-term trend, then inspect consistency, score spread, and recent attempts."
      >
        <div className="dashboard-metrics-layout">
          <div className="grid min-w-0 content-start gap-8">
            <AstroCard title="PIS trend">
              <PisTrendChart currentPis={user.pisScore} rows={dashboard.progress} />
            </AstroCard>
            {grade && (
              <AstroCard title="Latest axis performance">
                <AxisPerformancePrism grade={grade} />
              </AstroCard>
            )}
          </div>
          <aside className="grid min-w-0 content-start gap-8" aria-label="Progress summaries">
            <AstroCard title="Streak and timing">
              <ActivityGrid rows={dashboard.progress} />
            </AstroCard>
            <AstroCard title="Score distribution">
              <FrequencyPolygon rows={dashboard.progress} />
            </AstroCard>
          </aside>
        </div>
        <AstroCard title="Recent attempts" className="mt-8">
          <ProgressPanel rows={dashboard.progress} />
        </AstroCard>
      </AstroSection>

      <AstroSection
        id="learning"
        title="Learning record"
        text="Keep useful corrections and your own field notes searchable without crowding the daily assessment."
      >
        <div className="max-w-3xl">
          <NotebookPanel
            key={dashboard.notebookEntries.map((entry) => entry.id).join(":")}
            busy={busy}
            entries={dashboard.notebookEntries}
            redemptions={dashboard.redemptions}
            onAskExaminer={onExaminer}
            showRedemptions={false}
            plain
          />
        </div>
      </AstroSection>

      <AstroSection
        id="social"
        title="Network"
        text="Compare progress, find peers, and join shared work after today's individual loop is complete."
      >
        <div className="grid gap-8">
          <SocialPanel
            social={dashboard.social}
            busy={busy}
            onAddFriend={onAddFriend}
            onEnroll={onEnrollMarketplace}
            onInviteSuggestion={onInviteSuggestion}
            onInvitationAction={onInvitationAction}
            onSaveSocialSettings={onSaveSocialSettings}
            plain
          />
          <details className="dashboard-management group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 marker:hidden">
              <span>
                <span className="block font-semibold text-slate-950">Training settings and cohorts</span>
                <span className="mt-1 block text-sm text-slate-500">
                  {dashboard.activeDiscipline.label} profile, {dashboard.cohorts.length} active {dashboard.cohorts.length === 1 ? "cohort" : "cohorts"}
                </span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-cyan-700 transition-transform group-open:rotate-90" />
            </summary>
            <div className="border-t border-slate-200 py-6">
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
            </div>
          </details>
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
  const primaryAction = dashboard.today.status === "RestDay"
    ? { label: "Review progress", action: () => scrollToSection("metrics") }
    : grade
    ? { label: "Review result", action: () => scrollToSection("assessment-feedback") }
    : submission
      ? { label: "Grade response", action: onGrade }
      : { label: hasDraft ? "Continue response" : "Respond", action: onOpenResponse };
  return (
    <section className="dashboard-overview">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div className="min-w-0 max-w-4xl">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={dashboard.today.status} />
            <span className="text-sm font-medium text-cyan-800">{dashboard.activeDiscipline.label}</span>
          </div>
          <h1 className="mt-3 text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl">
            {dashboard.today.status === "RestDay" ? "Your weekly rest day" : dashboard.today.title}
          </h1>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
            {dashboard.today.status === "RestDay" ? (
              <span>No assessment is due today.</span>
            ) : (
              <span className="inline-flex items-center gap-1.5"><CalendarClock size={15} /> Due {deadline}</span>
            )}
            <span>Next brief {nextUnlock}</span>
            <span>{dashboard.today.topic}</span>
            {dashboard.today.recoveryContext && (
              <span className="inline-flex items-center gap-1.5 text-amber-800">
                <CheckCircle2 size={15} />
                Quick recovery: {dashboard.today.recoveryContext.target}
              </span>
            )}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={primaryAction.action}
              className="interactive-lift inline-flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white"
            >
              <FileText size={15} />
              {primaryAction.label}
            </button>
            <button
              type="button"
              onClick={onExaminer}
              className="interactive-lift inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
            >
              <ShieldCheck size={15} />
              Talk to examiner
            </button>
          </div>
        </div>

        <dl className="grid grid-cols-3 border-y border-slate-200 py-3 lg:min-w-[19rem]">
          <MiniStat label="PIS" value={user.pisScore.toFixed(1)} />
          <MiniStat label="ERT" value={String(user.ertBalance)} />
          <MiniStat label="Streak" value={`${user.currentStreak}d`} />
        </dl>
      </div>
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 border-l border-slate-200 px-3 first:border-l-0">
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="mt-0.5 font-mono text-lg font-semibold text-slate-950">{value}</dd>
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
  eyebrow?: string;
  id: string;
  text: string;
  title: string;
}) {
  return (
    <section id={id} className="astrowind-section">
      <div className="mb-6 max-w-3xl">
        {eyebrow && <p className="astrowind-kicker">{eyebrow}</p>}
        <h2 className={`${eyebrow ? "mt-2" : ""} text-2xl font-semibold text-slate-950 sm:text-3xl`}>
          {title}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600 sm:text-base">{text}</p>
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
    <section className={`astrowind-card min-w-0 self-start ${className}`}>
      <h3 className="mb-3 text-base font-semibold text-slate-950">{title}</h3>
      {children}
    </section>
  );
}

const packetHeadings = new Set([
  "Assessment mode",
  "Role and setting",
  "Context",
  "Available artifacts",
  "Required deliverable",
  "Reproducible exercise",
  "Task 1 - Main assessment",
  "Task 2 - Targeted reinforcement",
  "Scenario / Background",
  "Topology / Context",
  "Evidence Provided",
  "Recovery Component",
  "Optional Lab",
  "Submission Deadline",
  "The setup",
  "Clues",
  "Try it yourself (optional)",
  "Deadline",
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
        if (packetHeadings.has(trimmed) || /^Quick recovery(?:\s*[-:·].*)?$/i.test(trimmed)) {
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
  if (challenge.status === "RestDay") {
    return (
      <div className="grid gap-4 border-y border-slate-200 py-6">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-full bg-sky-50 text-sky-800">
            <Moon size={19} />
          </span>
          <div>
            <p className="text-sm font-semibold text-slate-950">Scheduled weekly rest day</p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-600">{challenge.scenario}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
          <span>No submission required</span>
          <span aria-hidden="true">·</span>
          <span>Next unlock {nextUnlock}</span>
          <button type="button" onClick={onExaminer} className="font-semibold text-cyan-800">Talk to examiner</button>
        </div>
      </div>
    );
  }
  return (
    <div className="grid gap-4">
      {submission ? (
        <div className="border-y border-slate-200 py-3">
          <p className="text-sm font-semibold text-slate-950">Submitted response</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            This assessment stays focused on the submitted work until the next challenge unlocks at {nextUnlock}.
          </p>
        </div>
      ) : (
        <div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-cyan-800">
            <span>{challenge.topic}</span>
          </div>
          <h2 className="mt-1 text-2xl font-semibold tracking-normal text-slate-950">
            {challenge.title}
          </h2>
          <div className="mt-4">
            <PacketText text={challenge.scenario} />
          </div>
          <div className="mt-5 border-l-2 border-cyan-700 pl-4">
            <p className="text-xs font-semibold text-slate-500">
              Objective
            </p>
            <p className="mt-1 leading-7 text-slate-700">{challenge.objective}</p>
          </div>
        </div>
      )}

      {submission ? (
        <details className="group border-b border-slate-200">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3 text-sm font-semibold text-slate-900 marker:hidden">
            Challenge prompt
            <ChevronRight size={16} className="text-cyan-700 transition-transform group-open:rotate-90" />
          </summary>
          <div className="border-t border-slate-200 py-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold text-cyan-800">
              <span>{challenge.topic}</span>
            </div>
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
        challenge={challenge}
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
    <section className="onboarding-shell astrowind-shell">
      <header className="onboarding-intro grid gap-8 border-b border-slate-200 pb-8 pt-7 lg:grid-cols-[minmax(0,1fr)_18rem] lg:items-end">
        <div>
          <p className="astrowind-kicker">Your learning system</p>
          <h1 className="mt-3 max-w-3xl text-3xl font-semibold leading-tight text-slate-950 sm:text-4xl">
            Make tomorrow&apos;s challenge feel built for you.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-slate-600">
            Three short decisions set your discipline, practice style, evidence standard, and weekly rhythm. You can refine any of them later.
          </p>
        </div>
        <div className="border-l-2 border-cyan-700 pl-4 text-sm leading-6 text-slate-600">
          <p className="font-semibold text-slate-950">About three minutes</p>
          <p className="mt-1">Finish once, then GURUnet prepares one focused brief each learning day.</p>
        </div>
      </header>

      <StudyProfileForm
        busy={busy}
        disciplines={disciplines}
        errors={errors}
        onboarding
        status={status}
        onSave={onSave}
      />
    </section>
  );
}

type StudyProfileFormInput = {
  primaryDiscipline: string;
  secondaryInterests: string[];
  rankedTopics: string[];
  currentLevel: string;
  preferredFormats: string[];
  evidenceTypes: string[];
  weeklyTimeBudgetHours: number;
  restDay: number;
  targetDifficulty: string;
  weakAreas: string[];
  avoidAreas: string[];
  goals: string[];
  customDiscipline?: string;
  preferenceNotes?: string;
};

function studyProfileInputFromForm(form: HTMLFormElement, selectedId: string): StudyProfileFormInput {
  const data = new FormData(form);
  return {
    primaryDiscipline: String(data.get("primaryDiscipline") || selectedId),
    secondaryInterests: data.getAll("secondaryInterests").map(String),
    rankedTopics: data.getAll("rankedTopics").map(String),
    currentLevel: String(data.get("currentLevel") || "Intermediate"),
    preferredFormats: data.getAll("preferredFormats").map(String),
    evidenceTypes: data.getAll("evidenceTypes").map(String),
    weeklyTimeBudgetHours: Number(data.get("weeklyTimeBudgetHours") || 4),
    restDay: Number(data.get("restDay") || 0),
    targetDifficulty: String(data.get("targetDifficulty") || "Normal"),
    weakAreas: data.getAll("weakAreas").map(String),
    avoidAreas: data.getAll("avoidAreas").map(String),
    goals: data.getAll("goals").map(String),
    customDiscipline: String(data.get("customDiscipline") || "") || undefined,
    preferenceNotes: String(data.get("preferenceNotes") || "") || undefined,
  };
}

function StudyProfileForm({
  busy,
  disciplines,
  errors,
  initialProfile,
  onboarding = false,
  status,
  submitLabel = "Save profile",
  onSave,
}: {
  busy: boolean;
  disciplines: DisciplineTemplate[];
  errors: string[];
  initialProfile?: StudyProfile | null;
  onboarding?: boolean;
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
  const [step, setStep] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const visibleErrors = [...clientErrors, ...errors];
  const steps = [
    { title: "Direction", text: "Choose the work that should matter most.", icon: <Compass size={18} /> },
    { title: "Practice", text: "Set how challenges should test you.", icon: <Target size={18} /> },
    { title: "Rhythm", text: "Fit serious practice into a real week.", icon: <CalendarClock size={18} /> },
  ];

  useEffect(() => {
    if (errors.length === 0) return;
    const joined = errors.join(" ").toLowerCase();
    const targetStep = /primary discipline|ranked topic|professional goal|current level/.test(joined)
      ? 0
      : /preferred format|evidence|weak area|secondary interest/.test(joined)
        ? 1
        : 2;
    const frame = window.requestAnimationFrame(() => setStep(targetStep));
    return () => window.cancelAnimationFrame(frame);
  }, [errors]);

  function readInput() {
    return formRef.current ? studyProfileInputFromForm(formRef.current, selectedId) : null;
  }

  function continueToNextStep() {
    const input = readInput();
    if (!input) return;
    const nextErrors = validateStudyProfileInput(input, step);
    setClientErrors(nextErrors);
    if (nextErrors.length > 0) return;
    setStep((current) => Math.min(steps.length - 1, current + 1));
    window.requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < steps.length - 1) {
      continueToNextStep();
      return;
    }
    const input = studyProfileInputFromForm(event.currentTarget, selectedId);
    const nextErrors = validateStudyProfileInput(input);
    setClientErrors(nextErrors);
    if (nextErrors.length > 0) return;
    onSave(input);
  }

  return (
    <form ref={formRef} onSubmit={submit} className="onboarding-form scroll-mt-20">
      <div className="grid gap-4 border-b border-slate-200 pb-5 sm:grid-cols-3" aria-label={`Step ${step + 1} of ${steps.length}`}>
        {steps.map((item, index) => {
          const active = index === step;
          const complete = index < step;
          return (
            <button
              key={item.title}
              type="button"
              disabled={index > step}
              onClick={() => {
                if (index < step) {
                  setClientErrors([]);
                  setStep(index);
                }
              }}
              className={`onboarding-step-tab flex items-start gap-3 border-t-2 pt-3 text-left transition-colors ${
                active
                  ? "border-cyan-700 text-slate-950"
                  : complete
                    ? "border-slate-400 text-slate-700"
                    : "border-slate-200 text-slate-400"
              }`}
              aria-current={active ? "step" : undefined}
            >
              <span className={`mt-0.5 ${active ? "text-cyan-700" : ""}`}>
                {complete ? <CheckCircle2 size={18} /> : item.icon}
              </span>
              <span>
                <span className="block text-xs font-semibold uppercase tracking-[0.1em]">Step {index + 1}</span>
                <span className="mt-1 block text-sm font-semibold">{item.title}</span>
                <span className="mt-0.5 hidden text-xs font-normal leading-5 text-slate-500 sm:block">{item.text}</span>
              </span>
            </button>
          );
        })}
      </div>

      {(status || visibleErrors.length > 0) && (
        <div
          className={`mt-5 border-l-2 px-4 py-2 text-sm leading-6 ${
            visibleErrors.length > 0
              ? "border-orange-500 bg-orange-50/70 text-orange-950"
              : "border-cyan-700 bg-cyan-50/50 text-slate-700"
          }`}
          aria-live="polite"
        >
          {status && <p className="font-semibold">{status}</p>}
          {visibleErrors.length > 0 && (
            <ul className="grid gap-1">
              {visibleErrors.map((error) => <li key={error}>- {error}</li>)}
            </ul>
          )}
        </div>
      )}

      <section className={step === 0 ? "onboarding-step-content soft-enter" : "hidden"}>
        <div className="grid gap-5 lg:grid-cols-[minmax(14rem,0.7fr)_minmax(0,1.3fr)]">
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
            <div className="border-l border-slate-200 pl-5 text-sm leading-6 text-slate-600">
              <p className="font-semibold text-slate-950">{selected?.label} practice</p>
              <p className="mt-1">{selected?.summary}</p>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                The rubric stays governed; your selections decide which topics and formats appear most often.
              </p>
            </div>
          </div>

        <div className="mt-7 grid gap-7 lg:grid-cols-2">
          <div>
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Current level
              <select name="currentLevel" defaultValue={initialProfile?.currentLevel ?? "Intermediate"} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
                {[
                  ["Beginner", "Guided tasks and examples"],
                  ["Intermediate", "Structured independent work"],
                  ["Advanced", "Ambiguous cases and trade-offs"],
                  ["Production", "Live constraints and operational judgment"],
                  ["Expert", "Edge cases and high-pressure review"],
                ].map(([value, label]) => <option key={value} value={value}>{value} - {label}</option>)}
              </select>
            </label>
            <div className="mt-6">
              <h2 className="text-sm font-semibold text-slate-900">Professional goal</h2>
              <CheckboxGrid
                name="goals"
                values={professionalGoalOptions}
                defaultValues={initialProfile?.goals}
                min={1}
                max={3}
                limitHint="Pick 1-3 outcomes. These shape long-term emphasis, not today's score."
              />
            </div>
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Priority topics</h2>
            <CheckboxGrid
              key={`${selectedId}-rankedTopics`}
              name="rankedTopics"
              values={topics}
              defaultValues={initialProfile?.rankedTopics ?? topics.slice(0, 3)}
              min={3}
              max={8}
              limitHint="Pick 3-8. These become the priority topic pool for generated challenges."
            />
          </div>
        </div>
      </section>

      <section className={step === 1 ? "onboarding-step-content soft-enter" : "hidden"}>
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Challenge formats</h2>
            <CheckboxGrid
              key={`${selectedId}-preferredFormats`}
              name="preferredFormats"
              values={formats}
              defaultValues={initialProfile?.preferredFormats ?? formats.slice(0, 2)}
              min={2}
              max={6}
              limitHint="Two useful defaults are selected. Change them to match how you prefer to practise."
            />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Evidence you can produce</h2>
            <CheckboxGrid
              key={`${selectedId}-evidenceTypes`}
              name="evidenceTypes"
              values={evidenceTypes}
              defaultValues={initialProfile?.evidenceTypes ?? evidenceTypes.slice(0, 2)}
              min={2}
              max={8}
              limitHint="The first two are recommended. The examiner uses these as proof standards."
            />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Area to strengthen first</h2>
            <CheckboxGrid
              key={`${selectedId}-weakAreas`}
              name="weakAreas"
              values={topics}
              defaultValues={initialProfile?.weakAreas}
              min={1}
              max={3}
              limitHint="Pick 1-3 honest gaps. These guide reinforcement; they do not lower your grade."
            />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-slate-900">Adjacent interests</h2>
            <CheckboxGrid
              key={`${selectedId}-secondaryInterests`}
              name="secondaryInterests"
              values={disciplines
                .filter((item) => item.id !== selectedId)
                .map((item) => ({ value: item.id, label: item.label }))}
              defaultValues={initialProfile?.secondaryInterests}
              max={3}
              limitHint="Optional. Add up to 3 areas for occasional cross-training."
            />
          </div>
        </div>
      </section>

      <section className={step === 2 ? "onboarding-step-content soft-enter" : "hidden"}>
        <div className="grid gap-4 md:grid-cols-3">
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
              Weekly rest day
              <select name="restDay" defaultValue={initialProfile?.restDay ?? 0} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm">
                {weekDayOptions.map((day) => <option key={day.value} value={day.value}>{day.label}</option>)}
              </select>
              <span className="text-xs font-normal leading-5 text-slate-500">No assessment is due. The next day contains two recovery tasks.</span>
            </label>
          </div>

          <label className="mt-7 grid gap-1.5 text-sm font-medium text-slate-700">
            Written preferences
            <textarea
              name="preferenceNotes"
              className="min-h-24 rounded-md border border-slate-300 bg-white p-3 text-sm leading-6"
              maxLength={1000}
              defaultValue={initialProfile?.preferenceNotes ?? ""}
              placeholder="Example: I prefer hands-on lab challenges with clear setup, tasks, evidence capture, and validation. Avoid purely theoretical questions unless needed."
            />
            <span className="text-xs font-normal leading-5 text-slate-500">
              Optional, but useful. Describe the mix, pace, tools, or context that would make the practice recognisably yours. Safety and grading standards remain governed.
            </span>
          </label>

          <details className="group mt-6 border-t border-slate-200 pt-4">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-700 marker:hidden">
              Optional fine-tuning
              <ChevronRight size={16} className="text-cyan-700 transition-transform group-open:rotate-90" />
            </summary>
            <div className="mt-5 grid gap-7 lg:grid-cols-2">
              <label className="grid content-start gap-1.5 text-sm font-medium text-slate-700">
                Custom specialty request
                <input name="customDiscipline" defaultValue={initialProfile?.customDiscipline ?? ""} className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm" placeholder="Example: radio access network optimisation" />
                <span className="text-xs font-normal leading-5 text-slate-500">
                  A custom path stays draft until it has specific written context. The governed discipline remains the fallback.
                </span>
              </label>
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Areas to de-emphasise</h2>
                <CheckboxGrid
                  key={`${selectedId}-avoidAreas`}
                  name="avoidAreas"
                  values={topics}
                  defaultValues={initialProfile?.avoidAreas}
                  max={4}
                  limitHint="Optional. Do not select the same area as a weakness."
                />
              </div>
            </div>
          </details>

          {onboarding && (
            <div className="mt-7 border-l-2 border-cyan-700 pl-4 text-sm leading-6 text-slate-600">
              <p className="font-semibold text-slate-950">Your first brief</p>
              <p className="mt-1">
                GURUnet will combine {selected?.label ?? "your discipline"}, your selected topics, and your preferred evidence into one focused challenge. It will not expose the solution before submission.
              </p>
            </div>
          )}
      </section>

      <div className="onboarding-actions sticky bottom-2 z-10 mt-6 flex items-center justify-between gap-4 border-t border-slate-200 bg-white/92 py-4 backdrop-blur-md">
        <button
          type="button"
          onClick={() => {
            setClientErrors([]);
            setStep((current) => Math.max(0, current - 1));
          }}
          className={`flex h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 ${step === 0 ? "invisible" : ""}`}
        >
          <ArrowLeft size={16} />
          Back
        </button>
        <p className="hidden text-xs text-slate-500 sm:block">Step {step + 1} of {steps.length}</p>
        {step < steps.length - 1 ? (
          <button type="button" onClick={continueToNextStep} className="flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white">
            Continue
            <ArrowRight size={16} />
          </button>
        ) : (
          <button disabled={busy} className="flex h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white disabled:opacity-60">
            {busy ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
            {onboarding ? "Build my first challenge" : submitLabel}
          </button>
        )}
      </div>
    </form>
  );
}

function validateStudyProfileInput(input: StudyProfileFormInput, step?: number) {
  const errors: string[] = [];
  const validateStep = (target: number) => step === undefined || step === target;
  if (validateStep(0)) {
    if (input.rankedTopics.length < 3) errors.push("Priority topics: pick at least 3 focused topics.");
    if (input.rankedTopics.length > 8) errors.push("Priority topics: pick no more than 8 topics.");
    if (input.goals.length < 1) errors.push("Professional goal: pick at least 1 outcome.");
    if (input.goals.length > 3) errors.push("Professional goal: pick no more than 3 outcomes.");
  }
  if (validateStep(1)) {
    if (input.preferredFormats.length < 2) errors.push("Challenge formats: keep at least 2 formats selected.");
    if (input.preferredFormats.length > 6) errors.push("Challenge formats: pick no more than 6 formats.");
    if (input.evidenceTypes.length < 2) errors.push("Evidence: keep at least 2 evidence types selected.");
    if (input.evidenceTypes.length > 8) errors.push("Evidence: pick no more than 8 evidence types.");
    if (input.weakAreas.length < 1) errors.push("Area to strengthen: pick at least 1 area.");
    if (input.weakAreas.length > 3) errors.push("Area to strengthen: pick no more than 3 areas.");
  }
  if (validateStep(2)) {
    if (!Number.isInteger(input.weeklyTimeBudgetHours) || input.weeklyTimeBudgetHours < 1 || input.weeklyTimeBudgetHours > 40) {
      errors.push("Weekly hours: enter a whole number from 1 to 40.");
    }
    if (!Number.isInteger(input.restDay) || input.restDay < 0 || input.restDay > 6) {
      errors.push("Weekly rest day: select one day of the week.");
    }
    const overlap = input.weakAreas.filter((item) => input.avoidAreas.includes(item));
    if (overlap.length > 0) errors.push(`Fine-tuning: ${overlap.join(", ")} cannot be both a weakness and an avoid area.`);
    if (input.customDiscipline && (input.preferenceNotes?.trim().length ?? 0) < 60) {
      errors.push("Custom specialty requests need at least 60 characters of written context.");
    }
  }
  return errors;
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
    () => {
      const allowedDefaults = (defaultValues ?? []).filter((value) => allowedValues.has(value));
      return allowedDefaults.slice(0, max ?? allowedDefaults.length);
    },
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
  const label = status === "RestDay" ? "Rest day" : status.replace(/([a-z])([A-Z])/g, "$1 $2");
  const tone = status.includes("Missed")
    ? "border-red-200 bg-red-50 text-red-700"
    : status.includes("Protected")
      ? "border-sky-200 bg-sky-50 text-sky-800"
    : status.includes("RestDay")
      ? "border-sky-200 bg-sky-50 text-sky-800"
    : status.includes("Late")
      ? "border-amber-200 bg-amber-50 text-amber-800"
      : status.includes("Recovery")
        ? "border-sky-200 bg-sky-50 text-sky-800"
        : "border-cyan-200 bg-cyan-50 text-cyan-800";

  return (
    <span className={`rounded-md border px-3 py-1 text-xs font-semibold ${tone}`}>
      {label}
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
            className="size-3.5 rounded-[2px] border transition-colors"
            style={activityStyle(row)}
          />
        ))}
      </div>
    </div>
  );
}

function activityTitle(row?: ProgressRow) {
  if (!row) return "No record";
  if (row.status.includes("Protected")) return `${row.date}: absence protected by a continuity credit`;
  if (row.status.includes("RestDay")) return `${row.date}: scheduled weekly rest day`;
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
  if (row.status.includes("Protected")) return { backgroundColor: "#38bdf8", borderColor: "#0284c7" };
  if (row.status.includes("RestDay")) return { backgroundColor: "#bae6fd", borderColor: "#38bdf8" };
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
              <stop offset="0%" stopColor="var(--palette-accent)" stopOpacity="0.22" />
              <stop offset="100%" stopColor="var(--palette-accent)" stopOpacity="0.03" />
            </linearGradient>
          </defs>
          <line
            x1={padX}
            x2={width - padX}
            y1={height - padY}
            y2={height - padY}
            stroke="var(--palette-accent-border)"
          />
          <line
            x1={padX}
            x2={padX}
            y1={padY}
            y2={height - padY}
            stroke="var(--palette-accent-border)"
            opacity="0.65"
          />
          <polygon points={area} fill="url(#score-area)" />
          <polyline
            points={line}
            fill="none"
            stroke="var(--palette-accent)"
            strokeWidth="3"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          {points.map((point, index) => (
            <g key={bins[index].label}>
              <circle cx={point.x} cy={point.y} r="4" fill="var(--palette-accent)" />
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
                className="text-[10px] font-semibold"
                fill="var(--palette-accent-strong)"
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
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/78 backdrop-blur-xl">
      <div className="flex w-full items-center justify-between gap-3 px-4 py-2.5 sm:px-5 lg:px-7">
        <div className="flex items-center gap-3">
          <Image
            src="/gurunet.svg"
            alt="GURUnet"
            width={36}
            height={36}
            className="size-9 rounded"
            priority
          />
          <div>
            <h2 className="text-base font-semibold text-stone-950">GURUnet</h2>
            <p className="hidden text-[11px] text-stone-500 sm:block">Daily capacity practice</p>
          </div>
        </div>
        {user && (
          <div className="flex min-w-0 items-center gap-3">
            <nav className="hidden items-center border-r border-slate-200 pr-3 text-sm font-medium text-slate-600 lg:flex">
              <button type="button" onClick={() => scrollToSection("daily-challenge")} className="nav-link">
                Today
              </button>
              <button type="button" onClick={() => scrollToSection("metrics")} className="nav-link">
                Metrics
              </button>
              <button type="button" onClick={() => scrollToSection("learning")} className="nav-link">
                Notebook
              </button>
              <button type="button" onClick={() => scrollToSection("social")} className="nav-link">
                Network
              </button>
            </nav>
            <div className="hidden items-center gap-0.5 sm:flex">
              <HeaderIconButton label="Open command palette" onClick={onCommand}>
                <Command size={15} />
              </HeaderIconButton>
              <HeaderIconButton label="Export learning record" onClick={onExport}>
                <Download size={15} />
              </HeaderIconButton>
              <HeaderIconButton
                label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                onClick={onThemeToggle}
              >
                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              </HeaderIconButton>
              <HeaderIconButton label="Logout" onClick={onLogout}>
                <LogOut size={16} />
              </HeaderIconButton>
            </div>
            <button
              onClick={onAccount}
              className="group flex h-10 shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-1 text-slate-900 transition-colors hover:border-slate-300 hover:bg-slate-50 sm:pr-3"
              aria-label="Account settings"
              type="button"
            >
              <span className="grid size-8 place-items-center rounded-full bg-slate-950 text-xs font-semibold uppercase text-white shadow-sm">
                {user.name?.trim()?.[0] ?? <UserRound size={15} />}
              </span>
              <span className="hidden max-w-32 truncate text-sm font-medium sm:inline">
                {user.name}
              </span>
            </button>
          </div>
        )}
      </div>
      {user && (
        <nav className="flex w-full gap-1 overflow-x-auto border-t border-slate-100 px-4 py-1.5 text-xs font-semibold text-slate-600 sm:px-5 lg:hidden">
          {[
            ["Today", "daily-challenge"],
            ["Metrics", "metrics"],
            ["Notebook", "learning"],
            ["Network", "social"],
          ].map(([label, id]) => (
            <button
              key={id}
              type="button"
              onClick={() => scrollToSection(id)}
              className="rounded px-3 py-1.5 transition-colors hover:bg-slate-100 hover:text-slate-950"
            >
              {label}
            </button>
          ))}
        </nav>
      )}
    </header>
  );
}

function HeaderIconButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="grid size-8 place-items-center rounded-full text-slate-600 transition hover:bg-slate-100 hover:text-slate-950"
      aria-label={label}
      type="button"
    >
      {children}
    </button>
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
              <line x1={padX} x2={width - padX} y1={y} y2={y} stroke="var(--palette-accent-border)" opacity="0.55" />
              <text x={8} y={y + 4} className="fill-slate-500 text-[10px]">
                {tick}
              </text>
            </g>
          );
        })}
        <polyline
          points={line}
          fill="none"
          stroke="var(--palette-accent)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="4"
        />
        {points.map((point, index) => (
          <g key={`${point.label}-${index}`}>
            <circle cx={point.x} cy={point.y} r={index === points.length - 1 ? 5 : 3.5} fill="var(--palette-accent)" />
            {(index === 0 || index === points.length - 1 || index % 4 === 0) && (
              <text x={point.x} y={height - 6} textAnchor="middle" className="fill-slate-500 text-[10px]">
                {point.label}
              </text>
            )}
          </g>
        ))}
        <text x={last.x} y={Math.max(14, last.y - 12)} textAnchor="middle" className="text-[12px] font-semibold" fill="var(--palette-accent-strong)">
          {last.value.toFixed(1)}
        </text>
      </svg>
    </div>
  );
}

function ChallengeAccordions({ challenge }: { challenge: Challenge }) {
  return (
    <div className="grid gap-3 py-5">
      <div className="grid gap-3 border-y border-slate-200/80 py-3 lg:grid-cols-3">
        <ChallengeScanCard
          icon={<ShieldCheck size={16} />}
          tone="red"
          title="Do not break"
          items={challenge.constraints}
        />
        <ChallengeScanCard
          icon={<Code2 size={16} />}
          tone="cyan"
          title="Allowed tools"
          items={challenge.allowedTools}
        />
        <ChallengeScanCard
          icon={<CheckCircle2 size={16} />}
          tone="slate"
          title="Submit these"
          items={challenge.submissionRequirements}
        />
      </div>

      <details className="group rounded-md border border-slate-200 bg-white/55">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold text-slate-900 marker:hidden">
          Full answer format, rubric, and anti-generic check
          <ChevronRight
            size={16}
            className="text-cyan-700 transition-transform group-open:rotate-90"
          />
        </summary>
        <div className="grid gap-3 border-t border-slate-200 p-4">
          <div className="rounded-md bg-white/70 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
              Expected answer
            </p>
            <PacketText compact text={challenge.expectedAnswerFormat} />
          </div>
          <ChallengeRubricLens challenge={challenge} compact />
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-amber-800">
              Anti-generic check
            </p>
            <p className="mt-1 text-sm leading-6 text-amber-900">
              {challenge.antiGenericRequirement}
            </p>
          </div>
        </div>
      </details>
    </div>
  );
}

function ChallengeScanCard({
  icon,
  items,
  title,
  tone,
}: {
  icon: ReactNode;
  items: string[];
  title: string;
  tone: "cyan" | "red" | "slate";
}) {
  const colors =
    tone === "red"
      ? "text-red-900"
      : tone === "cyan"
        ? "text-cyan-950"
        : "text-slate-800";
  const iconColors =
    tone === "red"
      ? "bg-red-100 text-red-800"
      : tone === "cyan"
        ? "bg-cyan-100 text-cyan-800"
        : "bg-slate-100 text-slate-700";

  return (
    <section className={`min-w-0 ${colors}`}>
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`grid size-8 place-items-center rounded-full ${iconColors}`}>{icon}</span>
          <h3 className="text-sm font-semibold">{title}</h3>
        </div>
        <span className="rounded-full border border-slate-200 bg-white/55 px-2 py-0.5 font-mono text-[11px] font-semibold">
          {items.length}
        </span>
      </div>
      <div className="grid gap-2">
        {items.slice(0, 4).map((item) => (
          <div key={item} className="flex gap-2 text-sm leading-5">
            <CheckCircle2 size={14} className="mt-0.5 shrink-0 opacity-75" />
            <span>{item}</span>
          </div>
        ))}
        {items.length > 4 && (
          <p className="text-xs font-semibold opacity-70">+{items.length - 4} more in full details</p>
        )}
      </div>
    </section>
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
  challenge,
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
  challenge: Challenge;
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
  const containerClass = "border-y border-slate-200 py-4";
  return (
    <div className={containerClass}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <LockKeyhole size={16} className="text-cyan-700" />
          {submission ? "Marked submission" : "Submission"}
        </div>
        {!submission && hasDraft && (
          <span className="rounded-md bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-800">
            Draft saved
          </span>
        )}
      </div>

      {submission ? (
        <SubmittedPanel
          challenge={challenge}
          submission={submission}
          grade={grade}
          verification={verification}
          setVerification={setVerification}
          onVerify={onVerify}
          onGrade={onGrade}
          busy={busy}
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onOpen}
            className="interactive-lift flex h-10 items-center justify-center gap-2 rounded-md bg-cyan-700 px-4 text-sm font-semibold text-white shadow-sm shadow-cyan-900/15"
          >
            <FileText size={16} />
            {hasDraft ? "Continue response" : "Respond"}
          </button>
          <button
            type="button"
            onClick={onFocus}
            className="interactive-lift flex h-10 items-center justify-center gap-2 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700"
          >
            <ShieldCheck size={16} />
            Focus mode
          </button>
          <button
            type="button"
            onClick={onSample}
            className="interactive-lift flex h-10 items-center justify-center rounded-md px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100"
          >
            Load response outline
          </button>
          <button
            type="button"
            onClick={onExaminer}
            className="interactive-lift flex h-10 items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-cyan-800 hover:bg-cyan-50"
          >
            <ShieldCheck size={15} />
            Ask examiner
          </button>
          {draftSavedAt && (
            <p className="ml-auto text-xs text-slate-500">
              Autosaved {new Intl.DateTimeFormat("en-ZA", {
                hour: "2-digit",
                minute: "2-digit",
              }).format(new Date(draftSavedAt))}
            </p>
          )}
        </div>
      )}
      {!submission && notice && (
        <p className="mt-3 border-l-2 border-cyan-700 px-3 text-sm leading-6 text-slate-600">
          {notice.reply}
        </p>
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

  return wrap(
      <div className="grid gap-5">
        <div className="border-l-2 border-cyan-700 pl-4">
          <p className="text-xs font-semibold text-cyan-800">
            Worked solution
          </p>
          <p className="mt-2 text-sm leading-6 text-cyan-950">{challenge.solution}</p>
        </div>
        <p className="border-t border-slate-200 pt-4 text-sm font-semibold leading-6 text-cyan-900">
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
          <DialogTitle>Challenge details</DialogTitle>
        </DialogHeader>

        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
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

          <aside className="grid h-fit content-start gap-3 self-start">
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

function ExaminerChatModal({
  activeChallengeId,
  busy,
  loading,
  messages,
  notice,
  open,
  selectedSessionId,
  sessions,
  onOpenChange,
  onSelectSession,
  onSend,
}: {
  activeChallengeId: string;
  busy: boolean;
  loading: boolean;
  messages: ExaminerMessage[];
  notice: ChallengeNotice | null;
  open: boolean;
  selectedSessionId: string;
  sessions: ExaminerSession[];
  onOpenChange: (open: boolean) => void;
  onSelectSession: (challengeId: string) => void;
  onSend: (message: string) => void;
}) {
  const [message, setMessage] = useState("");
  const transcriptRef = useRef<HTMLDivElement | null>(null);
  const archived = Boolean(selectedSessionId && selectedSessionId !== activeChallengeId);
  const selectedSession = sessions.find((session) => session.id === selectedSessionId);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const transcript = transcriptRef.current;
      if (!transcript) return;
      const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      transcript.scrollTo({
        top: transcript.scrollHeight,
        behavior: reduceMotion ? "auto" : "smooth",
      });
    });
    return () => cancelAnimationFrame(frame);
  }, [loading, messages.length, open, selectedSessionId]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!message.trim() || busy || loading) return;
    onSend(message.trim());
    setMessage("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-0 right-0 bottom-0 left-auto grid h-[100dvh] w-full max-w-none translate-x-0 translate-y-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] gap-0 overflow-hidden rounded-none p-0 sm:w-[min(42rem,100vw)] sm:max-w-[42rem] sm:rounded-l-xl">
        <DialogHeader className="border-b border-slate-200 px-4 py-4 pr-12 dark:border-slate-800 sm:px-5 sm:pr-12">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-cyan-50 text-cyan-800 dark:bg-slate-800 dark:text-cyan-300">
              <ShieldCheck size={18} />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-base text-slate-950 dark:text-slate-50">Examiner</DialogTitle>
              <p className="mt-1 truncate text-xs text-slate-500 dark:text-slate-400">
                Challenge guidance, grading review, and profile adjustments
              </p>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-w-0 gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/75 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,17rem)] sm:items-center sm:px-5">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold ${archived ? "text-slate-500 dark:text-slate-400" : "text-cyan-800 dark:text-cyan-300"}`}>
                {archived ? "Archived session" : "Current session"}
              </span>
              <span className="text-xs text-slate-400 dark:text-slate-600" aria-hidden="true">/</span>
              <span className="text-xs text-slate-500 dark:text-slate-400">{selectedSession?.dateKey ?? "Today"}</span>
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
              {loading ? "Loading session..." : selectedSession?.title ?? "Today's challenge"}
            </p>
          </div>
          <label className="min-w-0">
            <span className="sr-only">Examiner session</span>
            <select
              value={selectedSessionId}
              onChange={(event) => onSelectSession(event.target.value)}
              disabled={loading || sessions.length === 0 || busy}
              className="h-10 w-full min-w-0 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/15 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
            >
              {loading ? (
                <option value={selectedSessionId}>Loading session...</option>
              ) : (
                <>
                  {sessions.length === 0 && <option value="">No sessions available</option>}
                  {sessions.map((session) => (
                    <option key={session.id} value={session.id}>
                      {session.active ? "Today" : session.dateKey}: {session.title}
                    </option>
                  ))}
                </>
              )}
            </select>
          </label>
        </div>

        <div
          ref={transcriptRef}
          className="min-h-0 overflow-y-auto overscroll-contain bg-white/55 px-4 py-5 dark:bg-slate-950/55 sm:px-5"
          aria-live="polite"
          aria-label="Examiner conversation"
        >
          <div className="mx-auto grid w-full max-w-2xl gap-5">
            {notice && !archived && (
              <div className="border-l-2 border-cyan-700 bg-cyan-50/70 px-3 py-2 text-sm leading-6 text-cyan-950 dark:bg-cyan-950/25 dark:text-cyan-100">
                <p className="text-xs font-semibold text-cyan-800 dark:text-cyan-300">Active adjustment</p>
                <p className="mt-1">{notice.reply}</p>
              </div>
            )}

            {loading ? (
              <div className="grid gap-4 py-2" aria-label="Loading examiner session">
                <div className="h-16 w-3/4 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
                <div className="ml-auto h-12 w-2/3 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
                <div className="h-24 w-5/6 animate-pulse rounded-md bg-slate-100 dark:bg-slate-800" />
              </div>
            ) : messages.length === 0 ? (
              <div className="grid min-h-64 place-items-center px-4 text-center">
                <div className="max-w-sm">
                  <span className="mx-auto grid size-11 place-items-center rounded-full border border-slate-200 bg-white text-cyan-800 dark:border-slate-700 dark:bg-slate-900 dark:text-cyan-300">
                    <ShieldCheck size={20} />
                  </span>
                  <p className="mt-4 font-semibold text-slate-900 dark:text-slate-100">Start with the challenge in front of you</p>
                  <p className="mt-2 text-sm leading-6 text-slate-600 dark:text-slate-300">
                    Ask for clarification, challenge a grading decision with evidence, explain a delay, or adjust future assessments.
                  </p>
                </div>
              </div>
            ) : (
              <ol className="grid gap-5">
                {messages.map((item) =>
                  item.role === "user" ? (
                    <li key={item.id} className="flex justify-end">
                      <div className="max-w-[88%] rounded-md bg-cyan-700 px-3.5 py-2.5 text-sm leading-6 text-white shadow-sm">
                        <p className="whitespace-pre-wrap">{item.content}</p>
                      </div>
                    </li>
                  ) : (
                    <li key={item.id} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3">
                      <span className="mt-0.5 grid size-8 place-items-center rounded-full border border-slate-200 bg-white text-cyan-800 dark:border-slate-700 dark:bg-slate-900 dark:text-cyan-300">
                        <ShieldCheck size={15} />
                      </span>
                      <article className="min-w-0">
                        <p className="mb-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">Examiner</p>
                        <div className="rounded-md border border-slate-200 bg-white/85 px-3.5 py-3 text-sm leading-6 text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
                          <RichSubmissionBody body={item.content} />
                        </div>
                        {item.actions && item.actions.length > 0 && (
                          <div className="mt-2 grid gap-1.5">
                            {item.actions.map((action, index) => {
                              const rejected = /rejected|unavailable|needs_evidence|limit/.test(action.type);
                              return (
                                <div key={`${action.type}-${index}`} className={`flex items-start gap-2 text-xs leading-5 ${rejected ? "text-amber-800 dark:text-amber-300" : "text-cyan-800 dark:text-cyan-300"}`}>
                                  <CheckCircle2 className="mt-0.5 shrink-0" size={14} />
                                  <span>{action.summary}</span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </article>
                    </li>
                  ),
                )}
                {busy && messages.at(-1)?.role === "user" && (
                  <li className="grid grid-cols-[auto_minmax(0,1fr)] gap-3" aria-label="Examiner is responding">
                    <span className="grid size-8 place-items-center rounded-full border border-slate-200 bg-white text-cyan-800 dark:border-slate-700 dark:bg-slate-900 dark:text-cyan-300">
                      <Loader2 className="animate-spin" size={15} />
                    </span>
                    <div className="flex h-9 items-center text-sm text-slate-500 dark:text-slate-400">Reviewing your message...</div>
                  </li>
                )}
              </ol>
            )}
          </div>
        </div>

        {archived ? (
          <div className="flex flex-col gap-3 border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <p className="text-sm text-slate-600 dark:text-slate-300">This session is read-only and remains attached to its original challenge.</p>
              <button
                type="button"
                onClick={() => onSelectSession(activeChallengeId)}
                className="h-10 shrink-0 rounded-md border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-cyan-700/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
              >
                Return to today
              </button>
          </div>
        ) : (
            <form onSubmit={submit} className="border-t border-slate-200 bg-white px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:border-slate-800 dark:bg-slate-950 sm:px-5">
              <div className="rounded-md border border-slate-300 bg-white shadow-sm transition-colors focus-within:border-cyan-700 focus-within:ring-2 focus-within:ring-cyan-700/15 dark:border-slate-700 dark:bg-slate-900">
                <label htmlFor="examiner-message" className="sr-only">Message the examiner</label>
              <textarea
                id="examiner-message"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }}
                rows={3}
                className="block max-h-36 min-h-20 w-full resize-none bg-transparent px-3 py-2.5 text-sm leading-6 text-slate-900 outline-none placeholder:text-slate-500 dark:text-slate-100 dark:placeholder:text-slate-400"
                placeholder="Ask about this challenge or request a grading review..."
              />
              <div className="flex items-center justify-between gap-3 border-t border-slate-200 px-2 py-2 dark:border-slate-700">
                <p className="truncate px-1 text-xs text-slate-500 dark:text-slate-400">
                  {selectedSession?.title ?? "Today's challenge"}
                </p>
                <button
                disabled={busy || loading || !message.trim()}
                  className="flex h-9 shrink-0 items-center justify-center gap-2 rounded-md bg-cyan-700 px-3.5 text-sm font-semibold text-white transition-colors hover:bg-cyan-800 focus-visible:ring-2 focus-visible:ring-cyan-700/30 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="animate-spin" size={16} /> : <ChevronRight size={16} />}
                  Send
                </button>
              </div>
              </div>
            </form>
        )}
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
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-6xl">
        <DialogHeader>
          <DialogTitle>Challenge response</DialogTitle>
        </DialogHeader>

        <div className="grid min-h-0 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
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

          <div className="grid h-fit min-h-0 content-start gap-3 self-start">
            <ChallengeEditorReference challenge={challenge} />
            <ResponseReadinessPanel readiness={readiness} />
            <details className="group rounded-md border border-slate-200 bg-white/70">
              <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between gap-2 px-3 text-xs font-semibold uppercase tracking-[0.12em] text-slate-600 marker:hidden">
                Preview
                <ChevronRight size={14} className="transition-transform group-open:rotate-90" />
              </summary>
              <div className="max-h-[16rem] overflow-auto border-t border-slate-200 p-3">
                <RichSubmissionBody body={body || "Draft preview appears here."} />
              </div>
            </details>
            {attachments.length > 0 && (
              <AttachmentList
                attachments={attachments}
                onRemove={onRemoveAttachment}
              />
            )}
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
              Close draft
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
  const taskContract = `${challenge.objective}\n${challenge.expectedAnswerFormat}\n${challenge.submissionRequirements.join("\n")}`;
  const interaction = /\b(code|script|function|pseudocode|test cases?|implementation)\b/i.test(taskContract)
    ? "code"
    : /\b(exact commands?|command sequence|configuration|cli|shell commands?)\b/i.test(taskContract)
      ? "commands"
      : /\b(oral|spoken defense|defend verbally)\b/i.test(taskContract)
        ? "oral"
        : "written";
  const minWords = interaction === "code"
      ? 70
      : interaction === "oral"
        ? 75
        : 80;
  const requiresRisk = /\b(risk|rollback|backout|blast radius|stop condition|reversal|safety|operational impact)\b/i.test(taskContract);
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
    lines.filter((line) => /\b(error|log|trace|output|config|screenshot|packet|metric|status|diff|json|csv|pcap|claim|requirement|option|calculation|timeline|test case|expected|actual|counterexample)\b/i.test(line)).length;
  const reasoningConnectors = (lower.match(/\b(because|therefore|so that|which means|this implies|however|given that|assumption|trade[- ]off)\b/g) ?? []).length;
  const validationSignals = (lower.match(/\b(verify|validate|confirm|test|check|measure|compare|disprove|reproduce|baseline|control)\b/g) ?? []).length;
  const riskSignals = (lower.match(/\b(risk|rollback|blast radius|contain|avoid|do not|impact|fallback|backout|safe|change window)\b/g) ?? []).length;
  const actionSignals = (lower.match(/\b(recommend|fix|change|next step|plan|correct|mitigate|resolve|document|monitor)\b/g) ?? []).length;
  const counterSignals = (lower.match(/\b(cannot prove|does not prove|disprove|counterexample|alternative|exception|limitation|unless|confidence|uncertain)\b/g) ?? []).length;
  const requiredWorkProduct = interaction === "code"
    ? codeBlocks > 0 || /\b(function|script|pseudocode|test case|expected output)\b/i.test(text)
    : interaction === "commands"
      ? commandLikeLines >= 2 || codeBlocks > 0
      : interaction === "oral"
        ? words.length >= minWords && reasoningConnectors >= 1
        : actionSignals >= 1 || reasoningConnectors >= 2;
  const hasConclusion = actionSignals >= 1 ||
    (interaction === "oral" && /\b(position|conclude|maintain|recommend)\b/i.test(text)) ||
    (/\btrue\s*\/\s*false|true or false|claim defense\b/i.test(taskContract) && /\b(true|false|conditionally true|verdict)\b/i.test(text));
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
      complete: words.length >= minWords || attachments.length > 0,
      guidance: "Add enough explanation for the examiner to follow your reasoning, not just the final answer.",
    },
    {
      label: "Organized response",
      complete: headings >= 2 || listItems >= 4 || text.includes("##"),
      guidance: `Use the expected format as scaffolding: ${challenge.expectedAnswerFormat}`,
    },
    {
      label: "Required work product",
      complete: requiredWorkProduct,
      guidance: interaction === "code"
        ? "Provide the implementation or precise pseudocode and the tests that establish its behavior."
        : interaction === "commands"
          ? "Provide an ordered command sequence and the observations expected from it."
          : `Complete the actual task stated in the objective: ${challenge.objective}`,
    },
    {
      label: "Evidence or justification",
      complete: artifactSignals >= 2 || reasoningConnectors >= 2,
      guidance: "Tie the supplied artifacts, claims, measurements, code, or constraints directly to your conclusion.",
    },
    {
      label: "Reasoning chain",
      complete: reasoningConnectors >= 2 || /\b(root cause|hypothesis|likely|unlikely|suspect)\b/i.test(text),
      guidance: "Show why the evidence supports your conclusion and state any assumptions.",
    },
    {
      label: "Validation and limits",
      complete: validationSignals >= 1 && (counterSignals >= 1 || validationSignals >= 2),
      guidance: "State how the work is tested and what the available evidence cannot establish.",
    },
    ...(requiresRisk
      ? [{
          label: "Risk and rollback",
          complete: riskSignals >= 1,
          guidance: "Mention what could go wrong, blast radius, and how you would back out safely.",
        }]
      : [{
          label: "Counterpoint or boundary",
          complete: counterSignals >= 1,
          guidance: "Name an exception, counterargument, uncertainty, or boundary that qualifies your answer.",
        }]),
    {
      label: "Actionable conclusion",
      complete: hasConclusion,
      guidance: "Finish with the verdict, position, recommendation, next step, or decision this task asks for.",
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

function ChallengeEditorReference({ challenge }: { challenge: Challenge }) {
  return (
    <aside className="rounded-md border border-slate-200 bg-white/70 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Prompt reference
          </p>
          <h3 className="mt-1 text-sm font-semibold leading-6 text-slate-950">
            {challenge.title}
          </h3>
        </div>
        <span className="rounded-full bg-cyan-50 px-2 py-1 text-xs font-semibold text-cyan-800">
          {challenge.difficulty}
        </span>
      </div>
      <p className="mt-2 text-sm leading-5 text-slate-600">{challenge.objective}</p>
      <div className="mt-3 grid grid-cols-3 divide-x divide-slate-200 rounded-md border border-slate-200 bg-slate-50/70">
        <CompactSignal icon={<ShieldCheck size={14} />} label="Constraints" value={challenge.constraints.length} />
        <CompactSignal icon={<Code2 size={14} />} label="Tools" value={challenge.allowedTools.length} />
        <CompactSignal icon={<CheckCircle2 size={14} />} label="Required" value={challenge.submissionRequirements.length} />
      </div>
      <details className="mt-3 rounded-md border border-slate-200 bg-slate-50">
        <summary className="cursor-pointer list-none px-3 py-2 text-xs font-semibold text-slate-700 marker:hidden">
          View essentials
        </summary>
        <div className="grid gap-3 border-t border-slate-200 p-3">
          <MiniChecklist title="Do not" items={challenge.constraints.slice(0, 4)} />
          <MiniChecklist title="Submit" items={challenge.submissionRequirements.slice(0, 4)} />
        </div>
      </details>
    </aside>
  );
}

function CompactSignal({
  icon,
  label,
  value,
}: {
  icon: ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="grid min-w-0 place-items-center gap-1 px-1.5 py-2 text-center">
      <span className="text-cyan-700">{icon}</span>
      <span className="font-mono text-xs font-semibold text-slate-900">{value}</span>
      <span className="max-w-full truncate text-[10px] text-slate-500">{label}</span>
    </div>
  );
}

function MiniChecklist({ items, title }: { items: string[]; title: string }) {
  return (
    <div>
      <p className="mb-1 text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">{title}</p>
      <div className="grid gap-1">
        {items.map((item) => (
          <p key={item} className="flex gap-2 text-xs leading-5 text-slate-600">
            <CheckCircle2 size={12} className="mt-1 shrink-0 text-cyan-700" />
            <span>{item}</span>
          </p>
        ))}
      </div>
    </div>
  );
}

function ResponseReadinessPanel({
  readiness,
}: {
  readiness: ReturnType<typeof responseReadiness>;
}) {
  const completed = readiness.checks.filter((check) => check.complete).length;
  const tone =
    readiness.score >= 80
      ? "text-cyan-800"
      : readiness.score >= 50
        ? "text-amber-800"
        : "text-slate-600";

  return (
    <div className="rounded-md border border-slate-200 bg-white/70 p-3">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Submit readiness
          </p>
          <p className={`text-xl font-semibold ${tone}`}>{readiness.score}%</p>
        </div>
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600">
          {completed}/{readiness.checks.length}
        </span>
      </div>
      <div className="mt-2 h-1 rounded-full bg-slate-200">
        <div
          className="h-full rounded-full bg-cyan-700"
          style={{ width: `${readiness.score}%` }}
        />
      </div>
      <p className="mt-2 text-xs leading-5 text-slate-600">{readiness.next}</p>
      <p className="mt-1 text-[10px] leading-4 text-slate-500">Guidance only, not a score prediction.</p>
      <details className="group mt-2 border-t border-slate-200 pt-2">
        <summary className="flex cursor-pointer list-none items-center justify-between text-xs font-semibold text-slate-600 marker:hidden">
          Review readiness checks
          <ChevronRight size={14} className="transition-transform group-open:rotate-90" />
        </summary>
        <div className="mt-2 grid gap-2">
          {readiness.checks.map((check) => (
            <div key={check.label} className="flex items-start gap-2 text-xs text-slate-600">
              <CheckCircle2
                size={14}
                className={`mt-0.5 shrink-0 ${check.complete ? "text-cyan-700" : "text-slate-300"}`}
              />
              <span>{check.label}</span>
            </div>
          ))}
        </div>
      </details>
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
  challenge,
  submission,
  grade,
  verification,
  setVerification,
  onVerify,
  onGrade,
  busy,
}: {
  challenge: Challenge;
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
      {grade ? (
        <div className="grid gap-5">
          <GradeScoreStrip grade={grade} />
          <TeacherMarkedResponse challenge={challenge} grade={grade} submission={submission} />
        </div>
      ) : (
        <SubmissionViewer content={submission.content} />
      )}
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
    <div className="grid gap-3 text-sm leading-6 text-slate-600">
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
        <h4 key={`heading-${index}`} className="font-semibold text-slate-950 dark:text-slate-50">
          {line.replace(/^\s{0,3}#{1,4}\s+/, "")}
        </h4>,
      );
    } else if (/^\s*(-|\*)\s+\S/.test(line)) {
      nodes.push(
        <div key={`bullet-${index}`} className="flex gap-2">
          <span className="text-cyan-700 dark:text-cyan-300">-</span>
          <span>{line.replace(/^\s*(-|\*)\s+/, "")}</span>
        </div>,
      );
    } else if (/^\s*\d+\.\s+\S/.test(line)) {
      nodes.push(
        <div key={`number-${index}`} className="flex gap-2">
          <span className="font-semibold text-cyan-800 dark:text-cyan-300">
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

function GradeSummary({
  grade,
  plain = false,
  showStrip = true,
}: {
  grade: Grade;
  plain?: boolean;
  showStrip?: boolean;
}) {
  const content = (
      <div className="grid gap-4">
        {showStrip && <GradeScoreStrip grade={grade} />}

        {grade.recoveryOutcome && (
          <div className="flex items-start gap-3 border-l-2 border-cyan-700 py-1 pl-3 text-sm leading-6 text-slate-700">
            <CheckCircle2 className="mt-0.5 shrink-0 text-cyan-700" size={17} />
            <p>
              <strong className="text-slate-950">Reinforcement {grade.recoveryOutcome.status.replace(/([A-Z])/g, " $1").trim().toLowerCase()}:</strong>{" "}
              {grade.recoveryOutcome.target}. {grade.recoveryOutcome.evidence}
              {grade.recoveryOutcome.ertBonus > 0 ? ` +${grade.recoveryOutcome.ertBonus} ERT.` : ""}
            </p>
          </div>
        )}

        <ScoreMathPanel grade={grade} />
        <p className="rounded-md bg-cyan-50 px-3 py-2 text-sm font-semibold leading-6 text-cyan-900">
          Next target: {grade.nextImprovementTarget}
        </p>
      </div>
  );
  return plain ? content : <Panel icon={<Medal size={19} />} title="Daily scoresheet">{content}</Panel>;
}

function GradeScoreStrip({ grade }: { grade: Grade }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white/72 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`inline-flex max-w-full items-center rounded-full px-3 py-1 text-xs font-semibold ${
            grade.verdict === "Passed"
              ? "bg-cyan-50 text-cyan-900"
              : grade.verdict === "Partially passed"
                ? "bg-amber-50 text-amber-900"
                : "bg-red-50 text-red-900"
          }`}
        >
          {grade.verdict}
        </span>
        <ScorePill label="Raw" value={`${grade.rawScore}/20`} />
        <ScorePill label="Final" value={`${grade.finalScore}/20`} emphasis />
        <ScorePill label="ERT" value={`+${grade.ertEarned}`} />
        <ScorePill label="PIS" value={`${formatSigned(grade.pisChange)}`} />
      </div>
    </div>
  );
}

function ScorePill({
  emphasis = false,
  label,
  value,
}: {
  emphasis?: boolean;
  label: string;
  value: string;
}) {
  return (
    <span
      className={`inline-flex items-baseline gap-1 rounded-full border px-3 py-1 text-xs ${
        emphasis
          ? "border-slate-950 bg-slate-950 text-white"
          : "border-slate-200 bg-white text-slate-700"
      }`}
    >
      <span className={emphasis ? "text-white/70" : "text-slate-500"}>{label}</span>
      <strong className="font-semibold">{value}</strong>
    </span>
  );
}

function AxisPerformancePrism({ grade }: { grade: Grade }) {
  const axes = gradeAxisRows(grade);
  const total = axes.reduce((sum, axis) => sum + axis.score, 0);
  const polygon = axes.map((axis, index) => prismPoint(index, axes.length, axis.score / 7)).join(" ");
  const shadow = axes
    .map((axis, index) => prismPoint(index, axes.length, Math.max(0.03, axis.score / 7), 8, 10))
    .join(" ");

  return (
    <div className="grid gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Performance prism
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Five-axis grading surface. Each spoke is scored out of 7.
          </p>
        </div>
        <span className="rounded-full bg-slate-950 px-3 py-1 font-mono text-xs font-semibold text-white">
          {total}/35
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-[minmax(11rem,0.58fr)_minmax(0,1fr)]">
        <svg
          viewBox="0 0 260 260"
          role="img"
          aria-label="Multi-axis score radar chart"
          className="mx-auto aspect-square w-full max-w-[15rem]"
        >
          {[0.25, 0.5, 0.75, 1].map((scale) => (
            <polygon
              key={scale}
              points={axes.map((_, index) => prismPoint(index, axes.length, scale)).join(" ")}
              fill="none"
              stroke={scale === 1 ? "var(--palette-accent-border)" : "var(--palette-ring)"}
              opacity={scale === 1 ? 0.95 : 0.38}
              strokeWidth={scale === 1 ? 1.2 : 0.8}
            />
          ))}
          {axes.map((_, index) => {
            const [x, y] = prismPoint(index, axes.length, 1).split(",").map(Number);
            return (
              <line
                key={index}
                x1="130"
                y1="130"
                x2={x}
                y2={y}
                stroke="var(--palette-accent-border)"
                strokeWidth="0.8"
                opacity="0.7"
              />
            );
          })}
          <polygon points={shadow} fill="var(--palette-accent-strong)" opacity="0.08" />
          <polygon
            points={polygon}
            fill="var(--palette-accent)"
            opacity="0.24"
            stroke="var(--palette-accent)"
            strokeWidth="2.5"
          />
          {axes.map((axis, index) => {
            const [x, y] = prismPoint(index, axes.length, axis.score / 7).split(",").map(Number);
            return (
              <g key={axis.key}>
                <circle cx={x} cy={y} r="4.5" fill="var(--palette-accent-strong)" />
                <circle cx={x} cy={y} r="2" fill="#f8fafc" />
              </g>
            );
          })}
        </svg>

        <div className="grid content-center gap-2">
          {axes.map((axis) => (
            <div key={axis.key} className="grid gap-1 border-t border-slate-200 py-2 first:border-t-0">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold text-slate-950">{axis.label}</p>
                <span className="font-mono text-xs font-semibold text-cyan-800">{axis.score}/7</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-cyan-700"
                  style={{ width: `${(axis.score / 7) * 100}%` }}
                />
              </div>
              <p className="line-clamp-2 text-xs leading-5 text-slate-500">{axis.description}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScoreMathPanel({ grade }: { grade: Grade }) {
  const axes = gradeAxisRows(grade);
  const total = axes.reduce((sum, axis) => sum + axis.score, 0);
  const afterDeductions = Number((grade.rawScore - grade.balancePenalty - grade.latePenalty).toFixed(2));
  const cap = technicalCapLimit(grade.technicalCap);
  const capApplied = cap < afterDeductions;

  return (
    <div className="border-t border-slate-200 pt-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
        Score calculation
      </p>
      <div className="mt-3 grid gap-2 text-sm leading-6">
        <MathRow label="Axis total" value={`${total}/35`} />
        <MathRow label="Raw score" value={`(${total} / 35) × 20 = ${grade.rawScore}/20`} />
        <MathRow label="Balance penalty" value={`-${grade.balancePenalty}`} />
        <MathRow label="Late penalty" value={`-${grade.latePenalty}`} />
        <MathRow label="After penalties" value={`${afterDeductions}/20`} />
        <MathRow
          label="Competence cap"
          value={`${technicalCapLabel(grade.technicalCap)} (${cap}/20 max)${capApplied ? " applied" : ""}`}
        />
        <MathRow
          strong
          label="Final score"
          value={`min(${afterDeductions}, ${cap}) = ${grade.finalScore}/20`}
        />
      </div>
      <p className={`mt-3 border-l-2 px-3 py-1 text-xs leading-5 ${capApplied ? "border-amber-500 text-amber-800" : "border-slate-300 text-slate-600"}`}>
        {capApplied
          ? "The cap overrode the score after penalties because the answer was not defensible enough to receive the higher numeric score."
          : "No lower cap overrode the score after penalties."}{" "}
        ERT earned: <strong>{grade.ertEarned}</strong>.
      </p>
    </div>
  );
}

function MathRow({
  label,
  strong = false,
  value,
}: {
  label: string;
  strong?: boolean;
  value: string;
}) {
  return (
    <div className={`grid grid-cols-[7.25rem_1fr] gap-3 border-t border-slate-200 px-0 py-1.5 first:border-t-0 ${strong ? "text-slate-950" : "text-slate-700"}`}>
      <span className={strong ? "font-semibold text-slate-950" : "text-slate-500"}>{label}</span>
      <span className={`min-w-0 break-words font-mono text-xs ${strong ? "font-semibold text-slate-950" : "font-semibold"}`}>{value}</span>
    </div>
  );
}

function TeacherMarkedResponse({
  challenge,
  grade,
  submission,
}: {
  challenge: Challenge;
  grade: Grade;
  submission: Submission;
}) {
  const parsed = parseSubmissionContent(submission.content);
  const marks = markResponseSegments(parsed.body, grade);
  const missing = missingSubmissionRequirements(parsed.body, challenge);
  const holisticAssessment = holisticAssessmentFromCorrection(grade.correction);

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
            Teacher-marked response
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            The examiner interprets the complete argument first, then attaches corrective detail to individual sections.
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
          {marks.length} marked blocks
        </span>
      </div>

      <div className="border-l-2 border-cyan-700 px-3 py-1">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-cyan-800">Whole-response assessment</p>
        <div className="mt-2 text-sm leading-6 text-slate-700">
          <RichSubmissionBody body={holisticAssessment} />
        </div>
      </div>

      <details className="group border-t border-slate-200 pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-slate-700 marker:hidden">
          Corrective annotations
          <ChevronRight size={15} className="text-cyan-700 transition-transform group-open:rotate-90" />
        </summary>
        <div className="mt-3 grid max-h-[30rem] gap-2 overflow-auto pr-1">
          {marks.map((mark, index) => (
            <article
              key={`${mark.text}-${index}`}
              className={`rounded-md border-l-4 bg-white p-3 ${markStyle(mark.kind).border}`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${markStyle(mark.kind).pill}`}>
                  {markIcon(mark.kind)}
                  {mark.label}
                </span>
                <span className="text-xs text-slate-500">{mark.note}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-slate-700">{mark.text}</p>
            </article>
          ))}
        </div>

        {missing.length > 0 && (
          <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3">
            <p className="text-sm font-semibold text-red-950">Missing or weakly addressed requirements</p>
            <div className="mt-2 grid gap-1">
              {missing.slice(0, 5).map((item) => (
                <p key={item} className="text-sm leading-6 text-red-800">
                  - {item}
                </p>
              ))}
            </div>
          </div>
        )}
      </details>
    </div>
  );
}

function holisticAssessmentFromCorrection(correction: string) {
  const paragraphs = correction
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  const selected = paragraphs.slice(0, 2).join("\n\n");
  if (selected.length <= 1200) return selected;
  return `${selected.slice(0, 1197).trimEnd()}...`;
}

type MarkKind = "correct" | "evidence" | "vague" | "risk" | "action" | "neutral";

function markResponseSegments(body: string, grade: Grade) {
  const segments = body
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .flatMap((segment) => (segment.length > 520 ? segment.split(/\n(?=#+\s|\d+\.\s|- )/) : [segment]))
    .map((segment) => segment.trim())
    .filter(Boolean)
    .slice(0, 18);

  if (segments.length === 0) {
    return [
      {
        kind: "vague" as MarkKind,
        label: "No readable response",
        note: "The grader needs written reasoning or attached evidence explained in text.",
        text: "No response text was available to mark.",
      },
    ];
  }

  return segments.map((text) => {
    const lower = text.toLowerCase();
    const headingOnly = /^#{1,4}\s+\S[\s\S]{0,80}$/.test(text) && !/[.!?]\s*$/.test(text);
    const rawArtifact =
      /^(sw-|cpu utilization|pid\s+runtime|vlan\s+\d+|%sw_|show\s+|gi\d+\/\d+\/\d+|\d+\s+\d+|\S+#)/i.test(text.trim()) ||
      /\b(cpu utilization|macflap|flapping between|topology changes|cdp|lldp|dynamic gi)\b/i.test(lower);
    const hasEvidence = /\b(show|log|output|trace|because|therefore|screenshot|attached|config|metric|evidence|mac table|macflap|flapping|topology changes|cpu utilization|stp|cdp|lldp)\b/.test(lower);
    const hasRisk = /\b(risk|rollback|blast radius|impact|safe|backout|change window)\b/.test(lower);
    const hasAction = /\b(recommend|fix|correct|shut|shutdown|change|verify|validate|monitor|rollback|no shutdown|bpdu|storm control|root guard)\b/.test(lower);
    const hasCorrectDiagnosis = /\b(layer 2|l2|loop|broadcast storm|mac flapp?ing|stp|gi\s*1\/0\/22|gi1\/0\/22|unmanaged switch)\b/.test(lower);
    const hedged = /\b(maybe|probably|could be|seems|i think)\b/.test(lower);

    if (headingOnly) {
      return {
        kind: "neutral" as MarkKind,
        label: "Section",
        note: "This is structure, not something to penalize by itself.",
        text,
      };
    }
    if (hasCorrectDiagnosis && hasEvidence) {
      return {
        kind: "correct" as MarkKind,
        label: "Correct direction",
        note: "The diagnosis is aligned with the scenario; strengthen it with exact command sequence and verification.",
        text,
      };
    }
    if (rawArtifact || hasEvidence) {
      return {
        kind: "evidence" as MarkKind,
        label: rawArtifact ? "Evidence artifact" : "Evidence used",
        note: rawArtifact
          ? "Useful artifact. The next step is to state what it proves."
          : "This is gradable material; tie it directly to a decision.",
        text,
      };
    }
    if (hasRisk) {
      return {
        kind: "risk" as MarkKind,
        label: "Operational control",
        note: "Risk and rollback reasoning protects the final score.",
        text,
      };
    }
    if (hasAction && !hasEvidence) {
      return {
        kind: "action" as MarkKind,
        label: "Action needs detail",
        note: "Good operational intent. Add exact commands, order, and verification criteria.",
        text,
      };
    }
    if (hedged || grade.technicalCap !== "NONE") {
      return {
        kind: "vague" as MarkKind,
        label: "Vague or unsupported",
        note: "Rewrite this as a testable claim with a command, artifact, or explicit assumption.",
        text,
      };
    }
    return {
      kind: "neutral" as MarkKind,
      label: "Context",
      note: "Readable, but make sure it directly advances root cause, proof, action, or verification.",
      text,
    };
  });
}

function missingSubmissionRequirements(body: string, challenge: Challenge) {
  const lower = body.toLowerCase();
  return challenge.submissionRequirements.filter((requirement) => {
    const req = requirement.toLowerCase();
    if (/root cause/.test(req)) {
      return !/\b(root cause|hypothesis|layer 2|l2|loop|broadcast storm|mac flapp?ing|stp)\b/.test(lower);
    }
    if (/operational reasoning|tied to evidence/.test(req)) {
      return !/\b(because|evidence|show|log|cpu|mac|flapp?ing|topology|stp|cdp|lldp)\b/.test(lower);
    }
    if (/which interface|disable/.test(req)) {
      return !/\b(gi\s*1\/0\/22|gi1\/0\/22|1\/0\/22|shutdown|shut)\b/.test(lower);
    }
    if (/exact commands/.test(req)) {
      return !/\b(show\s+|configure terminal|interface\s+\S+|shutdown|no shutdown|show run interface|show interfaces|show spanning-tree)\b/.test(lower);
    }
    if (/verification steps/.test(req)) {
      return !/\b(verify|validate|monitor|check|show\s+|cpu|topology changes|mac flapp?ing|logging)\b/.test(lower);
    }
    if (/rollback/.test(req)) {
      return !/\b(rollback|backout|no shutdown|bring it back|restore|revert)\b/.test(lower);
    }
    if (/long-term prevention/.test(req)) {
      return !/\b(bpdu guard|root guard|storm control|loop guard|portfast|documentation|interface description|contractor|alerting|prevention)\b/.test(lower);
    }
    const keywords = requirement
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((word) => word.length > 5);
    return keywords.length > 0 && !keywords.some((word) => lower.includes(word));
  });
}

function markStyle(kind: MarkKind) {
  if (kind === "evidence") return { border: "border-l-cyan-700", pill: "bg-cyan-50 text-cyan-900" };
  if (kind === "risk") return { border: "border-l-slate-950", pill: "bg-slate-950 text-white" };
  if (kind === "action") return { border: "border-l-blue-600", pill: "bg-blue-50 text-blue-900" };
  if (kind === "vague") return { border: "border-l-amber-600", pill: "bg-amber-50 text-amber-900" };
  if (kind === "correct") return { border: "border-l-emerald-700", pill: "bg-emerald-50 text-emerald-900" };
  return { border: "border-l-slate-300", pill: "bg-slate-100 text-slate-700" };
}

function markIcon(kind: MarkKind) {
  if (kind === "evidence" || kind === "correct") return <CheckCircle2 size={12} />;
  if (kind === "risk") return <ShieldCheck size={12} />;
  if (kind === "action") return <Wrench size={12} />;
  if (kind === "vague") return <Pencil size={12} />;
  return <FileText size={12} />;
}

const gradeAxisKeys = ["creativity", "ingenuity", "reporting", "alienness", "neatness"] as const;

function gradeAxisRows(grade: Grade) {
  const rubric = grade.rubricSnapshot ?? fallbackRubric;
  return gradeAxisKeys.map((key) => ({
    key,
    label: rubric[key]?.label ?? fallbackRubric[key].label,
    description: rubric[key]?.description ?? fallbackRubric[key].description,
    score: grade[key],
  }));
}

function prismPoint(index: number, total: number, scale: number, offsetX = 0, offsetY = 0) {
  const center = 130;
  const radius = 92;
  const angle = (-90 + (360 / total) * index) * (Math.PI / 180);
  const x = center + offsetX + Math.cos(angle) * radius * scale;
  const y = center + offsetY + Math.sin(angle) * radius * scale;
  return `${Number(x.toFixed(2))},${Number(y.toFixed(2))}`;
}

function technicalCapLimit(cap: Grade["technicalCap"]) {
  if (cap === "UNSAFE") return 8;
  if (cap === "MOSTLY_WRONG") return 10;
  if (cap === "INCOMPLETE") return 14;
  return 20;
}

function technicalCapLabel(cap: Grade["technicalCap"]) {
  if (cap === "NONE") return "No cap";
  if (cap === "UNSAFE") return "Unsafe recommendation";
  if (cap === "MOSTLY_WRONG") return "Mostly unsupported";
  return "Incomplete answer";
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : `${value}`;
}

function shortDateKey(dateKey: string) {
  return new Intl.DateTimeFormat("en-ZA", { day: "numeric", month: "short", timeZone: "UTC" })
    .format(new Date(`${dateKey}T12:00:00.000Z`));
}

function DailyMomentumPanel({
  busy,
  grade,
  nextUnlock,
  onRedeem,
  retention,
  restDay,
  user,
}: {
  busy: boolean;
  grade: Grade | null;
  nextUnlock: string;
  onRedeem: (event: FormEvent<HTMLFormElement>) => void;
  retention: RetentionSnapshot;
  restDay: boolean;
  user: SafeUser;
}) {
  return (
    <section className={`daily-momentum rounded-md border border-slate-200 bg-white/70 p-4 ${grade ? "daily-momentum-complete" : ""}`}>
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-cyan-50 text-cyan-800">
          {restDay ? <Moon size={19} /> : grade ? <CheckCircle2 className="reward-confirm" size={19} /> : <CircleGauge size={19} />}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-950">
            {restDay ? "Rest day protected" : grade ? "Today is complete" : "Close today's loop"}
          </p>
          <p className="mt-1 text-sm leading-5 text-slate-600">
            {restDay
              ? "No assessment is due. Tomorrow returns with one main task and one shorter recovery task."
              : grade
              ? `${user.currentStreak}-day rhythm held. Your correction and next target are ready.`
              : "Submit, review the correction, and bank the lesson before the next brief."}
          </p>
        </div>
      </div>

      <div className="mt-4 border-t border-slate-200 pt-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Seven-day mastery</p>
            <p className="mt-1 text-sm text-slate-700">
              {retention.completedDays}/{retention.targetDays} learning days
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {shortDateKey(retention.cycle.startDate)}-{shortDateKey(retention.cycle.endDate)} · resets after {retention.cycle.restDayLabel}
            </p>
          </div>
          <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <ShieldCheck size={14} className="text-cyan-700" />
            {retention.continuityCredits} {retention.continuityCredits === 1 ? "credit" : "credits"}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1.5" aria-label="Current seven-day mastery arc">
          {retention.days.map((day) => (
            <MasteryDay key={day.date} day={day} />
          ))}
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
          <div
            className="h-full rounded-full bg-cyan-700 transition-[width] duration-500"
            style={{ width: `${Math.min(100, (retention.completedDays / retention.targetDays) * 100)}%` }}
          />
        </div>
        <div className="mt-2 flex items-start gap-2 text-xs leading-5 text-slate-600">
          <Target size={14} className="mt-0.5 shrink-0 text-cyan-700" />
          <p><span className="font-semibold text-slate-800">{retention.nextMilestone.title}.</span> {retention.nextMilestone.detail}</p>
        </div>
      </div>

      {retention.preview.available ? (
        <div className="mt-3 border-t border-slate-200 pt-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Next brief preview</p>
            <span className="text-xs text-slate-500">08:00 unlock</span>
          </div>
          <p className="mt-2 text-sm font-semibold text-slate-900">{retention.preview.focus}</p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {retention.preview.discipline} · {retention.preview.format}
            {retention.preview.durationMinutes > 0
              ? ` · ${retention.preview.durationMinutes} min · ${retention.preview.difficulty}`
              : ""}
          </p>
        </div>
      ) : (
        <dl className="mt-3 border-t border-slate-200 pt-3 text-sm">
          <div className="grid grid-cols-[5.5rem_1fr] gap-3">
            <dt className="text-slate-500">Next unlock</dt>
            <dd className="text-right font-medium text-slate-800">{nextUnlock}</dd>
          </div>
        </dl>
      )}

      <div className="mt-3 border-t border-slate-200 pt-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Weekly review</p>
          {retention.creditEarnedThisWeek && (
            <span className="text-xs font-semibold text-cyan-800">Credit earned</span>
          )}
        </div>
        {retention.weeklyReveal.unlocked ? (
          <div className="mt-2">
            <div className="grid grid-cols-3 gap-2 text-center">
              <RevealStat label="Average" value={retention.weeklyReveal.averageScore?.toFixed(1) ?? "--"} />
              <RevealStat label="Best" value={retention.weeklyReveal.bestScore?.toFixed(1) ?? "--"} />
              <RevealStat label="On time" value={String(retention.weeklyReveal.earlySubmissions)} />
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-600">{retention.weeklyReveal.message}</p>
          </div>
        ) : (
          <p className="mt-2 text-xs leading-5 text-slate-500">{retention.weeklyReveal.message}</p>
        )}
      </div>

      <details className="group mt-3 border-t border-slate-200 pt-3">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-2 text-sm font-semibold text-slate-700 marker:hidden">
          Plan an ERT reward
          <ChevronRight size={15} className="text-cyan-700 transition-transform group-open:rotate-90" />
        </summary>
        <div className="mt-3">
          <RewardPanel busy={busy} onRedeem={onRedeem} plain />
        </div>
      </details>
    </section>
  );
}

function MasteryDay({ day }: { day: RetentionSnapshot["days"][number] }) {
  const styles = {
    completed: "border-cyan-700 bg-cyan-700 text-white",
    protected: "border-cyan-700/25 bg-cyan-50 text-cyan-800",
    missed: "border-orange-300 bg-orange-50 text-orange-800",
    rest: "border-sky-200 bg-sky-50 text-sky-800",
    today: "border-slate-950 bg-white text-slate-950",
    open: "border-slate-200 bg-white/60 text-slate-400",
    upcoming: "border-slate-200 bg-slate-50 text-slate-400",
  }[day.state];
  const stateLabel = {
    completed: `completed${day.score !== null ? ` with ${day.score} out of 20` : ""}`,
    protected: "protected by a continuity credit",
    missed: "missed",
    rest: "scheduled rest day",
    today: "today",
    open: "flexible day",
    upcoming: "upcoming",
  }[day.state];
  return (
    <div
      className={`grid h-11 place-items-center rounded-md border text-[10px] font-semibold ${styles}`}
      title={`${day.date}: ${stateLabel}`}
      aria-label={`${day.date}: ${stateLabel}`}
    >
      <span>{day.label}</span>
      {day.state === "completed" ? (
        <CheckCircle2 size={12} />
      ) : day.state === "protected" ? (
        <ShieldCheck size={12} />
      ) : day.state === "rest" ? (
        <Moon size={12} />
      ) : (
        <span className="font-mono text-[9px]">{day.score ?? "·"}</span>
      )}
    </div>
  );
}

function RevealStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l border-slate-200 first:border-l-0">
      <p className="font-mono text-sm font-semibold text-slate-900">{value}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
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
        <div className="overflow-x-auto">
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
          <div className="rounded-md border border-cyan-700/15 bg-cyan-50 p-4">
            <p className="text-sm font-semibold text-slate-950">{activeDiscipline.label}</p>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Future challenges use this governed profile for topics, formats, evidence expectations,
              response sections, weak-pattern penalties, unsafe-pattern penalties, and rubric language.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {activeDiscipline.formats.slice(0, 4).map((format) => (
                <span key={format} className="rounded-md border border-cyan-700/15 bg-white/70 px-2 py-1 text-xs font-semibold text-cyan-800">
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
              Add targeted reinforcement to the next challenge
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
          <p className="text-xs leading-5 text-slate-500">
            This is a one-time request. The system chooses a recent unresolved gap, rotates the task style, records the outcome, and switches the request off after assignment.
          </p>
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
  onInviteSuggestion,
  onInvitationAction,
  onSaveSocialSettings,
  plain = false,
}: {
  social: SocialSnapshot;
  busy: boolean;
  onAddFriend: (event: FormEvent<HTMLFormElement>) => void;
  onEnroll: (challengeId: string) => void;
  onInviteSuggestion: (userId: string) => void;
  onInvitationAction: (id: string, action: "accept" | "decline" | "cancel" | "block") => void;
  onSaveSocialSettings: (settings: { discoverable: boolean; allowEmailInvites: boolean }) => void;
  plain?: boolean;
}) {
  const content = (
      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(17rem,0.55fr)]">
        <div className="grid gap-4">
          <div>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h3 className="font-semibold text-slate-950">Learner ranking</h3>
                <p className="mt-1 text-sm text-slate-500">Rank and identity only. Learning details unlock after connection.</p>
              </div>
              <span className="text-xs font-semibold text-slate-500">{social.leaderboard.length} visible</span>
            </div>
          <div className="max-h-[22rem] max-w-full overflow-auto overscroll-contain rounded-md border border-slate-200 bg-white/65 sm:max-h-[28rem]">
            <table className="w-full min-w-[31rem] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-white text-slate-500 shadow-sm">
                <tr>
                  {["Rank", "Learner", "Connection"].map((head) => (
                    <th key={head} className="px-3 py-3 font-semibold">
                      {head}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {social.leaderboard.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="px-3 py-8">
                      <EmptyState
                        title="No discoverable learners yet"
                        text="Your own rank appears here once the learning profile is ready."
                      />
                    </td>
                  </tr>
                ) : social.leaderboard.map((row) => (
                  <tr key={row.id} className="border-b border-slate-100 last:border-0">
                    <td className="w-24 px-3 py-3 font-mono font-semibold text-cyan-800">#{row.rank}</td>
                    <td className="px-3 py-3">
                      <p className="font-medium text-slate-900">
                        {row.name}
                        {row.isYou ? " (you)" : ""}
                      </p>
                    </td>
                    <td className="w-40 px-3 py-3 text-right">
                      {row.connectionState === "Available" ? (
                        <button
                          type="button"
                          onClick={() => onInviteSuggestion(row.id)}
                          disabled={busy}
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-cyan-700/20 bg-cyan-50 px-3 text-xs font-semibold text-cyan-800 disabled:opacity-60"
                        >
                          <UserPlus size={13} /> Connect
                        </button>
                      ) : row.connectionState === "Incoming" ? (
                        <button
                          type="button"
                          onClick={() => document.getElementById("connection-requests")?.scrollIntoView({ behavior: "smooth", block: "nearest" })}
                          className="h-8 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700"
                        >
                          Review request
                        </button>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
                          {row.connectionState === "Connected" && <CheckCircle2 size={13} className="text-emerald-600" />}
                          {row.connectionState === "Outgoing" ? "Requested" : row.connectionState}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

        <aside className="grid self-start gap-6 border-t border-slate-200 pt-4 xl:border-l xl:border-t-0 xl:pl-5 xl:pt-0">
          {social.invitations.length > 0 && (
            <section id="connection-requests">
              <h3 className="text-sm font-semibold text-slate-950">Connection requests</h3>
              <div className="mt-3 grid gap-3">
                {social.invitations.map((invitation) => (
                  <article key={invitation.id} className="border-t border-slate-200 pt-3 first:border-t-0 first:pt-0">
                    <p className="text-sm font-semibold text-slate-900">{invitation.profile.name}</p>
                    <p className="mt-0.5 text-xs text-slate-500">Profile details remain private until accepted.</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {invitation.direction === "Incoming" ? (
                        <>
                          <button type="button" onClick={() => onInvitationAction(invitation.id, "accept")} disabled={busy} className="h-8 rounded-md bg-cyan-700 px-3 text-xs font-semibold text-white disabled:opacity-60">Accept</button>
                          <button type="button" onClick={() => onInvitationAction(invitation.id, "decline")} disabled={busy} className="h-8 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-600 disabled:opacity-60">Decline</button>
                          <button type="button" onClick={() => onInvitationAction(invitation.id, "block")} disabled={busy} className="h-8 rounded-md px-2 text-xs font-semibold text-orange-700 disabled:opacity-60">Block</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => onInvitationAction(invitation.id, "cancel")} disabled={busy} className="h-8 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-600 disabled:opacity-60">Cancel request</button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold text-slate-950">Connections</h3>
            <div className="mt-3 grid max-h-56 gap-3 overflow-y-auto overscroll-contain pr-1">
              {social.friends.map((profile) => (
                <div key={profile.id} className="border-t border-slate-200 pt-3 first:border-t-0 first:pt-0">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{profile.name}</p>
                    <p className="truncate text-xs text-slate-500">{profile.preferredProfession} · {profile.primaryDiscipline}</p>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                    <span><strong className="font-semibold text-cyan-800">{profile.pisScore.toFixed(1)}</strong> PIS</span>
                    <span><strong className="font-semibold text-slate-800">{profile.currentStreak}</strong> streak</span>
                    <span><strong className="font-semibold text-slate-800">{profile.latestScore ?? "-"}</strong> latest</span>
                  </div>
                </div>
              ))}
              {social.friends.length === 0 && <p className="text-sm leading-6 text-slate-600">No accepted connections yet.</p>}
            </div>
          </section>

          <form onSubmit={onAddFriend} className="grid gap-3 border-t border-slate-200 pt-4">
            <label className="grid gap-1.5 text-sm font-medium text-slate-700">
              Invite by exact email
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
              Send request
            </button>
          </form>

          <details className="border-t border-slate-200 pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-800">Connection privacy</summary>
            <form
              className="mt-3 grid gap-3"
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                onSaveSocialSettings({
                  discoverable: form.get("discoverable") === "on",
                  allowEmailInvites: form.get("allowEmailInvites") === "on",
                });
              }}
            >
              <label className="flex items-start gap-2 text-sm leading-5 text-slate-600"><input name="discoverable" type="checkbox" defaultChecked={social.settings.discoverable} className="mt-1" /><span>Show only my name and rank to other learners so they can request a connection.</span></label>
              <label className="flex items-start gap-2 text-sm leading-5 text-slate-600"><input name="allowEmailInvites" type="checkbox" defaultChecked={social.settings.allowEmailInvites} className="mt-1" /><span>Allow invitations from people who know my exact email.</span></label>
              <button disabled={busy} className="h-9 rounded-md border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-60">Save privacy</button>
            </form>
          </details>
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
            <div key={entry.id} className="border-t border-slate-200 pt-3 first:border-t-0 first:pt-0">
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
