import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { fromDbNotebookEntry } from "@/lib/db-mappers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireUser();
    const entries = await prisma.notebookEntry.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return json({ entries: entries.map(fromDbNotebookEntry) });
  } catch (error) {
    return apiError(error);
  }
}
