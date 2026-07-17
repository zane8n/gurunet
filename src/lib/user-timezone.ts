import type { User } from "@/lib/domain";
import { fromDbUser } from "@/lib/db-mappers";
import { prisma } from "@/lib/prisma";
import { isValidTimezone } from "@/lib/time";

export async function userWithClientTimezone(user: User, request: Request) {
  const requested = request.headers.get("x-client-timezone")?.trim();
  if (!requested || requested === user.timezone || !isValidTimezone(requested)) return user;

  const updated = await prisma.$transaction(async (tx) => {
    const storedUser = await tx.user.update({
      where: { id: user.id },
      data: { timezone: requested },
    });
    await tx.studySchedule.updateMany({
      where: { userId: user.id },
      data: { timezone: requested },
    });
    return storedUser;
  });
  return fromDbUser(updated);
}
