import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { fromDbChallenge } from "@/lib/db-mappers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireUser();
    const challenges = await prisma.challenge.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return json({ challenges: challenges.map(fromDbChallenge) });
  } catch (error) {
    return apiError(error);
  }
}
