import { after } from "next/server";
import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { forceGenerateChallenge, runDashboardBackgroundTasks } from "@/lib/app-service";
import { getChallengeGenerationStatus } from "@/lib/ai-jobs";

export async function POST() {
  try {
    const user = await requireUser();
    const challenge = await forceGenerateChallenge(user);
    const challengeGenerationStatus = await getChallengeGenerationStatus(challenge.id);
    after(() => runDashboardBackgroundTasks(user.id, challenge.id));
    return json(
      { challenge: { ...challenge, solution: "" }, challengeGenerationStatus },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
