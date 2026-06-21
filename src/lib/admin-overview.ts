import { prisma } from "@/lib/prisma";
import { siteConfig } from "@/lib/site";

export async function getAdminOverview() {
  const [
    users,
    studyProfiles,
    challenges,
    submissions,
    submissionAttachments,
    grades,
    notebookEntries,
    friendships,
    marketplaceChallenges,
    cohortChallenges,
    aiJobs,
    aiUsage,
    sessions,
    localSessions,
    adminCredentials,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.userStudyProfile.count(),
    prisma.challenge.count(),
    prisma.submission.count(),
    prisma.submissionAttachment.count(),
    prisma.grade.count(),
    prisma.notebookEntry.count(),
    prisma.friendship.count(),
    prisma.marketplaceChallenge.count(),
    prisma.cohortChallenge.count(),
    prisma.aiJob.count(),
    prisma.aiUsage.count(),
    prisma.session.count(),
    prisma.localSession.count(),
    prisma.adminCredential.count(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    site: {
      name: siteConfig.name,
      url: siteConfig.url,
      environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "local",
      vercel: process.env.VERCEL === "1",
    },
    counts: {
      users,
      studyProfiles,
      challenges,
      submissions,
      submissionAttachments,
      grades,
      notebookEntries,
      friendships,
      marketplaceChallenges,
      cohortChallenges,
      aiJobs,
      aiUsage,
      sessions,
      localSessions,
      adminCredentials,
    },
    readiness: [
      readiness("Database", true, "Prisma can query the application tables."),
      readiness(
        "Admin password",
        adminCredentials > 0 || Boolean(process.env.SUPPORT_ADMIN_SECRET || process.env.IMPORT_SECRET),
        adminCredentials > 0
          ? "Stored admin credential is active."
          : process.env.SUPPORT_ADMIN_SECRET || process.env.IMPORT_SECRET
            ? "Environment secret is active."
            : "Using first-run default. Change it after deployment.",
      ),
      readiness(
        "OpenAI challenge generation",
        Boolean(process.env.OPENAI_API_KEY) && process.env.OPENAI_CHALLENGE_ENABLED !== "false",
        process.env.OPENAI_API_KEY
          ? `Configured with ${process.env.OPENAI_CHALLENGE_MODEL || "default challenge model"}.`
          : "Missing OPENAI_API_KEY.",
      ),
      readiness(
        "OpenAI critique",
        Boolean(process.env.OPENAI_API_KEY) && process.env.OPENAI_CRITIQUE_ENABLED !== "false",
        process.env.OPENAI_API_KEY
          ? `Configured with ${process.env.OPENAI_CRITIQUE_MODEL || "default critique model"}.`
          : "Missing OPENAI_API_KEY.",
      ),
      readiness(
        "DeepSeek support calls",
        Boolean(process.env.DEEPSEEK_API_KEY),
        process.env.DEEPSEEK_API_KEY
          ? "Configured for examiner, summaries, and verification fallbacks."
          : "Missing DEEPSEEK_API_KEY. Non-challenge AI may use deterministic fallbacks.",
      ),
      readiness(
        "Google auth",
        Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
        process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET
          ? "Google sign-in is configured."
          : "Email/password remains available. Google credentials are missing.",
      ),
    ],
    freshStart: users === 0 && challenges === 0 && submissions === 0 && grades === 0,
  };
}

function readiness(name: string, ok: boolean, detail: string) {
  return {
    name,
    ok,
    detail,
  };
}
