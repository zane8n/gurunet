import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { submissionSchema, submitChallenge } from "@/lib/app-service";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const input = submissionSchema.parse(await request.json());
    const submission = await submitChallenge(user, id, input.content, input.attachmentIds);
    return json({ submission }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
