import { z } from "zod";
import { appApiError } from "@/lib/app-api";
import { issueAppSession, opaqueTokenHash, pkceChallenge } from "@/lib/app-auth";
import { prisma } from "@/lib/prisma";

const schema = z.object({
  code: z.string().min(32),
  state: z.string().min(16),
  codeVerifier: z.string().min(43).max(128),
  deviceId: z.string().min(8).max(160).optional(),
  locale: z.string().min(2).max(20).optional(),
  pushToken: z.string().min(8).max(512).optional(),
});

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    const code = await prisma.appAuthCode.findUnique({
      where: { codeHash: opaqueTokenHash(input.code) },
    });
    if (
      !code || code.usedAt || code.expiresAt <= new Date() ||
      code.state !== input.state || pkceChallenge(input.codeVerifier) !== code.codeChallenge
    ) {
      return appApiError("INVALID_AUTH_CODE", "The sign-in code is invalid or expired.", 401);
    }
    const claimed = await prisma.appAuthCode.updateMany({
      where: { id: code.id, usedAt: null }, data: { usedAt: new Date() },
    });
    if (!claimed.count) return appApiError("AUTH_CODE_USED", "The sign-in code was already used.", 401);
    const tokens = await issueAppSession(code.userId, {
      deviceId: input.deviceId, platform: code.platform,
      appVersion: code.appVersion, timezone: code.timezone,
      locale: input.locale, pushToken: input.pushToken,
    });
    return Response.json({ tokens });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return appApiError("VALIDATION_FAILED", "Check the sign-in exchange.", 400, error.issues);
    }
    return appApiError("OAUTH_EXCHANGE_FAILED", "Unable to finish sign in.", 500);
  }
}
