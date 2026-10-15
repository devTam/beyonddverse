import { schedules } from "@trigger.dev/sdk";
import { prisma } from "../src/lib/prisma";
import { decryptSecret, encryptSecret } from "../src/lib/security/encryption";
import { oauthProvider, type SupportedProvider } from "../src/lib/publishing";
import { collectPublicationAnalytics, reconcilePublishedPost } from "./publishing";

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
        const provider: SupportedProvider = account.platform === "YOUTUBE" ? "youtube" : account.platform === "TIKTOK" ? "tiktok" : "meta";
        const refreshed = await oauthProvider(provider).refresh(decryptSecret(account.encryptedRefreshToken!));
        await prisma.socialAccount.update({ where: { id: account.id }, data: { encryptedToken: encryptSecret(refreshed.accessToken), encryptedRefreshToken: refreshed.refreshToken ? encryptSecret(refreshed.refreshToken) : undefined, tokenExpiresAt: refreshed.expiresAt } });
      } catch (error) {
        await prisma.operationalAlert.create({ data: { severity: "ERROR", category: "TOKEN_REFRESH", message: error instanceof Error ? error.message : "Token refresh failed", entityType: "SocialAccount", entityId: account.id } });
      }
    }
    return { processed: accounts.length };
  },
});
