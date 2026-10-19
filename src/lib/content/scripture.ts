import { UserInputError } from "../action-error";
import { prisma } from "../prisma";

export function parseScriptureReference(reference: string) {
  const match = reference.trim().match(/^(.+?)\s+(\d+):(\d+)(?:[–-](\d+))?$/);
  if (!match) throw new UserInputError(`Use a book, chapter, and verse range for “${reference}”.`);
  const [, book, chapter, start, end = start] = match;
  if (+start < 1 || +end < +start || +end - +start > 30) throw new UserInputError("Scripture cards support 1–31 consecutive verses.");
  return { book, chapter: +chapter, start: +start, end: +end };
}

export async function resolveScripture(reference: string, translation: string) {
  const parsed = parseScriptureReference(reference);
  const verses = await prisma.bibleVerse.findMany({ where: { chapter: { book: { name: { equals: parsed.book, mode: "insensitive" } }, number: parsed.chapter }, translation: { code: translation }, number: { gte: parsed.start, lte: parsed.end } }, orderBy: { number: "asc" } });
  if (verses.length !== parsed.end - parsed.start + 1) throw new UserInputError(`Cannot resolve ${reference} in ${translation}.`);
  return verses.map((verse) => verse.text).join(" ");
}

/** Accept typography changes only when the intended phrase matches unambiguously. */
export function resolveNarrationCue(narration: string, cue: string | null) {
  if (!cue?.trim()) return null;
  if (narration.includes(cue)) return cue;
  const escaped = cue.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped.replace(/\s+/g, "\\s+").replace(/[-–—]/g, "[-–—]").replace(/['’]/g, "['’]").replace(/["“”]/g, '["“”]');
  const matches = [...narration.matchAll(new RegExp(pattern, "gi"))];
  return matches.length === 1 ? matches[0][0] : null;
}

export async function verifySceneScripture<T extends { narration: string; scriptureRef: string | null; scriptureCue: string | null }>(scenes: T[], translation: string) {
  return Promise.all(scenes.map(async (scene, index) => {
    if (!scene.scriptureRef) return { ...scene, scriptureCue: null, scriptureExcerpt: null };
    const scriptureCue = resolveNarrationCue(scene.narration, scene.scriptureCue);
    if (!scriptureCue) throw new UserInputError(`Scene ${index + 1} (${scene.scriptureRef}): choose an exact narration phrase in the Scripture display cue field, then save the script revision and approve again.`);
    return { ...scene, scriptureCue, scriptureExcerpt: await resolveScripture(scene.scriptureRef, translation) };
  }));
}
