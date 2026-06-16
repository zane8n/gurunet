import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { cohortCreateSchema, createCohortChallenge } from "@/lib/app-service";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = cohortCreateSchema.parse(await request.json());
    const cohort = await createCohortChallenge(user, input);
    return json({ cohort }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
