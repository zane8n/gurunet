import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { actOnConnectionInvitation, connectionActionSchema } from "@/lib/app-service";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const user = await requireUser();
    const params = await context.params;
    const { action } = connectionActionSchema.parse({ action: params.action });
    const friendship = await actOnConnectionInvitation(user, params.id, action);
    return json({ friendship });
  } catch (error) {
    return apiError(error);
  }
}
