import { apiError, json } from "@/lib/api";
import { publicUser, requireUser } from "@/lib/auth";
import { getDashboard } from "@/lib/app-service";

export async function GET() {
  try {
    const user = await requireUser();
    const dashboard = await getDashboard(user);
    return json({ ...dashboard, user: publicUser(dashboard.user) });
  } catch (error) {
    return apiError(error);
  }
}
