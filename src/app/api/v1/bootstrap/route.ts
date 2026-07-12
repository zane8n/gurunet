import { appApiError, minimumVersions } from "@/lib/app-api";
import { publicChallenge } from "@/lib/app-public";
import { publicUser, requireUser } from "@/lib/auth";
import { getDashboard } from "@/lib/app-service";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireUser();
    const [dashboard, preferences, schedules] = await Promise.all([
      getDashboard(user),
      prisma.notificationPreference.findUnique({ where: { userId: user.id } }),
      prisma.studySchedule.findMany({ where: { userId: user.id, enabled: true } }),
    ]);
    return Response.json({
      ...dashboard,
      today: publicChallenge(dashboard.today),
      user: publicUser(dashboard.user),
      preferences,
      schedules,
      minimumVersions,
      featureFlags: {
        crossDeviceDrafts: true,
        privateNetwork: true,
        notifications: true,
        marketplaceManagement: false,
      },
    });
  } catch (error) {
    if (error instanceof Response) return error;
    return appApiError("BOOTSTRAP_FAILED", "Unable to load GURUnet.", 500);
  }
}
