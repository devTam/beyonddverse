import { NextResponse } from "next/server";
import { runs } from "@trigger.dev/sdk";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";

export async function GET(request: Request, context: RouteContext<"/api/workflows/[id]">) {
  await requireUser(request.headers);
  const { id } = await context.params;
  const workflowId = z.string().uuid().parse(id);
  let workflow = await prisma.workflowRun.findUnique({
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
  const output = workflow.output && typeof workflow.output === "object" && !Array.isArray(workflow.output) ? workflow.output as Record<string, unknown> : null;
  const triggerRunId = typeof output?.triggerRunId === "string" ? output.triggerRunId : null;
  if (triggerRunId && ["QUEUED", "RUNNING", "WAITING"].includes(workflow.status)) {
    try {
      const remote = await runs.retrieve(triggerRunId);
      const failed = ["CANCELED", "CRASHED", "EXPIRED", "FAILED", "SYSTEM_FAILURE", "TIMED_OUT"].includes(remote.status);
      if (failed) {
        const error = `Trigger.dev run ended with ${remote.status}. Retry this workflow after resolving the reported task error.`;
        await prisma.$transaction([
          prisma.workflowRun.update({ where: { id: workflow.id }, data: { status: "FAILED", error, completedAt: remote.finishedAt ?? new Date() } }),
          prisma.workflowStep.updateMany({ where: { runId: workflow.id, status: { in: ["QUEUED", "RUNNING", "WAITING"] } }, data: { status: "FAILED", error, completedAt: remote.finishedAt ?? new Date() } }),
        ]);
        workflow = { ...workflow, status: "FAILED", error, completedAt: remote.finishedAt ?? new Date(), steps: workflow.steps.map((step) => ["QUEUED", "RUNNING", "WAITING"].includes(step.status) ? { ...step, status: "FAILED", error } : step) };
      }
    } catch {
      // Preserve the durable database state when Trigger.dev is temporarily unavailable.
    }
  }
  return NextResponse.json(workflow);
}
