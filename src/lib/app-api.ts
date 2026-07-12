import { z } from "zod";

export const appPlatformSchema = z.enum(["Android", "IOS", "Windows"]);

export const appDeviceSchema = z.object({
  deviceId: z.string().trim().min(8).max(160).optional(),
  platform: appPlatformSchema,
  appVersion: z.string().trim().min(1).max(32),
  timezone: z.string().trim().min(3).max(80),
  locale: z.string().trim().min(2).max(20).optional(),
  pushToken: z.string().trim().min(8).max(512).optional(),
});

export const minimumVersions = {
  Android: process.env.MIN_ANDROID_VERSION ?? "1.0.0",
  IOS: process.env.MIN_IOS_VERSION ?? "1.0.0",
  Windows: process.env.MIN_WINDOWS_VERSION ?? "1.0.0",
} as const;

function versionParts(value: string) {
  return value.split(".").map((part) => Number.parseInt(part, 10) || 0);
}

export function versionIsSupported(
  platform: keyof typeof minimumVersions,
  version: string,
) {
  const current = versionParts(version);
  const minimum = versionParts(minimumVersions[platform]);
  for (let index = 0; index < 3; index += 1) {
    if ((current[index] ?? 0) > (minimum[index] ?? 0)) return true;
    if ((current[index] ?? 0) < (minimum[index] ?? 0)) return false;
  }
  return true;
}

export function appApiError(
  code: string,
  message: string,
  status: number,
  details?: unknown,
) {
  return Response.json(
    { error: { code, message, details }, requestId: crypto.randomUUID() },
    { status },
  );
}
