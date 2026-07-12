import { appApiError } from "@/lib/app-api";
import { publicChallenge } from "@/lib/app-public";
import { getOrCreateTodayChallenge } from "@/lib/app-service";
import { requireUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await requireUser();
    const challenge = await getOrCreateTodayChallenge(user);
    return Response.json({ challenge: publicChallenge(challenge) });
  } catch (error) {
    if (error instanceof Response) return error;
    return appApiError("CHALLENGE_FAILED", "Unable to load today's challenge.", 500);
  }
}
