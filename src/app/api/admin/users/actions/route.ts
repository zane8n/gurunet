import { apiError, json } from "@/lib/api";
import { requireAdminSecret } from "@/lib/admin-auth";
import { runSupportAction, supportActionSchema } from "@/lib/app-service";

export async function POST(request: Request) {
  try {
    const actor = await requireAdminSecret(request);
    const input = supportActionSchema.parse(await request.json());
    return json(await runSupportAction(actor, input));
  } catch (error) {
    return apiError(error);
  }
}
