import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { fromDbRedemption } from "@/lib/db-mappers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireUser();
    const redemptions = await prisma.redemption.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
    });
    return json({
      redemptions: redemptions.map(fromDbRedemption),
    });
  } catch (error) {
    return apiError(error);
  }
}
