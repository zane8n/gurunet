import { NextResponse } from "next/server";
import { publicUser, signupSchema, hashPassword, createSession, setSessionCookie } from "@/lib/auth";
import { apiError } from "@/lib/api";
import { fromDbUser } from "@/lib/db-mappers";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/store";

export async function POST(request: Request) {
  try {
    const input = signupSchema.parse(await request.json());
    if (await prisma.user.findUnique({ where: { email: input.email } })) {
      throw new Response("Email already registered", { status: 409 });
    }
    const dbUser = await prisma.user.create({
      data: {
        id: createId("usr"),
        name: input.name,
        email: input.email,
        passwordHash: await hashPassword(input.password),
        timezone: input.timezone,
      },
    });
    const user = fromDbUser(dbUser);

    const session = await createSession(user.id);
    const response = NextResponse.json({ user: publicUser(user) }, { status: 201 });
    setSessionCookie(response, session);
    return response;
  } catch (error) {
    return apiError(error);
  }
}
