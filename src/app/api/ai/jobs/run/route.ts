import { apiError, json } from "@/lib/api";
import { runDueAiJobs } from "@/lib/ai-jobs";

export async function POST(request: Request) {
  try {
    const secret = process.env.JOB_SECRET;
    if (secret && request.headers.get("x-job-secret") !== secret) {
      throw new Response("Unauthorized", { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const limit = Math.max(1, Math.min(10, Number(body.limit || 3)));
    const results = await runDueAiJobs(limit);
    return json({ results });
  } catch (error) {
    return apiError(error);
  }
}
