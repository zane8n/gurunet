import { siteConfig } from "@/lib/site";

export function GET() {
  return Response.json({
    openapi: "3.1.0",
    info: { title: "GURUnet App API", version: "1.0.0" },
    servers: [{ url: `${siteConfig.url}/api/v1` }],
    paths: {
      "/bootstrap": { get: { summary: "Aggregated signed-in app bootstrap" } },
      "/auth/login": { post: { summary: "Email/password app login" } },
      "/auth/refresh": { post: { summary: "Rotate an app refresh token" } },
      "/challenges/today": { get: { summary: "Personalized daily challenge" } },
      "/drafts/{challengeId}": { get: {}, put: {}, delete: {} },
      "/uploads": { post: { summary: "Server-mediated evidence upload" } },
      "/uploads/direct": { post: { summary: "Authorized Vercel Blob direct upload" } },
      "/social/network": { get: { summary: "Accepted network only" } },
      "/social/suggestions": { get: { summary: "Opt-in connection discovery suggestions" } },
      "/social/invitations": { get: {}, post: {} },
    },
  });
}
