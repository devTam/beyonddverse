import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { prisma } from "../src/lib/prisma";

const RenderInput = z.object({ workflowRunId: z.string().uuid(), renderId: z.string().uuid() });

function workerEndpoint() {
  const configured = process.env.RENDER_WORKER_URL;
  if (!configured) throw new Error("RENDER_WORKER_URL is required.");
  const url = new URL("/render", configured);
  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) throw new Error("The render worker must use HTTPS outside local development.");
  return url;
}

async function execute(payload: z.infer<typeof RenderInput>) {
  const secret = process.env.RENDER_WORKER_SECRET;
  if (!secret) throw new Error("RENDER_WORKER_SECRET is required.");
  const stepKey = { runId_position: { runId: payload.workflowRunId, position: 1 } };
  await prisma.$transaction([
    prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "RUNNING", startedAt: new Date() } }),
    prisma.workflowStep.update({ where: stepKey, data: { status: "RUNNING", attempts: { increment: 1 }, startedAt: new Date(), error: null } }),
  ]);
  try {
    const current = await prisma.videoRender.findUniqueOrThrow({ where: { id: payload.renderId } });
    if (current.status === "SUCCEEDED") return { renderId: current.id, assetId: current.assetId, reconciled: true };
    const response = await fetch(workerEndpoint(), { method: "POST", headers: { authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: JSON.stringify({ renderId: payload.renderId }), signal: AbortSignal.timeout(29 * 60 * 1_000) });
    if (!response.ok) throw new Error(`Render worker failed with HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    const parsed = z.object({ renderId: z.string().uuid(), assetId: z.string().uuid() }).parse(await response.json());
    const result = { renderId: parsed.renderId, assetId: parsed.assetId };
    await prisma.$transaction([
      prisma.workflowStep.update({ where: stepKey, data: { status: "SUCCEEDED", completedAt: new Date() } }),
      prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "SUCCEEDED", completedAt: new Date(), output: result } }),
    ]);
    return result;
  } catch (error) {
    const reconciled = await prisma.videoRender.findUnique({ where: { id: payload.renderId } });
    if (reconciled?.status === "SUCCEEDED") {
      const result = { renderId: reconciled.id, assetId: reconciled.assetId, reconciled: true };
      await prisma.$transaction([
        prisma.workflowStep.update({ where: stepKey, data: { status: "SUCCEEDED", completedAt: new Date() } }),
        prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "SUCCEEDED", completedAt: new Date(), output: result } }),
      ]);
      return result;
    }
    const message = error instanceof Error ? error.message : "Unknown render failure";
    await prisma.$transaction([
      prisma.workflowStep.update({ where: stepKey, data: { status: "FAILED", completedAt: new Date(), error: message } }),
      prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "FAILED", completedAt: new Date(), error: message } }),
    ]);
    throw error;
  }
}

export const renderLongFormVideo = schemaTask({ id: "render-long-form-video", schema: RenderInput, retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000 }, maxDuration: 1_800, run: execute });
export const renderShortFormVideo = schemaTask({ id: "render-short-form-video", schema: RenderInput, retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000 }, maxDuration: 1_800, run: execute });
