import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { saveUploadFiles } from "@/lib/storage";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const form = await request.formData();
    const files = form
      .getAll("files")
      .filter((item): item is File => item instanceof File);
    const attachments = await saveUploadFiles(user, files);
    return json({ attachments }, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
