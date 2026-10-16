import { describe, expect, it, vi } from "vitest";
const find = vi.hoisted(() => vi.fn());
vi.mock("../prisma", () => ({ prisma: { bibleVerse: { findMany: find } } }));
import { parseScriptureReference, resolveScripture, verifySceneScripture } from "./scripture";

describe("verified Scripture cards", () => {
  it("checks book, chapter, verse range, and selected translation", async () => {
    find.mockResolvedValue([{ text: "Stored verse one." }, { text: "Stored verse two." }]);
    expect(await resolveScripture("John 15:4–5", "WEB")).toBe("Stored verse one. Stored verse two.");
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ chapter: { book: { name: { equals: "John", mode: "insensitive" } }, number: 15 }, translation: { code: "WEB" }, number: { gte: 4, lte: 5 } }) }));
  });
  it("rejects chapter-only, reversed, absent, and oversized references", async () => {
    expect(() => parseScriptureReference("John 15")).toThrow();
    expect(() => parseScriptureReference("John 15:5–4")).toThrow();
    expect(() => parseScriptureReference("John 15:1–10000")).toThrow();
    find.mockResolvedValue([]); await expect(resolveScripture("John 15:5", "WEB")).rejects.toThrow("Cannot resolve");
  });
  it("requires an exact spoken cue and leaves unreferenced scenes free of Scripture", async () => {
    await expect(verifySceneScripture([{ narration: "The teaching", scriptureRef: "John 15:5", scriptureCue: "missing" }], "WEB")).rejects.toThrow("exact narration phrase");
    expect(await verifySceneScripture([{ narration: "The teaching", scriptureRef: null, scriptureCue: null }], "WEB")).toEqual([{ narration: "The teaching", scriptureRef: null, scriptureCue: null, scriptureExcerpt: null }]);
  });
});
