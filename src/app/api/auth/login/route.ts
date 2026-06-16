import { NextResponse } from "next/server";
import {
  createSession,
  loginSchema,
  publicUser,
  setSessionCookie,
  verifyPassword,
} from "@/lib/auth";
import { apiError } from "@/lib/api";
import { fromDbUser } from "@/lib/db-mappers";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const input = loginSchema.parse(await request.json());
    const dbUser = await prisma.user.findUnique({ where: { email: input.email } });
    const user = dbUser ? fromDbUser(dbUser) : null;
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    const session = await createSession(user.id);
    const response = NextResponse.json({ user: publicUser(user) });
    setSessionCookie(response, session);
    return response;
  } catch (error) {
    return apiError(error);
  }
}
