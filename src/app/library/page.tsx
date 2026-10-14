import Link from "next/link";
import { ArrowRight, BookOpenText } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export default async function Library() {
  const books = await prisma.bibleBook.findMany({ include: { _count: { select: { chapters: true } } }, orderBy: { ordinal: "asc" } });
  return <div className="page"><header className="topbar"><div><p className="eyebrow">Scripture library</p><h1>The biblical canon</h1><p>Public-domain text, normalized by book, chapter, verse, and translation.</p></div></header><section className="panel"><div className="book-grid">{books.map((book) => <Link href={book.slug === "genesis" ? "/studio/genesis-1" : "#"} className="book-tile" key={book.id}><BookOpenText/><div><strong>{book.name}</strong><small>{book._count.chapters} chapters · {book.testament}</small></div><ArrowRight size={16}/></Link>)}</div></section></div>;
}
