import { apiError, json } from "@/lib/api";
import { getCurrentUser, publicUser } from "@/lib/auth";

export async function GET() {
  try {
    const user = await getCurrentUser();
    return json({ user: user ? publicUser(user) : null });
  } catch (error) {
    return apiError(error);
  }
}
