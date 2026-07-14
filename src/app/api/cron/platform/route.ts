import { runDueAiJobs } from "@/lib/ai-jobs";
import { processDueNotifications, prunePlatformState } from "@/lib/notification-jobs";
import { materializeNotificationSchedules } from "@/lib/notification-scheduler";
import { prepareDailyChallenges } from "@/lib/daily-challenge-jobs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const challengePreparation = await prepareDailyChallenges(3);
  const notificationSchedule = await materializeNotificationSchedules(100);
  const [aiJobs, notifications, cleanup] = await Promise.all([
    runDueAiJobs(10),
    processDueNotifications(100),
    prunePlatformState(),
  ]);
  return Response.json({ ok: true, challengePreparation, aiJobs, notificationSchedule, notifications, cleanup });
}
