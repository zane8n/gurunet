import { z } from "zod";
import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { fromDbNotebookEntry } from "@/lib/db-mappers";
import { prisma } from "@/lib/prisma";

const patchSchema = z.object({
  summary: z.string().trim().max(2000).optional(),
  lessons: z.array(z.string().trim().min(1).max(300)).max(12).optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
});

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const entry = await prisma.notebookEntry.findFirst({
      where: { id, userId: user.id },
    });
    if (!entry) return json({ error: "Notebook entry not found" }, { status: 404 });
    return json({ entry: fromDbNotebookEntry(entry) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const input = patchSchema.parse(await request.json());
    const existing = await prisma.notebookEntry.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw new Response("Notebook entry not found", { status: 404 });
    const entry = await prisma.notebookEntry.update({
      where: { id },
      data: input,
    });
    return json({ entry: fromDbNotebookEntry(entry) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await context.params;
    const existing = await prisma.notebookEntry.findFirst({ where: { id, userId: user.id } });
    if (!existing) throw new Response("Notebook entry not found", { status: 404 });
    await prisma.notebookEntry.delete({ where: { id } });
    return json({ ok: true });
  } catch (error) {
    return apiError(error);
  }
}
