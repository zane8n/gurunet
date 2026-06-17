import { apiError, json } from "@/lib/api";
import {
  adminPasswordChangeSchema,
  changeAdminPassword,
  requireAdminSecret,
} from "@/lib/admin-auth";

export async function POST(request: Request) {
  try {
    await requireAdminSecret(request);
    const input = adminPasswordChangeSchema.parse(await request.json());
    return json(await changeAdminPassword(input.currentPassword, input.newPassword));
  } catch (error) {
    return apiError(error);
  }
}
