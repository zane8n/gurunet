import { z } from "zod";
import { NextRequest, NextResponse } from "next/server";
import { apiError, json } from "@/lib/api";
import { clearSessionCookie, hashPassword, publicUser, requireUser, SESSION_COOKIE, verifyPassword } from "@/lib/auth";
import { fromDbUser } from "@/lib/db-mappers";
import { prisma } from "@/lib/prisma";
import { clearUserUploadStorage } from "@/lib/storage";

const AUTH_SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
  "next-auth.session-token",
  "__Secure-next-auth.session-token",
];

const profileSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  timezone: z.string().trim().min(3).max(80).optional(),
  currentPassword: z.string().max(160).optional(),
  newPassword: z.string().min(8).max(160).optional(),
});

const deleteAccountSchema = z.object({
  confirmation: z.string(),
  password: z.string().optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    return json({ user: publicUser(user) });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const input = profileSchema.parse(await request.json());
    const data: {
      name?: string;
      timezone?: string;
      passwordHash?: string;
    } = {};

    if (input.name !== undefined) data.name = input.name;
    if (input.timezone !== undefined) data.timezone = input.timezone;

    if (input.newPassword) {
      if (user.passwordHash && !(await verifyPassword(input.currentPassword ?? "", user.passwordHash))) {
        throw new Response("Current password is incorrect.", { status: 400 });
      }
      data.passwordHash = await hashPassword(input.newPassword);
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data,
    });
    return json({ user: publicUser(fromDbUser(updated)) });
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const user = await requireUser();
    const input = deleteAccountSchema.parse(await request.json().catch(() => ({})));

    if (input.confirmation !== "DELETE") {
      throw new Response("Type DELETE to confirm account deletion.", { status: 400 });
    }
    if (user.passwordHash && !(await verifyPassword(input.password ?? "", user.passwordHash))) {
      throw new Response("Password is required to delete this account.", { status: 400 });
    }

    await prisma.user.delete({ where: { id: user.id } });
    await clearUserUploadStorage(user.id);

    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);
    response.cookies.set(SESSION_COOKIE, "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    });
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
  } catch (error) {
    return apiError(error);
  }
}
