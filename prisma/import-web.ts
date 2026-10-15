import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const sourceDirectory = join(process.cwd(), "prisma", "data", "web-usfm");
const bookNames: Record<string, string> = {
  GEN:"Genesis",EXO:"Exodus",LEV:"Leviticus",NUM:"Numbers",DEU:"Deuteronomy",JOS:"Joshua",JDG:"Judges",RUT:"Ruth", "1SA":"1 Samuel","2SA":"2 Samuel","1KI":"1 Kings","2KI":"2 Kings","1CH":"1 Chronicles","2CH":"2 Chronicles",EZR:"Ezra",NEH:"Nehemiah",EST:"Esther",JOB:"Job",PSA:"Psalms",PRO:"Proverbs",ECC:"Ecclesiastes",SNG:"Song of Solomon",ISA:"Isaiah",JER:"Jeremiah",LAM:"Lamentations",EZK:"Ezekiel",DAN:"Daniel",HOS:"Hosea",JOL:"Joel",AMO:"Amos",OBA:"Obadiah",JON:"Jonah",MIC:"Micah",NAM:"Nahum",HAB:"Habakkuk",ZEP:"Zephaniah",HAG:"Haggai",ZEC:"Zechariah",MAL:"Malachi",MAT:"Matthew",MRK:"Mark",LUK:"Luke",JHN:"John",ACT:"Acts",ROM:"Romans","1CO":"1 Corinthians","2CO":"2 Corinthians",GAL:"Galatians",EPH:"Ephesians",PHP:"Philippians",COL:"Colossians","1TH":"1 Thessalonians","2TH":"2 Thessalonians","1TI":"1 Timothy","2TI":"2 Timothy",TIT:"Titus",PHM:"Philemon",HEB:"Hebrews",JAS:"James","1PE":"1 Peter","2PE":"2 Peter","1JN":"1 John","2JN":"2 John","3JN":"3 John",JUD:"Jude",REV:"Revelation",
};

export function cleanUsfm(value: string) {
  return value
    .replace(/\\f\s[\s\S]*?\\f\*/g, "")
    .replace(/\\x\s[\s\S]*?\\x\*/g, "")
    .replace(/\\w\s+([^|\\]+)(?:\|[^\\]+)?\\w\*/g, "$1")
    .replace(/\\\+?\w+\*?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseUsfm(source: string) {
  const id = source.match(/^\\id\s+([A-Z0-9]{3})/m)?.[1];
  if (!id || !bookNames[id]) return null;
  const verses: Array<{ chapter: number; number: number; text: string }> = [];
  let chapter = 0;
  for (const line of source.split(/\r?\n/)) {
    const chapterMatch = line.match(/^\\c\s+(\d+)/);
    if (chapterMatch) { chapter = Number(chapterMatch[1]); continue; }
    const verseMatch = line.match(/^\\v\s+(\d+)[a-z]?\s+([\s\S]*)/);
    if (verseMatch) { verses.push({ chapter, number: Number(verseMatch[1]), text: cleanUsfm(verseMatch[2]) }); continue; }
    if (verses.length && chapter && !line.startsWith("\\")) verses[verses.length - 1].text = cleanUsfm(`${verses[verses.length - 1].text} ${line}`);
  }
  return { id, name: bookNames[id], verses: verses.filter((verse) => verse.chapter > 0 && verse.text) };
}

async function main() {
  const translation = await prisma.translation.upsert({ where: { code: "WEB" }, update: { name: "World English Bible", license: "Public Domain — eBible.org engwebp" }, create: { code: "WEB", name: "World English Bible", language: "en", license: "Public Domain — eBible.org engwebp", isDefault: true } });
  const files = (await readdir(sourceDirectory)).filter((file) => file.endsWith("engwebp.usfm")).sort();
  let imported = 0;
  for (const file of files) {
    const parsed = parseUsfm(await readFile(join(sourceDirectory, file), "utf8"));
    if (!parsed) continue;
    const book = await prisma.bibleBook.findUniqueOrThrow({ where: { name: parsed.name } });
    const chapters = await prisma.bibleChapter.findMany({ where: { bookId: book.id } });
    const byNumber = new Map(chapters.map((chapter) => [chapter.number, chapter.id]));
    await prisma.$transaction(async (tx) => {
      await tx.bibleVerse.deleteMany({ where: { translationId: translation.id, chapter: { bookId: book.id } } });
      for (let offset = 0; offset < parsed.verses.length; offset += 500) {
        await tx.bibleVerse.createMany({ data: parsed.verses.slice(offset, offset + 500).map((verse) => ({ chapterId: byNumber.get(verse.chapter)!, translationId: translation.id, number: verse.number, text: verse.text })) });
      }
    });
    imported += parsed.verses.length;
    process.stdout.write(`${parsed.name}: ${parsed.verses.length} verses\n`);
  }
  if (imported < 30_000) throw new Error(`Import was incomplete: only ${imported} verses were found.`);
  process.stdout.write(`Imported ${imported} WEB verses across ${Object.keys(bookNames).length} books.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().finally(() => prisma.$disconnect());
