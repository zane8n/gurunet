import { getRuntimeEnv } from "@/lib/runtime-env";
import { prisma } from "@/lib/prisma";

export async function revokeLinkedProviderTokens(userId: string) {
  await revokeAppleTokens(userId);
}

async function revokeAppleTokens(userId: string) {
  const clientId = getRuntimeEnv("AUTH_APPLE_ID");
  const clientSecret = getRuntimeEnv("AUTH_APPLE_SECRET");
  const appleAccounts = await prisma.account.findMany({
    where: { userId, provider: "apple" },
    select: { refresh_token: true, access_token: true },
  });
  if (appleAccounts.length === 0) return;
  if (!clientId || !clientSecret) {
    throw new Response("Apple token revocation is not configured.", { status: 500 });
  }

  for (const account of appleAccounts) {
    const tokens = [
      { token: account.refresh_token, hint: "refresh_token" },
      { token: account.access_token, hint: "access_token" },
    ].filter((item): item is { token: string; hint: string } => Boolean(item.token));

    for (const item of tokens) {
      const body = new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        token: item.token,
        token_type_hint: item.hint,
      });
      const response = await fetch("https://appleid.apple.com/auth/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!response.ok) {
        throw new Response("Unable to revoke Apple sign-in token.", { status: 502 });
      }
    }
  }
}
