import { invoke } from "@tauri-apps/api/core";
import { appDataDir } from "@tauri-apps/api/path";
import { Stronghold } from "@tauri-apps/plugin-stronghold";
import { GurunetClient, type TokenStore } from "@gurunet/api-client";
import type { AppDeviceInput, TokenSet } from "@gurunet/contracts";

let vaultPromise: ReturnType<typeof openVault> | null = null;

async function openVault() {
  const path = `${await appDataDir()}gurunet.hold`;
  const password = await invoke<string>("vault_password");
  const stronghold = await Stronghold.load(path, password);
  let client;
  try {
    client = await stronghold.loadClient("app-session");
  } catch {
    client = await stronghold.createClient("app-session");
  }
  return { stronghold, store: client.getStore() };
}

async function vault() {
  return vaultPromise ??= openVault();
}

const tokens: TokenStore = {
  async get() {
    const { store } = await vault();
    const data = await store.get("tokens");
    return data ? JSON.parse(new TextDecoder().decode(new Uint8Array(data))) as TokenSet : null;
  },
  async set(value) {
    const { stronghold, store } = await vault();
    if (value) await store.insert("tokens", Array.from(new TextEncoder().encode(JSON.stringify(value))));
    else await store.remove("tokens");
    await stronghold.save();
  },
};

export const api = new GurunetClient(import.meta.env.VITE_API_URL ?? "https://gurunet.uk", tokens, "1.0.0");

export async function windowsDeviceInput(): Promise<AppDeviceInput> {
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const locale = Intl.DateTimeFormat().resolvedOptions().locale;
  const deviceId = await invoke<string>("device_id");
  return { deviceId, platform: "Windows", appVersion: "1.0.0", timezone, locale };
}

export async function signIn(email: string, password: string) {
  return api.login(email, password, await windowsDeviceInput());
}
