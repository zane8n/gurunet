import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { gradeExistingSubmission } from "@/lib/app-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const grade = await gradeExistingSubmission(user, id);
    return json({ grade });
  } catch (error) {
    return apiError(error);
  }
}
