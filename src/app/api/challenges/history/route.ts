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
      include: { submissions: { select: { id: true }, take: 1 } },
    });
    return json({
      challenges: challenges.map((challenge) => {
        const mapped = fromDbChallenge(challenge);
        return challenge.submissions.length > 0 ? mapped : { ...mapped, solution: "" };
      }),
    });
  } catch (error) {
    return apiError(error);
  }
}
