import { after } from "next/server";
import { appApiError } from "@/lib/app-api";
import { publicChallenge } from "@/lib/app-public";
import { getChallengeGenerationStatus } from "@/lib/ai-jobs";
import { getOrCreateTodayChallenge, runDashboardBackgroundTasks } from "@/lib/app-service";
import { requireUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireUser();
    const challenge = await getOrCreateTodayChallenge(user);
    const challengeGenerationStatus = await getChallengeGenerationStatus(challenge.id);
    after(() => runDashboardBackgroundTasks(user.id, challenge.id));
    return Response.json({ challenge: publicChallenge(challenge), challengeGenerationStatus });
  } catch (error) {
    if (error instanceof Response) return error;
    return appApiError("CHALLENGE_FAILED", "Unable to load today's challenge.", 500);
  }
}
