import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { challengeSettingsSchema, updateChallengeSettings } from "@/lib/app-service";

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const input = challengeSettingsSchema.parse(await request.json());
    const settings = await updateChallengeSettings(user, input);
    return json({ settings });
  } catch (error) {
    return apiError(error);
  }
}
