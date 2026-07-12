import { getBearerIdentity, revokeAllAppSessions, revokeAppSession } from "@/lib/app-auth";
import { appApiError } from "@/lib/app-api";

export async function POST(request: Request) {
  const identity = await getBearerIdentity();
  if (!identity) return appApiError("UNAUTHORIZED", "Sign in is required.", 401);
  const body = (await request.json().catch(() => ({}))) as { allDevices?: boolean };
  if (body.allDevices) await revokeAllAppSessions(identity.user.id);
  else await revokeAppSession(identity.sessionId, identity.user.id);
  return Response.json({ ok: true });
}
