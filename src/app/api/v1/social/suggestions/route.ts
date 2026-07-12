import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getSocialSnapshot } from "@/lib/app-service";

export async function GET() {
  try {
    const user = await requireUser();
    const social = await getSocialSnapshot(user);
    return json({ suggestions: social.suggestions });
  } catch (error) {
    return apiError(error);
  }
}
