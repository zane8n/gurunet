const DEFAULT_TIMEZONE = process.env.APP_TIMEZONE || "Africa/Johannesburg";

export function getUserTimezone(timezone?: string) {
  return timezone || DEFAULT_TIMEZONE;
}

export function nowIso() {
  return new Date().toISOString();
}

export function dateKeyFor(date: Date, timezone = DEFAULT_TIMEZONE) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

export function localHourFor(date: Date, timezone = DEFAULT_TIMEZONE) {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  }).format(date);
  return Number(hour === "24" ? "0" : hour);
}

export function challengeDateKeyFor(
  date: Date,
  timezone = DEFAULT_TIMEZONE,
  rolloverHour = 8,
) {
  const dateKey = dateKeyFor(date, timezone);
  if (localHourFor(date, timezone) >= rolloverHour) return dateKey;

  const previousNoon = new Date(`${dateKey}T12:00:00.000Z`);
  previousNoon.setUTCDate(previousNoon.getUTCDate() - 1);
  return dateKeyFor(previousNoon, timezone);
}

export function weekKeyFor(date: Date, timezone = DEFAULT_TIMEZONE) {
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

export function localDeadlineIso(
  dateKey: string,
  timezone = DEFAULT_TIMEZONE,
  hour = 12,
) {
  const utcGuess = new Date(`${dateKey}T${String(hour).padStart(2, "0")}:00:00Z`);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(utcGuess);
  const actual = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const localAsUtc = Date.UTC(
    Number(actual.year),
    Number(actual.month) - 1,
    Number(actual.day),
    Number(actual.hour),
    Number(actual.minute),
    Number(actual.second),
  );
  const intendedAsUtc = Date.UTC(
    Number(dateKey.slice(0, 4)),
    Number(dateKey.slice(5, 7)) - 1,
    Number(dateKey.slice(8, 10)),
    hour,
    0,
    0,
  );
  const offset = localAsUtc - utcGuess.getTime();
  return new Date(intendedAsUtc - offset).toISOString();
}

export function challengeUnlockIso(dateKey: string, timezone = DEFAULT_TIMEZONE) {
  return localDeadlineIso(dateKey, timezone, 8);
}

export function nextChallengeUnlockIso(dateKey: string, timezone = DEFAULT_TIMEZONE) {
  const nextNoon = new Date(`${dateKey}T12:00:00.000Z`);
  nextNoon.setUTCDate(nextNoon.getUTCDate() + 1);
  return challengeUnlockIso(dateKeyFor(nextNoon, timezone), timezone);
}

export function minutesAfterDeadline(submittedAt: string, deadlineAt: string) {
  return Math.max(
    0,
    Math.floor((Date.parse(submittedAt) - Date.parse(deadlineAt)) / 60000),
  );
}
