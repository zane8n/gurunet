import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { challengeNoticeSchema, recordChallengeNotice } from "@/lib/app-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const input = challengeNoticeSchema.parse(await request.json());
    const notice = await recordChallengeNotice(user, id, input);
    return json({ notice });
  } catch (error) {
    return apiError(error);
  }
}
