import { z } from "zod";
import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { difficultyForPis } from "@/lib/challenges";
import { prisma } from "@/lib/prisma";

const localTimeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const preferencesSchema = z.object({
  restDay: z.number().int().min(0).max(6).optional(),
  challenge: z.object({
    durationMinutes: z.number().int().min(15).max(180).optional(),
    difficultyFloor: z.enum(["Guided", "Normal", "Advanced", "Production", "Expert"]).optional(),
    topicFocus: z.string().trim().max(120).optional(),
    recoveryMode: z.boolean().optional(),
    teamMode: z.boolean().optional(),
  }).optional(),
  notifications: z.object({
    challengeAvailable: z.boolean().optional(),
    studyWindowReminder: z.boolean().optional(),
    deadlineWarning: z.boolean().optional(),
    correctionReady: z.boolean().optional(),
    recoveryPreview: z.boolean().optional(),
    socialInvitations: z.boolean().optional(),
    studyWindowLocalTime: localTimeSchema.optional(),
    deadlineOffsetMinutes: z.number().int().min(15).max(360).optional(),
    quietStartLocalTime: localTimeSchema.optional(),
    quietEndLocalTime: localTimeSchema.optional(),
  }).optional(),
  social: z.object({
    discoverable: z.boolean().optional(),
    allowEmailInvites: z.boolean().optional(),
  }).optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    return json(await readLearnerPreferences(user.id, user.pisScore));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const input = preferencesSchema.parse(await request.json());
    const profile = await prisma.userStudyProfile.findUnique({ where: { userId: user.id } });

    if (input.restDay !== undefined && !profile) {
      throw new Response("Complete the study profile before selecting a weekly rest day.", { status: 409 });
    }

    await prisma.$transaction(async (tx) => {
      if (input.restDay !== undefined) {
        await tx.userStudyProfile.update({
          where: { userId: user.id },
          data: { restDay: input.restDay },
        });
      }

      if (input.challenge) {
        const track = profile?.primaryDiscipline ?? "networking";
        await tx.userChallengeSettings.upsert({
          where: { userId: user.id },
          update: {
            ...input.challenge,
            topicFocus: input.challenge.topicFocus || null,
          },
          create: {
            userId: user.id,
            track,
            durationMinutes: input.challenge.durationMinutes ?? 45,
            difficultyFloor: input.challenge.difficultyFloor ?? difficultyForPis(user.pisScore),
            topicFocus: input.challenge.topicFocus || null,
            recoveryMode: input.challenge.recoveryMode ?? false,
            teamMode: input.challenge.teamMode ?? false,
          },
        });
      }

      if (input.notifications) {
        await tx.notificationPreference.upsert({
          where: { userId: user.id },
          update: input.notifications,
          create: { userId: user.id, ...input.notifications },
        });
      }

      if (input.social) {
        await tx.userSocialSettings.upsert({
          where: { userId: user.id },
          update: input.social,
          create: { userId: user.id, ...input.social },
        });
      }
    });

    return json(await readLearnerPreferences(user.id, user.pisScore));
  } catch (error) {
    return apiError(error);
  }
}

async function readLearnerPreferences(userId: string, pisScore: number) {
  const [profile, storedChallenge, notifications, social, schedules] = await Promise.all([
    prisma.userStudyProfile.findUnique({ where: { userId } }),
    prisma.userChallengeSettings.findUnique({ where: { userId } }),
    prisma.notificationPreference.upsert({
      where: { userId },
      update: {},
      create: { userId },
    }),
    prisma.userSocialSettings.upsert({
      where: { userId },
      update: {},
      create: { userId },
    }),
    prisma.studySchedule.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
  ]);

  return {
    studyProfile: profile
      ? {
          primaryDiscipline: profile.primaryDiscipline,
          rankedTopics: profile.rankedTopics,
          preferredFormats: profile.preferredFormats,
          restDay: profile.restDay,
        }
      : null,
    challenge: storedChallenge ?? {
      track: profile?.primaryDiscipline ?? "networking",
      durationMinutes: 45,
      difficultyFloor: difficultyForPis(pisScore),
      topicFocus: null,
      recoveryMode: false,
      teamMode: false,
    },
    notifications,
    social,
    schedules: schedules.map((schedule) => ({
      ...schedule,
      oneOffAt: schedule.oneOffAt?.toISOString() ?? null,
      createdAt: schedule.createdAt.toISOString(),
      updatedAt: schedule.updatedAt.toISOString(),
    })),
  };
}
