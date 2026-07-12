export const statusLabels: Record<string, string> = {
  RecoveryChallenge: "Recovery Challenge", PressureChallenge: "Pressure Challenge", RestDay: "Rest day",
};
export function challengeStatusLabel(status: string) { return statusLabels[status] ?? status; }
export function finalScore(raw: number, balancePenalty: number, latePenalty: number, cap?: number) {
  const afterPenalties = Math.max(0, raw - balancePenalty - latePenalty);
  return Math.round(Math.min(afterPenalties, cap ?? 20) * 100) / 100;
}
export function deadlineState(deadline: string, now = Date.now()) {
  const remainingMs = new Date(deadline).getTime() - now;
  return { remainingMs, overdue: remainingMs < 0, urgent: remainingMs >= 0 && remainingMs <= 60 * 60_000 };
}
export function reminderTimes(availableAt: Date, deadlineAt: Date, studyHour = 10) {
  const study = new Date(availableAt); study.setHours(studyHour, 0, 0, 0);
  return [availableAt, study, new Date(deadlineAt.getTime() - 60 * 60_000)].filter((date, index, dates) => date < deadlineAt && dates.findIndex((other) => other.getTime() === date.getTime()) === index).slice(0, 3);
}
export function canTransitionFriendship(from: string, action: string, incoming: boolean) {
  if (from !== "Pending") return false;
  return incoming ? ["accept", "decline", "block"].includes(action) : ["cancel", "block"].includes(action);
}
