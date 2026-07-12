import { z } from "zod";
import { appPlatformSchema, appApiError, versionIsSupported } from "@/lib/app-api";
import { isAllowedAppRedirect, siteUrl } from "@/lib/app-oauth";

const schema = z.object({
  provider: z.enum(["google", "github", "apple"]),
  platform: appPlatformSchema,
  redirectUri: z.string().url(),
  codeChallenge: z.string().min(43).max(128),
  state: z.string().min(16).max(256),
  appVersion: z.string().min(1).max(32),
  timezone: z.string().min(3).max(80),
});

export async function GET(request: Request) {
  try {
    const input = schema.parse(Object.fromEntries(new URL(request.url).searchParams));
    if (!isAllowedAppRedirect(input.platform, input.redirectUri)) {
      return appApiError("INVALID_REDIRECT", "The app callback is not registered.", 400);
    }
    if (!versionIsSupported(input.platform, input.appVersion)) {
      return appApiError("APP_UPDATE_REQUIRED", "Update GURUnet to continue.", 426);
    }
    const callback = new URL("/app/auth/callback", siteUrl());
    Object.entries(input).forEach(([key, value]) => callback.searchParams.set(key, value));
    const authorizationUrl = new URL(`/api/auth/signin/${input.provider}`, siteUrl());
    authorizationUrl.searchParams.set("callbackUrl", callback.toString());
    return Response.json({ authorizationUrl: authorizationUrl.toString() });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return appApiError("VALIDATION_FAILED", "Check the OAuth request.", 400, error.issues);
    }
    return appApiError("OAUTH_START_FAILED", "Unable to start sign in.", 500);
  }
}
