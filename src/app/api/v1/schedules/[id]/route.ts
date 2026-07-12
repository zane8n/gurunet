import { scheduleSchema } from "@/app/api/v1/schedules/route";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const input = scheduleSchema.partial().parse(await request.json());
  const result = await prisma.studySchedule.updateMany({ where: { id, userId: user.id }, data: input });
  if (!result.count) throw new Response("Schedule not found", { status: 404 });
  return Response.json({ schedule: await prisma.studySchedule.findUnique({ where: { id } }) });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  await prisma.studySchedule.deleteMany({ where: { id, userId: user.id } });
  return Response.json({ ok: true });
}
