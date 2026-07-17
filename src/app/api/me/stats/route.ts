import { after } from "next/server";
import { apiError, json } from "@/lib/api";
import { publicUser, requireUser } from "@/lib/auth";
import { getDashboard, runDashboardBackgroundTasks } from "@/lib/app-service";
import { userWithClientTimezone } from "@/lib/user-timezone";

export async function GET(request: Request) {
  try {
    const user = await userWithClientTimezone(await requireUser(), request);
    const dashboard = await getDashboard(user);
    after(() => runDashboardBackgroundTasks(user.id, dashboard.today.id));
    return json({ ...dashboard, user: publicUser(dashboard.user) });
  } catch (error) {
    return apiError(error);
  }
}
