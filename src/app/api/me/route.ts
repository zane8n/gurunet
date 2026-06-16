import { z } from "zod";
import { apiError, json } from "@/lib/api";
import { publicUser, requireUser } from "@/lib/auth";
import { fromDbUser } from "@/lib/db-mappers";
import { prisma } from "@/lib/prisma";

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  timezone: z.string().trim().min(3).max(80).optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    return json({ user: publicUser(user) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const input = profileSchema.parse(await request.json());
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: input,
    });
    return json({ user: publicUser(fromDbUser(updated)) });
  } catch (error) {
    return apiError(error);
  }
}
