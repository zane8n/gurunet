import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";

const ADMIN_CREDENTIAL_ID = "support";
const DEFAULT_SUPPORT_PASSWORD = "admin admin";

export const adminPasswordChangeSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(8).max(200),
});

export async function requireAdminSecret(request: Request) {
  const secret = process.env.SUPPORT_ADMIN_SECRET ?? process.env.IMPORT_SECRET;
  const provided =
    request.headers.get("x-support-secret") ??
    request.headers.get("x-import-secret");
  if (!provided) throw new Response("Unauthorized", { status: 401 });
  if (secret) {
    if (provided !== secret) throw new Response("Unauthorized", { status: 401 });
    return "support-admin";
  }
  const credential = await prisma.adminCredential.findUnique({
    where: { id: ADMIN_CREDENTIAL_ID },
  });
  if (credential) {
    const ok = await bcrypt.compare(provided, credential.passwordHash);
    if (!ok) throw new Response("Unauthorized", { status: 401 });
    return "support-admin";
  }
  if (provided !== DEFAULT_SUPPORT_PASSWORD) throw new Response("Unauthorized", { status: 401 });
  return "support-admin";
}

export async function changeAdminPassword(currentPassword: string, newPassword: string) {
  if (process.env.SUPPORT_ADMIN_SECRET) {
    throw new Response("Password is controlled by SUPPORT_ADMIN_SECRET in the environment.", { status: 409 });
  }
  const credential = await prisma.adminCredential.findUnique({
    where: { id: ADMIN_CREDENTIAL_ID },
  });
  const currentOk = credential
    ? await bcrypt.compare(currentPassword, credential.passwordHash)
    : currentPassword === DEFAULT_SUPPORT_PASSWORD;
  if (!currentOk) throw new Response("Current password is incorrect", { status: 401 });

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.adminCredential.upsert({
    where: { id: ADMIN_CREDENTIAL_ID },
    update: { passwordHash },
    create: { id: ADMIN_CREDENTIAL_ID, passwordHash },
  });
  return { ok: true };
}
