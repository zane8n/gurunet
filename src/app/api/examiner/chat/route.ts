import { apiError, json } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import {
  examinerChatSchema,
  getExaminerMessages,
  sendExaminerMessage,
} from "@/lib/app-service";

export async function GET() {
  try {
    const user = await requireUser();
    const messages = await getExaminerMessages(user);
    return json({ messages });
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
