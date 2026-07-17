import { apiError, json } from "@/lib/api";
import { getDisciplineCatalog } from "@/lib/app-service";

export async function GET() {
  try {
    return json(
      { disciplines: getDisciplineCatalog() },
      { headers: { "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400" } },
    );
  } catch (error) {
    return apiError(error);
  }
}
