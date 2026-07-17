export type ChallengeStatus =
  | "Active"
  | "Submitted"
  | "Late"
  | "Missed"
  | "Excused"
  | "Protected"
  | "RestDay"
  | "Recovery Challenge"
  | "Pressure Challenge";

export type Difficulty =
  | "Guided"
  | "Normal"
  | "Advanced"
  | "Production"
  | "Expert";

export type TechnicalCap = "NONE" | "MOSTLY_WRONG" | "UNSAFE" | "INCOMPLETE";

export type User = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  timezone: string;
  pisScore: number;
  ertBalance: number;
  currentStreak: number;
  continuityCredits: number;
  createdAt: string;
  updatedAt: string;
};

export type RubricAxis = {
  label: string;
  description: string;
};

export type ChallengeBlueprint = {
  version: number;
  blueprintId: string;
  signature: string;
  nonce: string;
  primaryTopic: string;
  secondaryTopic?: string;
  secondaryDiscipline?: string;
  focus: string;
  emphasis?: string;
  modeId: string;
  modeLabel: string;
  modeFamily: string;
  scenarioFamily: string;
  practitionerRole: string;
  evidenceStyle: string;
  constraintTwist: string;
  deliverable: string;
  interaction: "written" | "commands" | "code" | "oral";
  validationKind: "holistic" | "command-sequence" | "code-reasoning" | "oral-defense";
  responseSections: string[];
  promptDirective: string;
};

export type DisciplineSnapshot = {
  id: string;
  label: string;
  topics: string[];
  formats: string[];
  evidenceTypes: string[];
  responseSections: string[];
  weakPatterns: string[];
  unsafePatterns: string[];
  rubric: Record<string, RubricAxis>;
  targetDifficulty: Difficulty;
  weeklyTimeBudgetHours: number;
  preferenceNotes?: string;
  secondaryInterests?: string[];
  currentLevel?: string;
  weakAreas?: string[];
  avoidAreas?: string[];
  goals?: string[];
  customDiscipline?: string;
  restDay?: number;
  generationContext?: {
    topicFocus?: string;
    preferredFormat?: string;
    durationMinutes: number;
    difficultyFloor: Difficulty;
    recoveryMode: boolean;
    teamMode: boolean;
    scheduledRecovery?: boolean;
    blueprint?: ChallengeBlueprint;
  };
};

export type RecoveryContext = {
  targetKey: string;
  target: string;
  skill?: string;
  reason: string;
  trigger: "ScheduledRest" | "ManualRequest" | "MissedChallenge" | "LowScore";
  sourceType: "MissedChallenge" | "LowScore" | "ProfileWeakArea" | "RecentLearning";
  sourceId?: string;
  taskStyle: "Evidence drill" | "Error correction" | "Transfer check" | "Teach-back";
  task: string;
  assignedAt: string;
};

export type RecoveryOutcome = {
  targetKey: string;
  target: string;
  status: "Completed" | "Attempted" | "NotAddressed";
  evidence: string;
  ertBonus: number;
};

export type StudyProfile = {
  userId: string;
  primaryDiscipline: string;
  secondaryInterests: string[];
  rankedTopics: string[];
  currentLevel: string;
  preferredFormats: string[];
  evidenceTypes: string[];
  weeklyTimeBudgetHours: number;
  restDay: number;
  targetDifficulty: Difficulty;
  weakAreas: string[];
  avoidAreas: string[];
  goals: string[];
  customDiscipline?: string;
  customStatus?: string;
  preferenceNotes?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type Session = {
  id: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
};

export type Challenge = {
  id: string;
  userId: string;
  dateKey: string;
  title: string;
  difficulty: Difficulty;
  topic: string;
  scenario: string;
  objective: string;
  constraints: string[];
  allowedTools: string[];
  expectedAnswerFormat: string;
  submissionRequirements: string[];
  deadlineAt: string;
  solution: string;
  antiGenericRequirement: string;
  status: ChallengeStatus;
  isRecovery: boolean;
  isPressure: boolean;
  disciplineSnapshot?: DisciplineSnapshot;
  recoveryContext?: RecoveryContext;
  createdAt: string;
};

export type Submission = {
  id: string;
  challengeId: string;
  userId: string;
  content: string;
  submittedAt: string;
  isLate: boolean;
  requiresVerification: boolean;
  verificationQuestion?: string;
  verificationAnswer?: string;
  createdAt: string;
};

export type Grade = {
  id: string;
  submissionId: string;
  challengeId: string;
  userId: string;
  creativity: number;
  ingenuity: number;
  reporting: number;
  alienness: number;
  neatness: number;
  rawScore: number;
  balancePenalty: number;
  latePenalty: number;
  technicalCap: TechnicalCap;
  finalScore: number;
  verdict: "Passed" | "Partially passed" | "Failed";
  correction: string;
  contentionNotes: string[];
  nextImprovementTarget: string;
  rubricSnapshot?: Record<string, RubricAxis>;
  recoveryOutcome?: RecoveryOutcome;
  pisChange: number;
  previousPis: number;
  updatedPis: number;
  ertEarned: number;
  ertBalance: number;
  createdAt: string;
};

export type LedgerEvent = {
  id: string;
  userId: string;
  type: "PIS" | "ERT" | "CONTINUITY";
  amount: number;
  reason: string;
  balanceAfter: number;
  createdAt: string;
};

export type Redemption = {
  id: string;
  userId: string;
  rewardName: string;
  cost: number;
  date: string;
  note?: string;
  balanceAfter: number;
  createdAt: string;
};

export type NotebookEntry = {
  id: string;
  userId: string;
  challengeId: string;
  title: string;
  summary: string;
  mistakes: string[];
  correctApproach: string;
  commands: string[];
  lessons: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type DisciplineRecord = {
  userId: string;
  weekKey: string;
  missedCount: number;
  pisGainCapMultiplier: number;
  weekendRecoveryRequired: boolean;
  completedCount: number;
  continuityCreditEarned: boolean;
};

export type RetentionSnapshot = {
  targetDays: number;
  completedDays: number;
  continuityCredits: number;
  creditEarnedThisWeek: boolean;
  cycle: {
    startDate: string;
    endDate: string;
    restDayLabel: string;
  };
  nextMilestone: {
    title: string;
    detail: string;
    remainingDays: number;
  };
  days: {
    date: string;
    label: string;
    state: "completed" | "protected" | "missed" | "rest" | "today" | "open" | "upcoming";
    score: number | null;
  }[];
  preview: {
    available: boolean;
    unlockAt: string;
    discipline: string;
    focus: string;
    format: string;
    durationMinutes: number;
    difficulty: Difficulty;
  };
  weeklyReveal: {
    unlocked: boolean;
    averageScore: number | null;
    bestScore: number | null;
    earlySubmissions: number;
    message: string;
  };
};

export type Friendship = {
  id: string;
  userId: string;
  friendId: string;
  status: "Accepted";
  createdAt: string;
};

export type MarketplaceChallenge = {
  id: string;
  title: string;
  topic: string;
  difficulty: Difficulty;
  summary: string;
  estimatedMinutes: number;
  enrollmentCount: number;
  createdAt: string;
};

export type ChallengeEnrollment = {
  id: string;
  userId: string;
  marketplaceChallengeId: string;
  createdAt: string;
};

export type AppData = {
  users: User[];
  sessions: Session[];
  challenges: Challenge[];
  submissions: Submission[];
  grades: Grade[];
  ledgerEvents: LedgerEvent[];
  redemptions: Redemption[];
  notebookEntries: NotebookEntry[];
  disciplineRecords: DisciplineRecord[];
  friendships: Friendship[];
  marketplaceChallenges: MarketplaceChallenge[];
  challengeEnrollments: ChallengeEnrollment[];
};
