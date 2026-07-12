import type { AppDeviceInput, TokenSet } from "@gurunet/contracts";

export type TokenStore = {
  get(): Promise<TokenSet | null>;
  set(tokens: TokenSet | null): Promise<void>;
};

export class GurunetApiError extends Error {
  constructor(public code: string, message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

export class GurunetClient {
  private refreshPromise: Promise<TokenSet> | null = null;
  constructor(private baseUrl: string, private tokens: TokenStore, private appVersion = "1.0.0") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  async request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
    const tokenSet = await this.tokens.get();
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    headers.set("X-Request-ID", crypto.randomUUID());
    headers.set("X-App-Version", this.appVersion);
    if (tokenSet) headers.set("Authorization", `Bearer ${tokenSet.accessToken}`);
    if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
    if (init.method && init.method !== "GET") headers.set("Idempotency-Key", headers.get("Idempotency-Key") ?? crypto.randomUUID());
    const response = await fetch(`${this.baseUrl}/api/v1${path}`, { ...init, headers });
    if (response.status === 401 && retry && tokenSet?.refreshToken) {
      await this.refresh(tokenSet.refreshToken);
      return this.request<T>(path, init, false);
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as { error?: { code?: string; message?: string; details?: unknown } | string };
      const structured = typeof payload.error === "object" ? payload.error : undefined;
      throw new GurunetApiError(structured?.code ?? "REQUEST_FAILED", structured?.message ?? String(payload.error ?? response.statusText), response.status, structured?.details);
    }
    return response.json() as Promise<T>;
  }

  async login(email: string, password: string, device: AppDeviceInput) {
    const result = await this.request<{ user: unknown; tokens: TokenSet }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, device }),
    }, false);
    await this.tokens.set(result.tokens);
    return result;
  }

  async logout() {
    try {
      await this.request<{ ok: boolean }>("/auth/logout", { method: "POST" }, false);
    } finally {
      await this.tokens.set(null);
    }
  }

  async clearSession() {
    await this.tokens.set(null);
  }

  private refresh(refreshToken: string) {
    if (!this.refreshPromise) {
      this.refreshPromise = fetch(`${this.baseUrl}/api/v1/auth/refresh`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refreshToken }),
      }).then(async (response) => {
        if (!response.ok) { await this.tokens.set(null); throw new GurunetApiError("SESSION_EXPIRED", "Sign in again.", 401); }
        const result = await response.json() as { tokens: TokenSet };
        await this.tokens.set(result.tokens);
        return result.tokens;
      }).finally(() => { this.refreshPromise = null; });
    }
    return this.refreshPromise;
  }
}
