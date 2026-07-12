import { z } from "zod";
import { appDeviceSchema, appApiError, versionIsSupported } from "@/lib/app-api";
import { issueAppSession } from "@/lib/app-auth";
import { loginSchema, publicUser, verifyPassword } from "@/lib/auth";
import { fromDbUser } from "@/lib/db-mappers";
import { prisma } from "@/lib/prisma";

const schema = loginSchema.extend({ device: appDeviceSchema });

export async function POST(request: Request) {
  try {
    const input = schema.parse(await request.json());
    if (!versionIsSupported(input.device.platform, input.device.appVersion)) {
      return appApiError("APP_UPDATE_REQUIRED", "Update GURUnet to continue.", 426, {
        minimumVersion: process.env[`MIN_${input.device.platform.toUpperCase()}_VERSION`] ?? "1.0.0",
      });
    }
    const dbUser = await prisma.user.findUnique({ where: { email: input.email } });
    const user = dbUser ? fromDbUser(dbUser) : null;
    if (!user || !(await verifyPassword(input.password, user.passwordHash))) {
      return appApiError("INVALID_CREDENTIALS", "Invalid email or password.", 401);
    }
    const tokens = await issueAppSession(user.id, input.device);
    return Response.json({ user: publicUser(user), tokens });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return appApiError("VALIDATION_FAILED", "Check the login details.", 400, error.issues);
    }
    return appApiError("LOGIN_FAILED", "Unable to sign in right now.", 500);
  }
}
