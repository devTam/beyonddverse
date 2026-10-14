import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { prisma } from "../src/lib/prisma";

const PublishInput = z.object({ workflowRunId: z.string().uuid(), scheduledPostId: z.string().uuid() });

export const publishScheduledPost = schemaTask({
  id: "publish-scheduled-post",
  schema: PublishInput,
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000 },
  maxDuration: 900,
  run: async (payload) => {
    const post = await prisma.scheduledPost.findUniqueOrThrow({ where: { id: payload.scheduledPostId }, include: { publishedPost: true, socialAccount: true, variant: { include: { videoRender: true } } } });
    if (post.status === "CANCELED") return { canceled: true };
    if (post.status === "PUBLISHED" && post.publishedPost) return { published: true, reconciled: true };
    if (post.variant.status !== "APPROVED" || post.variant.videoRender?.status !== "SUCCEEDED") throw new Error("Publication approval or completed media is missing.");
    await prisma.$transaction([
      prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "RUNNING", startedAt: new Date() } }),
      prisma.workflowStep.update({ where: { runId_position: { runId: payload.workflowRunId, position: 1 } }, data: { status: "RUNNING", attempts: { increment: 1 }, startedAt: new Date() } }),
    ]);
    if (!post.socialAccount.encryptedToken) {
      await prisma.$transaction([
        prisma.scheduledPost.update({ where: { id: post.id }, data: { status: "MANUAL_REQUIRED" } }),
        prisma.workflowStep.update({ where: { runId_position: { runId: payload.workflowRunId, position: 1 } }, data: { status: "SUCCEEDED", completedAt: new Date() } }),
        prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "SUCCEEDED", completedAt: new Date(), output: { scheduledPostId: post.id, manualRequired: true } } }),
      ]);
      return { scheduledPostId: post.id, manualRequired: true };
    }
    const message = `Official ${post.socialAccount.platform} publisher credentials are configured but its adapter is not deployed yet.`;
    await prisma.$transaction([
      prisma.scheduledPost.update({ where: { id: post.id }, data: { status: "FAILED" } }),
      prisma.workflowStep.update({ where: { runId_position: { runId: payload.workflowRunId, position: 1 } }, data: { status: "FAILED", completedAt: new Date(), error: message } }),
      prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "FAILED", completedAt: new Date(), error: message } }),
    ]);
    throw new Error(message);
  },
});
