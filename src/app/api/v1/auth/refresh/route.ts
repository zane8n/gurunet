import { z } from "zod";
import { appApiError } from "@/lib/app-api";
import { rotateAppSession } from "@/lib/app-auth";

const schema = z.object({ refreshToken: z.string().min(40) });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    return Response.json({ tokens: await rotateAppSession(input.refreshToken) });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return appApiError("VALIDATION_FAILED", "A refresh token is required.", 400);
    }
    return appApiError("REFRESH_FAILED", "The session could not be refreshed.", 401);
  }
}
