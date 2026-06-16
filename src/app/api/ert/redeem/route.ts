import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { redeemErt, redemptionSchema } from "@/lib/app-service";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = redemptionSchema.parse(await request.json());
    const redemption = await redeemErt(user, input);
    return json({ redemption }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
