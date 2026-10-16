import { prisma } from "../prisma";

export function parseScriptureReference(reference: string) {
  const match = reference.trim().match(/^(.+?)\s+(\d+):(\d+)(?:[–-](\d+))?$/);
  if (!match) throw new Error(`Use a book, chapter, and verse range for “${reference}”.`);
  const [, book, chapter, start, end = start] = match;
  if (+start < 1 || +end < +start || +end - +start > 30) throw new Error("Scripture cards support 1–31 consecutive verses.");
  return { book, chapter: +chapter, start: +start, end: +end };
}

export async function resolveScripture(reference: string, translation: string) {
  const parsed = parseScriptureReference(reference);
  const verses = await prisma.bibleVerse.findMany({ where: { chapter: { book: { name: { equals: parsed.book, mode: "insensitive" } }, number: parsed.chapter }, translation: { code: translation }, number: { gte: parsed.start, lte: parsed.end } }, orderBy: { number: "asc" } });
  if (verses.length !== parsed.end - parsed.start + 1) throw new Error(`Cannot resolve ${reference} in ${translation}.`);
  return verses.map((verse) => verse.text).join(" ");
}

export async function verifySceneScripture<T extends { narration: string; scriptureRef: string | null; scriptureCue: string | null }>(scenes: T[], translation: string) {
  return Promise.all(scenes.map(async (scene) => {
    if (!scene.scriptureRef) return { ...scene, scriptureCue: null, scriptureExcerpt: null };
    if (!scene.scriptureCue || !scene.narration.includes(scene.scriptureCue)) throw new Error(`Choose an exact narration phrase to cue ${scene.scriptureRef}.`);
    return { ...scene, scriptureExcerpt: await resolveScripture(scene.scriptureRef, translation) };
  }));
}
