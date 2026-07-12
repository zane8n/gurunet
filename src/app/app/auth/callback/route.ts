import { randomBytes } from "node:crypto";
import { z } from "zod";
import { auth } from "@/auth";
import { appPlatformSchema } from "@/lib/app-api";
import { opaqueTokenHash } from "@/lib/app-auth";
import { isAllowedAppRedirect } from "@/lib/app-oauth";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/store";

const querySchema = z.object({
  provider: z.enum(["google", "github", "apple"]),
  platform: appPlatformSchema,
  redirectUri: z.string().url(),
  codeChallenge: z.string().min(43).max(128),
  state: z.string().min(16).max(256),
  appVersion: z.string().min(1).max(32),
  timezone: z.string().min(3).max(80),
});

export async function GET(request: Request) {
  if (![...new URL(request.url).searchParams.keys()].length) {
    return new Response(
      "<!doctype html><html><body><main><h1>Return to the GURUnet app</h1><p>Reopen GURUnet if the sign-in handoff did not complete.</p></main></body></html>",
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
  const input = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!input.success || !isAllowedAppRedirect(input.data.platform, input.data.redirectUri)) {
    return new Response("Invalid app callback", { status: 400 });
  }
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return new Response("Sign in did not complete", { status: 401 });

  const code = randomBytes(40).toString("base64url");
  await prisma.appAuthCode.create({
    data: {
      id: createId("auth_code"), userId, platform: input.data.platform,
      codeHash: opaqueTokenHash(code), codeChallenge: input.data.codeChallenge,
      redirectUri: input.data.redirectUri, state: input.data.state,
      appVersion: input.data.appVersion, timezone: input.data.timezone,
      expiresAt: new Date(Date.now() + 5 * 60_000),
    },
  });
  const redirect = new URL(input.data.redirectUri);
  redirect.searchParams.set("code", code);
  redirect.searchParams.set("state", input.data.state);
  return Response.redirect(redirect);
}
