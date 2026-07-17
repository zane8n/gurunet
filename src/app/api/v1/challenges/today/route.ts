import { after } from "next/server";
import { appApiError } from "@/lib/app-api";
import { publicChallenge } from "@/lib/app-public";
import { getChallengeGenerationStatus } from "@/lib/ai-jobs";
import { getOrCreateTodayChallenge, runDashboardBackgroundTasks } from "@/lib/app-service";
import { requireUser } from "@/lib/auth";
import { learningClockFor } from "@/lib/time";
import { userWithClientTimezone } from "@/lib/user-timezone";

export async function GET(request: Request) {
  try {
    const user = await userWithClientTimezone(await requireUser(), request);
    const now = new Date();
    const challenge = await getOrCreateTodayChallenge(user, { now });
    const challengeGenerationStatus = await getChallengeGenerationStatus(challenge.id);
    after(() => runDashboardBackgroundTasks(user.id, challenge.id));
    return Response.json(
      {
        challenge: publicChallenge(challenge),
        challengeGenerationStatus,
        clock: {
          ...learningClockFor(now, user.timezone),
          activeChallengeDateKey: challenge.dateKey,
        },
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    if (error instanceof Response) return error;
    return appApiError("CHALLENGE_FAILED", "Unable to load today's challenge.", 500);
  }
}
