import { apiError, json } from "@/lib/api";
import { requireAdminSecret } from "@/lib/admin-auth";
import { getSupportUserSnapshot, supportUserLookupSchema } from "@/lib/app-service";
import { getAdminUserDirectory } from "@/lib/admin-overview";

export async function GET(request: Request) {
  try {
    await requireAdminSecret(request);
    const url = new URL(request.url);
    const hasLookup = url.searchParams.has("email") || url.searchParams.has("userId");
    const wantsDirectory =
      url.searchParams.get("directory") === "1" ||
      !hasLookup ||
      url.searchParams.has("query") ||
      url.searchParams.has("cursor") ||
      url.searchParams.has("limit");
    if (wantsDirectory) {
      return json(await getAdminUserDirectory({
        query: url.searchParams.get("query") ?? undefined,
        cursor: url.searchParams.get("cursor") ?? undefined,
        limit: Number(url.searchParams.get("limit") || 25),
      }));
    }
    const input = supportUserLookupSchema.parse({
      email: url.searchParams.get("email") ?? undefined,
      userId: url.searchParams.get("userId") ?? undefined,
    });
    return json(await getSupportUserSnapshot(input));
  } catch (error) {
    return apiError(error);
  }
}
