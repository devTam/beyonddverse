import { schedules } from "@trigger.dev/sdk";
import { prisma } from "../src/lib/prisma";
import { decryptSecret, encryptSecret } from "../src/lib/security/encryption";
import { oauthProvider, type SupportedProvider } from "../src/lib/publishing";
import { collectPublicationAnalytics, reconcilePublishedPost } from "./publishing";
import { deleteMedia } from "../src/lib/storage/cloudinary";

export const reconcileAndCollect = schedules.task({
  id: "reconcile-publications-and-collect-analytics",
  cron: "0 */6 * * *",
  maxDuration: 1_800,
  run: async () => {
    const posts = await prisma.publishedPost.findMany({ take: 100, orderBy: { lastReconciledAt: { sort: "asc", nulls: "first" } } });
    for (const post of posts) {
      await reconcilePublishedPost.triggerAndWait({ publishedPostId: post.id });
      await collectPublicationAnalytics.triggerAndWait({ publishedPostId: post.id });
    }
    await prisma.rateLimitEntry.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return { reconciled: posts.length };
  },
});

export const refreshSocialTokens = schedules.task({
  id: "refresh-expiring-social-tokens",
  cron: "15 */6 * * *",
  maxDuration: 900,
  run: async () => {
    const accounts = await prisma.socialAccount.findMany({ where: { encryptedRefreshToken: { not: null }, disconnectedAt: null, tokenExpiresAt: { lte: new Date(Date.now() + 24 * 60 * 60_000) } } });
    for (const account of accounts) {
      try {
        const provider: SupportedProvider = account.platform === "YOUTUBE" ? "youtube" : account.platform === "TIKTOK" ? "tiktok" : account.platform === "X" ? "x" : "meta";
        const refreshed = await oauthProvider(provider).refresh(decryptSecret(account.encryptedRefreshToken!));
        await prisma.socialAccount.update({ where: { id: account.id }, data: { encryptedToken: encryptSecret(refreshed.accessToken), encryptedRefreshToken: refreshed.refreshToken ? encryptSecret(refreshed.refreshToken) : undefined, tokenExpiresAt: refreshed.expiresAt } });
      } catch (error) {
        await prisma.operationalAlert.create({ data: { severity: "ERROR", category: "TOKEN_REFRESH", message: error instanceof Error ? error.message : "Token refresh failed", entityType: "SocialAccount", entityId: account.id } });
      }
    }
    return { processed: accounts.length };
  },
});

export const cleanupOrphanedAssets = schedules.task({
  id: "cleanup-orphaned-media-assets",
  cron: "30 3 * * *",
  maxDuration: 900,
  run: async () => {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60_000);
    const assets = await prisma.asset.findMany({
      where: { createdAt: { lt: cutoff }, status: { in: ["DRAFT", "REJECTED"] }, sourceFor: { none: {} }, usages: { none: {} }, narrations: { none: {} }, videoRenders: { none: {} } },
      take: 100,
      orderBy: { createdAt: "asc" },
    });
    let deleted = 0;
    for (const asset of assets) {
      try {
        await deleteMedia(asset);
        await prisma.asset.delete({ where: { id: asset.id } });
        deleted++;
      } catch (error) {
        await prisma.operationalAlert.create({ data: { severity: "WARNING", category: "ASSET_CLEANUP", message: error instanceof Error ? error.message : "Asset cleanup failed", entityType: "Asset", entityId: asset.id } });
      }
    }
    return { examined: assets.length, deleted };
  },
});

export const reconcileRenderJobs = schedules.task({
  id: "reconcile-railway-render-jobs",
  cron: "*/10 * * * *",
  maxDuration: 300,
  run: async () => {
    const runs = await prisma.workflowRun.findMany({
      where: { type: { in: ["LONG_FORM_RENDER", "SHORT_FORM_RENDER"] }, status: { in: ["QUEUED", "RUNNING", "WAITING"] } },
      include: { steps: { orderBy: { position: "asc" }, take: 1 } },
      take: 100,
      orderBy: { startedAt: { sort: "asc", nulls: "first" } },
    });
    let completed = 0;
    let failed = 0;
    for (const run of runs) {
      const input = run.input as { renderId?: unknown };
      if (typeof input.renderId !== "string") continue;
      const render = await prisma.videoRender.findUnique({ where: { id: input.renderId } });
      if (!render || !["SUCCEEDED", "FAILED"].includes(render.status)) continue;
      const status = render.status === "SUCCEEDED" ? "SUCCEEDED" : "FAILED";
      await prisma.$transaction([
        prisma.workflowRun.update({ where: { id: run.id }, data: { status, completedAt: new Date(), error: render.error, output: render.status === "SUCCEEDED" ? { renderId: render.id, assetId: render.assetId, reconciled: true } : undefined } }),
        ...(run.steps[0] ? [prisma.workflowStep.update({ where: { id: run.steps[0].id }, data: { status, completedAt: new Date(), error: render.error } })] : []),
      ]);
      if (status === "SUCCEEDED") completed++; else failed++;
    }
    return { examined: runs.length, completed, failed };
  },
});
import "../src/lib/observability/node";
