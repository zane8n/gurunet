import * as SecureStore from "expo-secure-store";
import { GurunetClient, type TokenStore } from "@gurunet/api-client";
import type { AppDeviceInput, TokenSet } from "@gurunet/contracts";

const key = "gurunet.android.tokens";
const deviceKey = "gurunet.android.device";
export const tokenStore: TokenStore = {
  async get() { const value = await SecureStore.getItemAsync(key); return value ? JSON.parse(value) as TokenSet : null; },
  async set(tokens) { if (tokens) await SecureStore.setItemAsync(key, JSON.stringify(tokens)); else await SecureStore.deleteItemAsync(key); },
};
export const api = new GurunetClient(process.env.EXPO_PUBLIC_API_URL ?? "https://gurunet.uk", tokenStore, "1.0.0");

export async function androidDeviceInput(pushToken?: string): Promise<AppDeviceInput> {
  let deviceId = await SecureStore.getItemAsync(deviceKey);
  if (!deviceId) {
    deviceId = `android-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await SecureStore.setItemAsync(deviceKey, deviceId);
  }
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  return {
    deviceId,
    platform: "Android",
    appVersion: "1.0.0",
    timezone: resolved.timeZone || "UTC",
    locale: resolved.locale,
    pushToken,
  };
}

export async function signIn(email: string, password: string) {
  return api.login(email, password, await androidDeviceInput());
}
