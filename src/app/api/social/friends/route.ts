import { apiError, json } from "@/lib/api";
import { friendSchema, addFriendByEmail } from "@/lib/app-service";
import { requireUser } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = friendSchema.parse(await request.json());
    const friendship = await addFriendByEmail(user, input);
    return json({ friendship }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
