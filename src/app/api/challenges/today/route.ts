import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getOrCreateTodayChallenge } from "@/lib/app-service";

export async function GET() {
  try {
    const user = await requireUser();
    const challenge = await getOrCreateTodayChallenge(user);
    return json({ challenge });
  } catch (error) {
    return apiError(error);
  }
}
