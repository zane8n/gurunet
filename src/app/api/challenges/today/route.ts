import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { getOrCreateTodayChallenge } from "@/lib/app-service";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireUser();
    const challenge = await getOrCreateTodayChallenge(user);
    const hasSubmitted = await prisma.submission.findFirst({
      where: { userId: user.id, challengeId: challenge.id },
      select: { id: true },
    });
    return json({
      challenge: hasSubmitted ? challenge : { ...challenge, solution: "" },
    });
  } catch (error) {
    return apiError(error);
  }
}
