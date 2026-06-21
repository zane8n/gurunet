import { z } from "zod";
import { apiError, json } from "@/lib/api";
import { requireAdminSecret } from "@/lib/admin-auth";
import { resetApplicationData } from "@/lib/admin-reset";

const resetSchema = z.object({
  confirmation: z.literal("RESET GURUNET DATA"),
});

export async function POST(request: Request) {
  try {
    const actor = await requireAdminSecret(request);
    const input = resetSchema.parse(await request.json());
    return json(await resetApplicationData({ actor, confirmation: input.confirmation }));
  } catch (error) {
    return apiError(error);
  }
}
