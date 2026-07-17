import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import type { AppPlatform } from "@prisma/client";
import { headers } from "next/headers";
import { fromDbUser } from "@/lib/db-mappers";
import type { User } from "@/lib/domain";
import { prisma } from "@/lib/prisma";
import { getRuntimeEnv, requireRuntimeEnv } from "@/lib/runtime-env";
import { createId } from "@/lib/store";

const ACCESS_TOKEN_SECONDS = 15 * 60;
const REFRESH_TOKEN_DAYS = 90;

type AccessClaims = {
  sub: string;
  sid: string;
  platform: AppPlatform;
  iat: number;
  exp: number;
  iss: "gurunet";
  aud: "gurunet-app";
};

export type AppDeviceInput = {
  deviceId?: string;
  platform: AppPlatform;
  appVersion: string;
  timezone: string;
  locale?: string;
  pushToken?: string;
};

function tokenSecret() {
  return getRuntimeEnv("APP_TOKEN_SECRET") ?? requireRuntimeEnv("AUTH_SECRET");
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString("base64url");
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function signClaims(claims: AccessClaims) {
  const header = base64Url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify(claims));
  const signature = createHmac("sha256", tokenSecret())
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

function verifyClaims(token: string): AccessClaims | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, payload, supplied] = parts;
  const expected = createHmac("sha256", tokenSecret())
    .update(`${header}.${payload}`)
    .digest();
  const suppliedBuffer = Buffer.from(supplied, "base64url");
  if (
    expected.length !== suppliedBuffer.length ||
    !timingSafeEqual(expected, suppliedBuffer)
  ) {
    return null;
  }

  try {
    const claims = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as AccessClaims;
    const now = Math.floor(Date.now() / 1000);
    if (
      claims.exp <= now ||
      claims.iss !== "gurunet" ||
      claims.aud !== "gurunet-app" ||
      !claims.sub ||
      !claims.sid
    ) {
      return null;
    }
    return claims;
  } catch {
    return null;
  }
}

function newRefreshToken(sessionId: string) {
  return `${sessionId}.${randomBytes(48).toString("base64url")}`;
}

function accessToken(userId: string, sessionId: string, platform: AppPlatform) {
  const now = Math.floor(Date.now() / 1000);
  return signClaims({
    sub: userId,
    sid: sessionId,
    platform,
    iat: now,
    exp: now + ACCESS_TOKEN_SECONDS,
    iss: "gurunet",
    aud: "gurunet-app",
  });
}

export async function issueAppSession(userId: string, input: AppDeviceInput) {
  const deviceId = input.deviceId ?? createId("device");
  const sessionId = createId("app_session");
  const refreshToken = newRefreshToken(sessionId);
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_DAYS * 86_400_000);

  await prisma.$transaction(async (tx) => {
    await tx.deviceInstallation.upsert({
      where: { id: deviceId },
      update: {
        userId,
        platform: input.platform,
        appVersion: input.appVersion,
        timezone: input.timezone,
        locale: input.locale,
        pushToken: input.pushToken,
        notificationsEnabled: Boolean(input.pushToken),
        revokedAt: null,
        lastSeenAt: new Date(),
      },
      create: {
        id: deviceId,
        userId,
        platform: input.platform,
        appVersion: input.appVersion,
        timezone: input.timezone,
        locale: input.locale,
        pushToken: input.pushToken,
        notificationsEnabled: Boolean(input.pushToken),
      },
    });
    await tx.user.update({ where: { id: userId }, data: { timezone: input.timezone } });
    await tx.studySchedule.updateMany({
      where: { userId },
      data: { timezone: input.timezone },
    });
    await tx.appSession.create({
      data: {
        id: sessionId,
        userId,
        platform: input.platform,
        deviceId,
        refreshTokenHash: hashToken(refreshToken),
        tokenFamily: createId("family"),
        expiresAt,
      },
    });
  });

  return {
    accessToken: accessToken(userId, sessionId, input.platform),
    refreshToken,
    expiresIn: ACCESS_TOKEN_SECONDS,
    refreshExpiresAt: expiresAt.toISOString(),
    deviceId,
  };
}

export async function rotateAppSession(rawRefreshToken: string) {
  const hash = hashToken(rawRefreshToken);
  const session = await prisma.appSession.findFirst({
    where: {
      OR: [
        { refreshTokenHash: hash },
        { previousRefreshTokenHash: hash },
      ],
    },
  });
  if (!session) throw new Response("Invalid refresh token", { status: 401 });

  if (session.previousRefreshTokenHash === hash) {
    await prisma.appSession.updateMany({
      where: { tokenFamily: session.tokenFamily },
      data: { revokedAt: new Date() },
    });
    throw new Response("Refresh token reuse detected", { status: 401 });
  }
  if (session.revokedAt || session.expiresAt <= new Date()) {
    throw new Response("Refresh token expired or revoked", { status: 401 });
  }

  const nextRefreshToken = newRefreshToken(session.id);
  await prisma.appSession.update({
    where: { id: session.id },
    data: {
      previousRefreshTokenHash: session.refreshTokenHash,
      refreshTokenHash: hashToken(nextRefreshToken),
      lastUsedAt: new Date(),
    },
  });

  return {
    accessToken: accessToken(session.userId, session.id, session.platform),
    refreshToken: nextRefreshToken,
    expiresIn: ACCESS_TOKEN_SECONDS,
    refreshExpiresAt: session.expiresAt.toISOString(),
    deviceId: session.deviceId,
  };
}

export async function revokeAppSession(sessionId: string, userId: string) {
  await prisma.appSession.updateMany({
    where: { id: sessionId, userId },
    data: { revokedAt: new Date() },
  });
}

export async function revokeAllAppSessions(userId: string) {
  await prisma.appSession.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function getBearerIdentity(): Promise<{
  user: User;
  sessionId: string;
} | null> {
  const requestHeaders = await headers();
  const authorization = requestHeaders.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return null;
  const claims = verifyClaims(authorization.slice(7));
  if (!claims) return null;

  const session = await prisma.appSession.findUnique({
    where: { id: claims.sid },
    include: { user: true, device: true },
  });
  if (
    !session ||
    session.userId !== claims.sub ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    session.device.revokedAt
  ) {
    return null;
  }
  return { user: fromDbUser(session.user), sessionId: session.id };
}

export function pkceChallenge(verifier: string) {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function opaqueTokenHash(value: string) {
  return hashToken(value);
}
