import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { prisma } from "../src/lib/prisma";
import { createSignedDeliveryUrl } from "../src/lib/storage/cloudinary";
import { decryptSecret, encryptSecret } from "../src/lib/security/encryption";
import { oauthProvider, publisherFor, type SupportedProvider } from "../src/lib/publishing";
import type { Prisma } from "@prisma/client";

const PublishInput = z.object({ workflowRunId: z.string().uuid(), scheduledPostId: z.string().uuid() });
const PublishedInput = z.object({ publishedPostId: z.string().uuid() });

export const publishScheduledPost = schemaTask({
  id: "publish-scheduled-post",
  schema: PublishInput,
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000 },
  maxDuration: 900,
  run: async (payload) => {
    const post = await prisma.scheduledPost.findUniqueOrThrow({ where: { id: payload.scheduledPostId }, include: { publishedPost: true, attempts: true, socialAccount: true, variant: { include: { videoRender: { include: { asset: true } } } } } });
    if (post.status === "CANCELED") return { canceled: true };
    if (post.status === "PUBLISHED" && post.publishedPost) return { published: true, reconciled: true };
    if (post.variant.status !== "APPROVED" || post.variant.videoRender?.status !== "SUCCEEDED" || !post.variant.videoRender.asset) throw new Error("Publication approval or completed media is missing.");
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
    const attemptNumber = post.attempts.length + 1;
    const attempt = await prisma.publicationAttempt.create({ data: { scheduledPostId: post.id, attempt: attemptNumber, status: "RUNNING", request: { platform: post.socialAccount.platform, variantId: post.variantId } } });
    try {
      let accessToken = decryptSecret(post.socialAccount.encryptedToken);
      if (post.socialAccount.tokenExpiresAt && post.socialAccount.tokenExpiresAt <= new Date(Date.now() + 5 * 60_000) && post.socialAccount.encryptedRefreshToken) {
        const provider = post.socialAccount.platform === "YOUTUBE" ? "youtube" : post.socialAccount.platform === "TIKTOK" ? "tiktok" : "meta";
        const refreshed = await oauthProvider(provider as SupportedProvider).refresh(decryptSecret(post.socialAccount.encryptedRefreshToken));
        accessToken = refreshed.accessToken;
        await prisma.socialAccount.update({ where: { id: post.socialAccount.id }, data: { encryptedToken: encryptSecret(accessToken), encryptedRefreshToken: refreshed.refreshToken ? encryptSecret(refreshed.refreshToken) : undefined, tokenExpiresAt: refreshed.expiresAt } });
      }
      const metadata = post.variant.metadata as Record<string, unknown>;
      const copy = (metadata.copy ?? {}) as Record<string, unknown>;
      const asset = post.variant.videoRender.asset;
      const result = await publisherFor(post.socialAccount).publish({
        url: createSignedDeliveryUrl(asset), bytes: Number(asset.bytes), mimeType: asset.mimeType,
        title: String(copy.title ?? metadata.title ?? "Beyond the Verse"),
        description: String(copy.caption ?? metadata.description ?? "Beyond the Verse Bible teaching"),
        scheduledAt: post.scheduledAt > new Date() ? post.scheduledAt : undefined,
      }, accessToken);
      await prisma.$transaction([
        prisma.publishedPost.create({ data: { scheduledPostId: post.id, externalId: result.externalId, url: result.url, publishedAt: new Date(), remoteStatus: result.status, rawResponse: result.raw as Prisma.InputJsonValue } }),
        prisma.scheduledPost.update({ where: { id: post.id }, data: { status: "PUBLISHED" } }),
        prisma.publicationAttempt.update({ where: { id: attempt.id }, data: { status: "SUCCEEDED", completedAt: new Date(), response: result.raw as Prisma.InputJsonValue } }),
        prisma.workflowStep.update({ where: { runId_position: { runId: payload.workflowRunId, position: 1 } }, data: { status: "SUCCEEDED", completedAt: new Date() } }),
        prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "SUCCEEDED", completedAt: new Date(), output: { scheduledPostId: post.id, externalId: result.externalId, url: result.url } } }),
      ]);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown publisher failure";
      await prisma.$transaction([
        prisma.scheduledPost.update({ where: { id: post.id }, data: { status: "FAILED" } }),
        prisma.publicationAttempt.update({ where: { id: attempt.id }, data: { status: "FAILED", completedAt: new Date(), error: message } }),
        prisma.workflowStep.update({ where: { runId_position: { runId: payload.workflowRunId, position: 1 } }, data: { status: "FAILED", completedAt: new Date(), error: message } }),
        prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "FAILED", completedAt: new Date(), error: message } }),
        prisma.operationalAlert.create({ data: { severity: "ERROR", category: "PUBLISHING", message, entityType: "ScheduledPost", entityId: post.id } }),
      ]);
      throw error;
    }
  },
});

export const reconcilePublishedPost = schemaTask({
  id: "reconcile-published-post",
  schema: PublishedInput,
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000 },
  run: async ({ publishedPostId }) => {
    const post = await prisma.publishedPost.findUniqueOrThrow({ where: { id: publishedPostId }, include: { scheduledPost: { include: { socialAccount: true } } } });
    const account = post.scheduledPost.socialAccount;
    if (!account.encryptedToken) throw new Error("The publication account is disconnected.");
    const result = await publisherFor(account).reconcile(post.externalId, decryptSecret(account.encryptedToken));
    await prisma.publishedPost.update({ where: { id: post.id }, data: { remoteStatus: result.status, lastReconciledAt: new Date(), rawResponse: result.raw as Prisma.InputJsonValue } });
    return result;
  },
});

export const collectPublicationAnalytics = schemaTask({
  id: "collect-publication-analytics",
  schema: PublishedInput,
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 5_000, maxTimeoutInMs: 60_000 },
  run: async ({ publishedPostId }) => {
    const post = await prisma.publishedPost.findUniqueOrThrow({ where: { id: publishedPostId }, include: { scheduledPost: { include: { socialAccount: true } } } });
    const account = post.scheduledPost.socialAccount;
    if (!account.encryptedToken) throw new Error("The publication account is disconnected.");
    const result = await publisherFor(account).analytics(post.externalId, decryptSecret(account.encryptedToken));
    return prisma.analyticsSnapshot.create({ data: { publishedPostId: post.id, capturedAt: new Date(), metrics: result.metrics as Prisma.InputJsonValue, raw: result.raw as Prisma.InputJsonValue } });
  },
});
