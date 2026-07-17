import { after } from "next/server";
import { apiError, json } from "@/lib/api";
import {
  getDashboard,
  getDisciplineCatalog,
  getStudyProfile,
  runDashboardBackgroundTasks,
} from "@/lib/app-service";
import { getCurrentUser, publicUser } from "@/lib/auth";
import { userWithClientTimezone } from "@/lib/user-timezone";

export async function GET(request: Request) {
  try {
    const authenticatedUser = await getCurrentUser();
    const disciplines = getDisciplineCatalog();
    if (!authenticatedUser) {
      return json({ user: null, profile: null, disciplines, dashboard: null });
    }
    const user = await userWithClientTimezone(authenticatedUser, request);

    const profile = await getStudyProfile(user);
    if (profile.onboardingRequired) {
      return json({
        user: publicUser(user),
        profile,
        disciplines,
        dashboard: null,
      });
    }

    const dashboard = await getDashboard(user, { profileState: profile });
    after(() => runDashboardBackgroundTasks(user.id, dashboard.today.id));
    return json({
      user: publicUser(dashboard.user),
      profile,
      disciplines,
      dashboard: { ...dashboard, user: publicUser(dashboard.user) },
    });
  } catch (error) {
    return apiError(error);
  }
}
