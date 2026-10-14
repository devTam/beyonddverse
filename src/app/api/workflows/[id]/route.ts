import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET(request: Request, context: RouteContext<"/api/workflows/[id]">) {
  await requireUser(request.headers);
  const { id } = await context.params;
  const workflowId = z.string().uuid().parse(id);
  const workflow = await prisma.workflowRun.findUnique({
    where: { id: workflowId },
    select: {
      id: true,
      type: true,
      status: true,
      error: true,
      startedAt: true,
      completedAt: true,
      output: true,
      steps: { orderBy: { position: "asc" }, select: { name: true, position: true, status: true, attempts: true, error: true } },
    },
  });
  if (!workflow) return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  return NextResponse.json(workflow);
}
