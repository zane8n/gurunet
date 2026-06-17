export function requireAdminSecret(request: Request) {
  const secret = process.env.SUPPORT_ADMIN_SECRET ?? process.env.IMPORT_SECRET;
  if (!secret) {
    throw new Response("Admin support API is not configured", { status: 503 });
  }
  const provided =
    request.headers.get("x-support-secret") ??
    request.headers.get("x-import-secret");
  if (provided !== secret) throw new Response("Unauthorized", { status: 401 });
  return "support-admin";
}
