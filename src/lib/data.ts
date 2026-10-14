import { prisma } from "@/lib/prisma";

export async function getDashboardData() {
  const [chapters, completed, active, pendingScripts, scheduled, failed, costs, recent] = await prisma.$transaction([
    prisma.bibleChapter.count(),
    prisma.chapterProject.count({ where: { status: "PUBLISHED" } }),
    prisma.workflowRun.count({ where: { status: { in: ["QUEUED", "RUNNING", "WAITING"] } } }),
    prisma.script.count({ where: { status: "PENDING" } }),
    prisma.scheduledPost.count({ where: { status: "SCHEDULED" } }),
    prisma.scheduledPost.count({ where: { status: "FAILED" } }),
    prisma.generationCost.aggregate({ _sum: { amountMicros: true } }),
    prisma.chapterProject.findMany({
      take: 5,
      orderBy: { updatedAt: "desc" },
      include: { chapter: { include: { book: true } }, contentPackages: { include: { scripts: true }, orderBy: { version: "desc" }, take: 1 } },
    }),
  ]);
  return { chapters, completed, active, pendingScripts, scheduled, failed, costs: costs._sum.amountMicros ?? 0n, recent };
}

export async function getGenesisProject() {
  return prisma.chapterProject.findFirstOrThrow({
    where: { chapter: { book: { slug: "genesis" }, number: 1 } },
    include: {
      chapter: {
        include: {
          book: true,
          verses: { include: { translation: true }, orderBy: { number: "asc" } },
        },
      },
      explanations: { orderBy: { revision: "desc" } },
      contentPackages: {
        orderBy: { version: "desc" },
        include: {
          scripts: {
            orderBy: { revision: "desc" },
            include: { scenes: { orderBy: { position: "asc" }, include: { narrations: true, assetUsages: true } } },
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
