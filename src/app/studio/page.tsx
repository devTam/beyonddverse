import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function StudioPage() {
  const project = await prisma.chapterProject.findFirst({ orderBy: { updatedAt: "desc" }, select: { id: true } });
  redirect(project ? `/studio/genesis-1?project=${project.id}` : "/library");
}
