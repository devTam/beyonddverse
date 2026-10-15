import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { openChapterProject } from "@/app/actions";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export default async function BookPage({ params }: { params: Promise<{ book: string }> }) {
  const book = await prisma.bibleBook.findUniqueOrThrow({ where: { slug: (await params).book }, include: { chapters: { include: { _count: { select: { verses: true } }, projects: { take: 1, orderBy: { updatedAt: "desc" } } }, orderBy: { number: "asc" } } } });
  return <div className="page"><header className="topbar"><div><Link href="/library" className="back"><ArrowLeft size={16}/> Bible library</Link><p className="eyebrow">{book.testament}</p><h1>{book.name}</h1><p>Select any chapter to open or create its production workspace.</p></div></header><section className="panel"><div className="chapter-grid">{book.chapters.map((chapter) => <form action={openChapterProject} key={chapter.id}><input type="hidden" name="chapterId" value={chapter.id}/><button className="chapter-button"><strong>{chapter.number}</strong><span>{chapter._count.verses} verses</span><small>{chapter.projects[0] ? chapter.projects[0].status.replaceAll("_", " ") : "Not started"}</small></button></form>)}</div></section></div>;
}
