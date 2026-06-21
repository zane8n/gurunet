import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { buildLearningExport } from "@/lib/learning-export";

export async function GET() {
  try {
    const user = await requireUser();
    const payload = await buildLearningExport(user);
    const date = new Date().toISOString().slice(0, 10);
    const filename = `gurunet-learning-export-${date}.json`;

    return new Response(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
