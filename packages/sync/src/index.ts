import type { GurunetClient } from "@gurunet/api-client";
export type OutboxItem = { id: string; path: string; method: "POST"|"PUT"|"PATCH"|"DELETE"; body?: unknown; attempts: number; createdAt: string };
export type OutboxStore = { list(): Promise<OutboxItem[]>; save(item: OutboxItem): Promise<void>; remove(id: string): Promise<void> };
export async function flushOutbox(client: GurunetClient, store: OutboxStore) {
  const results: { id: string; status: "sent"|"conflict"|"retry" }[] = [];
  for (const item of await store.list()) {
    try {
      await client.request(item.path, { method: item.method, body: item.body ? JSON.stringify(item.body) : undefined, headers: { "Idempotency-Key": item.id } });
      await store.remove(item.id); results.push({ id: item.id, status: "sent" });
    } catch (error) {
      results.push({ id: item.id, status: error instanceof Error && "status" in error && error.status === 409 ? "conflict" : "retry" });
    }
  }
  return results;
}
export function preserveDraftConflict<T>(local: T, server: T) { return { local, server, requiresSelection: true as const }; }
