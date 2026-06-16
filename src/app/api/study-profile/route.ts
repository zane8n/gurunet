import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getStudyProfile, studyProfileSchema, updateStudyProfile } from "@/lib/app-service";

export async function GET() {
  try {
    const user = await requireUser();
    return json(await getStudyProfile(user));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const input = studyProfileSchema.parse(await request.json());
    return json(await updateStudyProfile(user, input));
  } catch (error) {
    return apiError(error);
  }
}
