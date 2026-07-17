import { after } from "next/server";
import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getOrCreateTodayChallenge, runDashboardBackgroundTasks } from "@/lib/app-service";
import { getChallengeGenerationStatus } from "@/lib/ai-jobs";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireUser();
    const challenge = await getOrCreateTodayChallenge(user);
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
