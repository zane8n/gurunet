import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { cohortJoinSchema, joinCohortChallenge } from "@/lib/app-service";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = cohortJoinSchema.parse(await request.json());
    const enrollment = await joinCohortChallenge(user, input);
    return json({ enrollment }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
