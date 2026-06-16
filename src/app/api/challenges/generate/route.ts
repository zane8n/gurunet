import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { forceGenerateChallenge } from "@/lib/app-service";

export async function POST() {
  try {
    const user = await requireUser();
    const challenge = await forceGenerateChallenge(user);
    return json({ challenge }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
