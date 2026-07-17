import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth as nextAuth } from "@/auth";
import type { Session, User } from "@/lib/domain";
import { fromDbSession, fromDbUser } from "@/lib/db-mappers";
import { prisma } from "@/lib/prisma";
import { createId } from "@/lib/store";
import { isValidTimezone, nowIso } from "@/lib/time";
import { getBearerIdentity } from "@/lib/app-auth";

export const SESSION_COOKIE = "gurunet_session";
const SESSION_DAYS = 30;

export const signupSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.string().trim().email().max(160).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(160),
  timezone: z.string().trim().min(3).max(80).refine(isValidTimezone, {
    message: "Select a valid timezone.",
  }).default("Africa/Johannesburg"),
});

export const loginSchema = z.object({
  email: z.string().trim().email().transform((value) => value.toLowerCase()),
  password: z.string().min(1),
});

export function publicUser(user: User) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    timezone: user.timezone,
    pisScore: user.pisScore,
    ertBalance: user.ertBalance,
    currentStreak: user.currentStreak,
    continuityCredits: user.continuityCredits,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

function sessionExpiresAt() {
  return new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
}

export async function pruneExpiredLocalSessions() {
  await prisma.localSession.deleteMany({
    where: { expiresAt: { lte: new Date() } },
  });
}

export async function createSession(userId: string) {
  await pruneExpiredLocalSessions();

  const session = await prisma.localSession.create({
    data: {
      id: createId("ses"),
      userId,
      expiresAt: new Date(sessionExpiresAt()),
      createdAt: new Date(nowIso()),
    },
  });

  return fromDbSession(session);
}

export function setSessionCookie(response: NextResponse, session: Session) {
  response.cookies.set(SESSION_COOKIE, session.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(session.expiresAt),
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export async function getCurrentUser() {
  const bearer = await getBearerIdentity();
  if (bearer) return bearer.user;

  const cookieStore = await cookies();
  const sessionId = cookieStore.get(SESSION_COOKIE)?.value;
  if (sessionId) {
    const session = await prisma.localSession.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });
    if (session && session.expiresAt > new Date()) {
      return fromDbUser(session.user);
    }
    if (session) await prisma.localSession.deleteMany({ where: { id: sessionId } });
  }

  return getCurrentAuthJsUser();
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }
  return user;
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 12);
}

async function getCurrentAuthJsUser() {
  try {
    const session = await nextAuth();
    const authUser = session?.user as
      | {
          id?: string;
          name?: string | null;
          email?: string | null;
          image?: string | null;
        }
      | undefined;

    if (!authUser?.email) return null;
    const email = authUser.email;

    const user = await prisma.user.upsert({
      where: { email },
      update: {
        name: authUser.name ?? undefined,
        image: authUser.image ?? undefined,
      },
      create: {
        id: authUser.id ?? createId("usr"),
        name: authUser.name ?? email.split("@")[0],
        email,
        passwordHash: "",
        timezone: process.env.APP_TIMEZONE || "Africa/Johannesburg",
      },
    });
    return fromDbUser(user);
  } catch {
    return null;
  }
}
