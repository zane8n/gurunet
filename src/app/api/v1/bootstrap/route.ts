import { after } from "next/server";
import { appApiError, minimumVersions } from "@/lib/app-api";
import { publicChallenge } from "@/lib/app-public";
import { publicUser, requireUser } from "@/lib/auth";
import { getDashboard, runDashboardBackgroundTasks } from "@/lib/app-service";
import { prisma } from "@/lib/prisma";
import { userWithClientTimezone } from "@/lib/user-timezone";

export async function GET(request: Request) {
  try {
    const user = await userWithClientTimezone(await requireUser(), request);
    const [dashboard, preferences, schedules] = await Promise.all([
      getDashboard(user),
      prisma.notificationPreference.findUnique({ where: { userId: user.id } }),
      prisma.studySchedule.findMany({ where: { userId: user.id, enabled: true } }),
    ]);
    after(() => runDashboardBackgroundTasks(user.id, dashboard.today.id));
    const challenge = publicChallenge(dashboard.today);
    return Response.json({
      ...dashboard,
      today: challenge,
      challenge,
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
    }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    if (error instanceof Response) return error;
    return appApiError("BOOTSTRAP_FAILED", "Unable to load GURUnet.", 500);
  }
}
