import { after } from "next/server";
import { apiError, json } from "@/lib/api";
import {
  getDashboard,
  getDisciplineCatalog,
  getStudyProfile,
  runDashboardBackgroundTasks,
} from "@/lib/app-service";
import { getCurrentUser, publicUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    const disciplines = getDisciplineCatalog();
    if (!user) {
      return json({ user: null, profile: null, disciplines, dashboard: null });
    }

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
