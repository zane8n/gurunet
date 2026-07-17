import { after } from "next/server";
import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getOrCreateTodayChallenge, runDashboardBackgroundTasks } from "@/lib/app-service";
import { getChallengeGenerationStatus } from "@/lib/ai-jobs";
import { prisma } from "@/lib/prisma";
import { userWithClientTimezone } from "@/lib/user-timezone";

export async function GET(request: Request) {
  try {
    const user = await userWithClientTimezone(await requireUser(), request);
    const now = new Date();
    const challenge = await getOrCreateTodayChallenge(user, { now });
    const [hasSubmitted, challengeGenerationStatus] = await Promise.all([
      prisma.submission.findFirst({
        where: { userId: user.id, challengeId: challenge.id },
        select: { id: true },
      }),
      getChallengeGenerationStatus(challenge.id),
    ]);
    after(() => runDashboardBackgroundTasks(user.id, challenge.id));
    return json({
      challenge: hasSubmitted ? challenge : { ...challenge, solution: "" },
      challengeGenerationStatus,
    });
  } catch (error) {
    return apiError(error);
  }
}
