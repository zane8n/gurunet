import { apiError, json } from "@/lib/api";
import { requireAdminSecret } from "@/lib/admin-auth";
import { getAdminOverview } from "@/lib/admin-overview";

export async function GET(request: Request) {
  try {
    await requireAdminSecret(request);
    return json(await getAdminOverview());
  } catch (error) {
    return apiError(error);
  }
}
