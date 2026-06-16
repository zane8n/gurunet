import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { fromDbLedgerEvent } from "@/lib/db-mappers";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireUser();
    const events = await prisma.ledgerEvent.findMany({
      where: { userId: user.id, type: "ERT" },
      orderBy: { createdAt: "desc" },
    });
    return json({
      balance: user.ertBalance,
      events: events.map(fromDbLedgerEvent),
    });
  } catch (error) {
    return apiError(error);
  }
}
