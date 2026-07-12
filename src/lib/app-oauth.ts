import type { AppPlatform } from "@prisma/client";

export const appRedirects: Record<AppPlatform, string> = {
  Android: "gurunet-android://auth/callback",
  IOS: "gurunet-ios://auth/callback",
  Windows: "gurunet-windows://auth/callback",
};

export function isAllowedAppRedirect(platform: AppPlatform, value: string) {
  return value === appRedirects[platform];
}

export function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? process.env.AUTH_URL ?? "http://localhost:3000";
}
