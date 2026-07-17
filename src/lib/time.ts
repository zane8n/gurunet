const FALLBACK_TIMEZONE = "Africa/Johannesburg";
const configuredTimezone = process.env.APP_TIMEZONE || FALLBACK_TIMEZONE;

export const CHALLENGE_RELEASE_HOUR = 8;

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

export type LearningClockSnapshot = {
  serverNow: string;
  timezone: string;
  localDateKey: string;
  localTime: string;
  activeChallengeDateKey: string;
  challengeReleased: boolean;
  releaseHour: number;
  nextChallengeReleaseAt: string;
};

export function isValidTimezone(timezone?: string | null) {
  if (!timezone?.trim()) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone.trim() }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function getUserTimezone(timezone?: string | null) {
  const requested = timezone?.trim();
  if (isValidTimezone(requested)) return requested as string;
  if (isValidTimezone(configuredTimezone)) return configuredTimezone;
  return FALLBACK_TIMEZONE;
}

export function nowIso() {
  return new Date().toISOString();
}

function zonedParts(date: Date, timezone = configuredTimezone): ZonedParts {
  const safeTimezone = getUserTimezone(timezone);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: safeTimezone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour === "24" ? "0" : values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function dateKeyFromParts(parts: Pick<ZonedParts, "year" | "month" | "day">) {
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

export function dateKeyFor(date: Date, timezone = configuredTimezone) {
  return dateKeyFromParts(zonedParts(date, timezone));
}

export function localHourFor(date: Date, timezone = configuredTimezone) {
  return zonedParts(date, timezone).hour;
}

export function addDaysToDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function weekdayForDateKey(dateKey: string) {
  return new Date(`${dateKey}T12:00:00.000Z`).getUTCDay();
}

export function learningCycleDateKeys(dateKey: string, restDay = 0) {
  const normalizedRestDay = Number.isInteger(restDay) && restDay >= 0 && restDay <= 6 ? restDay : 0;
  const cycleStartDay = (normalizedRestDay + 1) % 7;
  const daysSinceStart = (weekdayForDateKey(dateKey) - cycleStartDay + 7) % 7;
  const start = addDaysToDateKey(dateKey, -daysSinceStart);
  return Array.from({ length: 7 }, (_, index) => addDaysToDateKey(start, index));
}

export function learningCycleKey(dateKey: string, restDay = 0) {
  return `cycle:${learningCycleDateKeys(dateKey, restDay)[0]}`;
}

export function challengeDateKeyFor(
  date: Date,
  timezone = configuredTimezone,
  rolloverHour = CHALLENGE_RELEASE_HOUR,
) {
  const parts = zonedParts(date, timezone);
  const dateKey = dateKeyFromParts(parts);
  return parts.hour >= rolloverHour ? dateKey : addDaysToDateKey(dateKey, -1);
}

export function weekKeyFor(date: Date, timezone = configuredTimezone) {
  const key = dateKeyFor(date, timezone);
  const localNoon = new Date(`${key}T12:00:00.000Z`);
  const day = localNoon.getUTCDay() || 7;
  localNoon.setUTCDate(localNoon.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(localNoon.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((localNoon.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${localNoon.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function localDateTimeIso(
  dateKey: string,
  timezone = configuredTimezone,
  hour = 0,
  minute = 0,
) {
  const safeTimezone = getUserTimezone(timezone);
  const intendedAsUtc = Date.UTC(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(5, 7)) - 1,
    Number(dateKey.slice(8, 10)),
    hour,
    minute,
    0,
  );
  let candidate = intendedAsUtc;

  // Iterate because a timezone offset can differ from the initial UTC guess near DST changes.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = zonedParts(new Date(candidate), safeTimezone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const correction = intendedAsUtc - actualAsUtc;
    candidate += correction;
    if (correction === 0) break;
  }

  return new Date(candidate).toISOString();
}

export function localDeadlineIso(
  dateKey: string,
  timezone = configuredTimezone,
  hour = 12,
) {
  return localDateTimeIso(dateKey, timezone, hour, 0);
}

export function challengeUnlockIso(dateKey: string, timezone = configuredTimezone) {
  return localDeadlineIso(dateKey, timezone, CHALLENGE_RELEASE_HOUR);
}

export function nextChallengeUnlockIso(dateKey: string, timezone = configuredTimezone) {
  return challengeUnlockIso(addDaysToDateKey(dateKey, 1), timezone);
}

export function learningClockFor(
  date = new Date(),
  timezone = configuredTimezone,
): LearningClockSnapshot {
  const safeTimezone = getUserTimezone(timezone);
  const parts = zonedParts(date, safeTimezone);
  const localDateKey = dateKeyFromParts(parts);
  const challengeReleased = parts.hour >= CHALLENGE_RELEASE_HOUR;
  const activeChallengeDateKey = challengeReleased
    ? localDateKey
    : addDaysToDateKey(localDateKey, -1);
  const nextReleaseDateKey = challengeReleased
    ? addDaysToDateKey(localDateKey, 1)
    : localDateKey;

  return {
    serverNow: date.toISOString(),
    timezone: safeTimezone,
    localDateKey,
    localTime: `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`,
    activeChallengeDateKey,
    challengeReleased,
    releaseHour: CHALLENGE_RELEASE_HOUR,
    nextChallengeReleaseAt: challengeUnlockIso(nextReleaseDateKey, safeTimezone),
  };
}

export function minutesAfterDeadline(submittedAt: string, deadlineAt: string) {
  return Math.max(
    0,
    Math.floor((Date.parse(submittedAt) - Date.parse(deadlineAt)) / 60000),
  );
}
