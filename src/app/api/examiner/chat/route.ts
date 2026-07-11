import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import {
  examinerChatSchema,
  getExaminerMessages,
  getExaminerSessions,
  sendExaminerMessage,
} from "@/lib/app-service";

export async function GET(request: Request) {
  try {
    const user = await requireUser();
    const challengeId = new URL(request.url).searchParams.get("challengeId") ?? undefined;
    const activeChallengeId = new URL(request.url).searchParams.get("activeChallengeId") ?? challengeId;
    const [messages, sessions] = await Promise.all([
      getExaminerMessages(user, challengeId),
      getExaminerSessions(user, activeChallengeId),
    ]);
    return json({ messages, sessions });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = examinerChatSchema.parse(await request.json());
    const result = await sendExaminerMessage(user, input);
    return json(result, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
