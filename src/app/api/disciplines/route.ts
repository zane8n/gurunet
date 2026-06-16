import { apiError, json } from "@/lib/api";
import { getDisciplineCatalog } from "@/lib/app-service";

export async function GET() {
  try {
    return json({ disciplines: getDisciplineCatalog() });
  } catch (error) {
    return apiError(error);
  }
}
