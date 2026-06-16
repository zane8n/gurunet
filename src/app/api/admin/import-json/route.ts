import { apiError, json } from "@/lib/api";
import { importJsonData } from "@/lib/import-json";

export async function POST(request: Request) {
  try {
    const secret = process.env.IMPORT_SECRET;
    if (secret) {
      const provided = request.headers.get("x-import-secret");
      if (provided !== secret) throw new Response("Unauthorized", { status: 401 });
    }
    const body = await request.json().catch(() => ({}));
    const counts = await importJsonData(
      typeof body.sourcePath === "string" ? body.sourcePath : undefined,
    );
    return json({ counts });
  } catch (error) {
    return apiError(error);
  }
}
