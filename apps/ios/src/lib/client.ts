import * as SecureStore from "expo-secure-store";
import { GurunetClient, type TokenStore } from "@gurunet/api-client";
import type { AppDeviceInput, TokenSet } from "@gurunet/contracts";

const key = "gurunet.ios.tokens";
const deviceKey = "gurunet.ios.device";
const keychainAccessible = SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY;

const store: TokenStore = {
  async get() {
    const value = await SecureStore.getItemAsync(key, { keychainAccessible });
    return value ? JSON.parse(value) as TokenSet : null;
  },
  async set(tokens) {
    if (tokens) await SecureStore.setItemAsync(key, JSON.stringify(tokens), { keychainAccessible });
    else await SecureStore.deleteItemAsync(key);
  },
};

export const api = new GurunetClient(process.env.EXPO_PUBLIC_API_URL ?? "https://gurunet.uk", store, "1.0.0");

export async function iosDeviceInput(pushToken?: string): Promise<AppDeviceInput> {
  let deviceId = await SecureStore.getItemAsync(deviceKey, { keychainAccessible });
  if (!deviceId) {
    deviceId = `ios-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await SecureStore.setItemAsync(deviceKey, deviceId, { keychainAccessible });
  }
  const resolved = Intl.DateTimeFormat().resolvedOptions();
  return {
    deviceId,
    platform: "IOS",
    appVersion: "1.0.0",
    timezone: resolved.timeZone || "UTC",
    locale: resolved.locale,
    pushToken,
  };
}

export async function signIn(email: string, password: string) {
  return api.login(email, password, await iosDeviceInput());
}
