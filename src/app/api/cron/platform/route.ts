import { runDueAiJobs } from "@/lib/ai-jobs";
import { processDueNotifications, prunePlatformState } from "@/lib/notification-jobs";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const [aiJobs, notifications, cleanup] = await Promise.all([
    runDueAiJobs(10),
    processDueNotifications(50),
    prunePlatformState(),
  ]);
  return Response.json({ ok: true, aiJobs, notifications, cleanup });
}
