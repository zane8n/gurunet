import { apiError, json } from "@/lib/api";
import { enrollMarketplaceChallenge, enrollmentSchema } from "@/lib/app-service";
import { requireUser } from "@/lib/auth";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = enrollmentSchema.parse(await request.json());
    const enrollment = await enrollMarketplaceChallenge(user, input);
    return json({ enrollment }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
