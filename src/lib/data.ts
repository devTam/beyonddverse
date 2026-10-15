import { prisma } from "@/lib/prisma";
import { getProductionSettings } from "@/lib/settings";

export async function getDashboardData() {
  const [chapters, completed, active, pendingScripts, pendingVideos, scheduled, failed, costs, recent, recentPublished, snapshots] = await prisma.$transaction([
    prisma.bibleChapter.count(),
    prisma.chapterProject.count({ where: { status: "PUBLISHED" } }),
    prisma.workflowRun.count({ where: { status: { in: ["QUEUED", "RUNNING", "WAITING"] } } }),
    prisma.script.count({ where: { status: "PENDING" } }),
    prisma.contentVariant.count({ where: { status: { in: ["DRAFT", "PENDING"] }, videoRender: { status: "SUCCEEDED", assetId: { not: null } } } }),
    prisma.scheduledPost.count({ where: { status: "SCHEDULED" } }),
    prisma.scheduledPost.count({ where: { status: "FAILED" } }),
    prisma.generationCost.aggregate({ _sum: { amountMicros: true } }),
    prisma.chapterProject.findMany({
      take: 5,
      orderBy: { updatedAt: "desc" },
      include: { chapter: { include: { book: true } }, contentPackages: { include: { scripts: true }, orderBy: { version: "desc" }, take: 1 } },
    }),
    prisma.publishedPost.findMany({ take: 5, orderBy: { publishedAt: "desc" }, include: { scheduledPost: { include: { socialAccount: true, variant: { include: { contentPackage: { include: { project: true } } } } } } } }),
    prisma.analyticsSnapshot.findMany({ orderBy: { capturedAt: "desc" }, include: { publishedPost: { include: { scheduledPost: { include: { socialAccount: true } } } } } }),
  ]);
  const latestSnapshots = [...new Map(snapshots.map((snapshot) => [snapshot.publishedPostId, snapshot])).values()];
  const platformPerformance = Object.values(latestSnapshots.reduce<Record<string, { platform: string; views: number; likes: number; comments: number }>>((summary, snapshot) => {
    const platform = snapshot.publishedPost.scheduledPost.socialAccount.platform;
    const metrics = snapshot.metrics as Record<string, unknown>;
    const row = summary[platform] ?? { platform, views: 0, likes: 0, comments: 0 };
    row.views += typeof metrics.views === "number" ? metrics.views : 0;
    row.likes += typeof metrics.likes === "number" ? metrics.likes : 0;
    row.comments += typeof metrics.comments === "number" ? metrics.comments : 0;
    summary[platform] = row;
    return summary;
  }, {}));
  return { chapters, completed, active, pendingScripts, pendingVideos, scheduled, failed, costs: costs._sum.amountMicros ?? 0n, recent, recentPublished, platformPerformance };
}

export async function getChapterProject(projectId?: string, workflowId?: string, scriptId?: string) {
  const { bibleTranslationCode } = await getProductionSettings();
  let resolvedId = projectId;
  if (!resolvedId && workflowId) resolvedId = (await prisma.workflowRun.findUnique({ where: { id: workflowId }, select: { projectId: true } }))?.projectId;
  if (!resolvedId && scriptId) resolvedId = (await prisma.script.findUnique({ where: { id: scriptId }, select: { contentPackage: { select: { projectId: true } } } }))?.contentPackage.projectId;
  return prisma.chapterProject.findFirstOrThrow({
    where: resolvedId ? { id: resolvedId } : { chapter: { book: { slug: "genesis" }, number: 1 } },
    include: {
      chapter: {
        include: {
          book: true,
          verses: { where: { translation: { code: bibleTranslationCode } }, include: { translation: true }, orderBy: { number: "asc" } },
        },
      },
      explanations: { orderBy: { revision: "desc" } },
      contentPackages: {
        orderBy: { version: "desc" },
        include: {
          variants: {
            include: { videoRender: { include: { asset: true } } },
            orderBy: { kind: "asc" },
          },
          scripts: {
            orderBy: { revision: "desc" },
            include: { scenes: { orderBy: { position: "asc" }, include: { narrations: { include: { asset: true }, orderBy: { createdAt: "desc" } }, assetUsages: { include: { asset: true } } } } },
          },
        },
      },
      workflowRuns: {
        orderBy: { startedAt: "desc" },
        take: 5,
        include: { steps: { orderBy: { position: "asc" } } },
      },
    },
  });
}

export const getGenesisProject = () => getChapterProject();
