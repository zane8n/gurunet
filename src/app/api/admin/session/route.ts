import { apiError, json } from "@/lib/api";
import { requireAdminSecret } from "@/lib/admin-auth";

export async function GET(request: Request) {
  try {
    await requireAdminSecret(request);
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
