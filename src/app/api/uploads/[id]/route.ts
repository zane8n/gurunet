import { apiError } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteStoredUpload, readStoredUpload } from "@/lib/storage";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const attachment = await prisma.submissionAttachment.findFirst({
      where: { id, userId: user.id },
    });
    if (!attachment) throw new Response("Attachment not found", { status: 404 });
    const stored = await readStoredUpload(attachment.storagePath);
    if (!stored) throw new Response("Attachment not found", { status: 404 });
    return new Response(stored.stream, {
      headers: {
        "Content-Type": attachment.mimeType || stored.contentType,
        "Content-Disposition": `inline; filename="${attachment.filename.replace(/["\\]/g, "")}"`,
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const attachment = await prisma.submissionAttachment.findFirst({
      where: { id, userId: user.id, submissionId: null },
    });
    if (!attachment) throw new Response("Draft attachment not found", { status: 404 });
    await deleteStoredUpload(attachment.storagePath);
    await prisma.submissionAttachment.delete({ where: { id } });
    return Response.json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
