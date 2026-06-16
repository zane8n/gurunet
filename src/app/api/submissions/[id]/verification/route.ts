import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { answerVerification, verificationSchema } from "@/lib/app-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const input = verificationSchema.parse(await request.json());
    const submission = await answerVerification(user, id, input.answer);
    return json({ submission });
  } catch (error) {
    return apiError(error);
  }
}
