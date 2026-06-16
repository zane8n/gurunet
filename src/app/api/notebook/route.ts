import { z } from "zod";
import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { fromDbNotebookEntry } from "@/lib/db-mappers";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/store";

const createSchema = z.object({
  title: z.string().trim().min(2).max(140),
  summary: z.string().trim().min(2).max(2000),
  lessons: z.array(z.string().trim().min(1).max(300)).max(12).default([]),
  tags: z.array(z.string().trim().min(1).max(60)).max(12).default([]),
});

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

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = createSchema.parse(await request.json());
    const challenge = await prisma.challenge.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    if (!challenge) throw new Response("Create a challenge before adding notebook notes", { status: 409 });

    const entry = await prisma.notebookEntry.create({
      data: {
        id: createId("note"),
        userId: user.id,
        challengeId: challenge.id,
        title: input.title,
        summary: input.summary,
        mistakes: [],
        correctApproach: input.summary,
        commands: [],
        lessons: input.lessons,
        tags: input.tags,
      },
    });
    return json({ entry: fromDbNotebookEntry(entry) });
  } catch (error) {
    return apiError(error);
  }
}
