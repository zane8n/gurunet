import { apiError, json } from "@/lib/api";
import { requireAdminSecret } from "@/lib/admin-auth";
import { getSupportUserSnapshot, supportUserLookupSchema } from "@/lib/app-service";

export async function GET(request: Request) {
  try {
    await requireAdminSecret(request);
    const url = new URL(request.url);
    const input = supportUserLookupSchema.parse({
      email: url.searchParams.get("email") ?? undefined,
      userId: url.searchParams.get("userId") ?? undefined,
    });
    return json(await getSupportUserSnapshot(input));
  } catch (error) {
    return apiError(error);
  }
}
