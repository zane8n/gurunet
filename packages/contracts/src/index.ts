import { z } from "zod";

export const platformSchema = z.enum(["Android", "IOS", "Windows"]);
export const difficultySchema = z.enum(["Guided", "Normal", "Advanced", "Production", "Expert"]);
export const friendshipStatusSchema = z.enum(["Pending", "Accepted", "Declined", "Cancelled", "Blocked"]);

export const appDeviceSchema = z.object({
  deviceId: z.string().min(8).max(160).optional(),
  platform: platformSchema,
  appVersion: z.string().min(1).max(32),
  timezone: z.string().min(3).max(80),
  locale: z.string().min(2).max(20).optional(),
  pushToken: z.string().min(8).max(512).optional(),
});

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string(), details: z.unknown().optional() }),
  requestId: z.string().optional(),
});

export const challengeSchema = z.object({
  id: z.string(), dateKey: z.string(), title: z.string(), topic: z.string(),
  difficulty: difficultySchema, scenario: z.string(), objective: z.string(),
  constraints: z.array(z.string()), allowedTools: z.array(z.string()),
  expectedAnswerFormat: z.string(), submissionRequirements: z.array(z.string()),
  deadlineAt: z.string(), status: z.string(), isRecovery: z.boolean(), isPressure: z.boolean(),
});

export const draftSchema = z.object({
  id: z.string(), challengeId: z.string(), body: z.string(),
  attachmentIds: z.array(z.string()), revision: z.number().int(),
  deviceId: z.string().nullable().optional(), updatedAt: z.coerce.date(),
});

export const connectionProfileSchema = z.object({
  id: z.string(), name: z.string(), handle: z.string(), preferredProfession: z.string(),
  primaryDiscipline: z.string(), reasons: z.array(z.string()).optional(),
  pisScore: z.number().optional(), currentStreak: z.number().optional(), latestScore: z.number().nullable().optional(),
});

export const tokenSetSchema = z.object({
  accessToken: z.string(), refreshToken: z.string(), expiresIn: z.number(),
  refreshExpiresAt: z.string(), deviceId: z.string(),
});

export type Platform = z.infer<typeof platformSchema>;
export type AppDeviceInput = z.infer<typeof appDeviceSchema>;
export type ChallengeDto = z.infer<typeof challengeSchema>;
export type DraftDto = z.infer<typeof draftSchema>;
export type ConnectionProfileDto = z.infer<typeof connectionProfileSchema>;
export type TokenSet = z.infer<typeof tokenSetSchema>;

export function openApiDocument(server = "https://gurunet.uk") {
  return {
    openapi: "3.1.0",
    info: { title: "GURUnet App API", version: "1.0.0" },
    servers: [{ url: `${server}/api/v1` }],
    paths: {
      "/bootstrap": { get: { summary: "Aggregated signed-in app bootstrap" } },
      "/auth/login": { post: { summary: "Email/password app login" } },
      "/auth/refresh": { post: { summary: "Rotate an app refresh token" } },
      "/challenges/today": { get: { summary: "Personalized daily challenge" } },
      "/drafts/{challengeId}": { get: {}, put: {}, delete: {} },
      "/social/network": { get: { summary: "Accepted network only" } },
    },
  } as const;
}
