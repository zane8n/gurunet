import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import {
  connectionInvitationSchema,
  createConnectionInvitation,
  getSocialSnapshot,
} from "@/lib/app-service";

export async function GET() {
  try {
    const user = await requireUser();
    const social = await getSocialSnapshot(user);
    return json({ invitations: social.invitations });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = connectionInvitationSchema.parse(await request.json());
    return json(await createConnectionInvitation(user, input), { status: 202 });
  } catch (error) {
    return apiError(error);
  }
}
