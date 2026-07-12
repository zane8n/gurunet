import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { socialSettingsSchema, updateSocialSettings } from "@/lib/app-service";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireUser();
    const settings = await prisma.userSocialSettings.findUnique({ where: { userId: user.id } });
    return json({ settings: settings ?? { userId: user.id, discoverable: false, allowEmailInvites: true } });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const input = socialSettingsSchema.parse(await request.json());
    return json({ settings: await updateSocialSettings(user, input) });
  } catch (error) {
    return apiError(error);
  }
}
