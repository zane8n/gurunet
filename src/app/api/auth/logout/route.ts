import { NextRequest, NextResponse } from "next/server";
import { clearSessionCookie, SESSION_COOKIE } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const AUTH_SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE)?.value;

  if (sessionId) {
    await prisma.localSession.deleteMany({ where: { id: sessionId } });
  }

  const authSessionTokens = AUTH_SESSION_COOKIES.map((cookieName) => request.cookies.get(cookieName)?.value).filter(
    (value): value is string => Boolean(value),
  );
  if (authSessionTokens.length) {
    await prisma.session.deleteMany({
      where: { sessionToken: { in: authSessionTokens } },
    });
  }

  const response = NextResponse.json({ ok: true });
  clearSessionCookie(response);
  for (const cookieName of AUTH_SESSION_COOKIES) {
    response.cookies.set(cookieName, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
  }
  return response;
}
