import { describe, expect, it, vi } from "vitest";
const find = vi.hoisted(() => vi.fn());
vi.mock("../prisma", () => ({ prisma: { bibleVerse: { findMany: find } } }));
import { parseScriptureReference, resolveScripture, verifySceneScripture, resolveNarrationCue } from "./scripture";

describe("verified Scripture cards", () => {
  it("resolves harmless typography differences to the actual spoken phrase", () => {
    expect(resolveNarrationCue("We read Genesis 1:1–2 together.", "Genesis 1:1-2")).toBe("Genesis 1:1–2");
    expect(resolveNarrationCue("I consider God’s  creation.", "god's creation")).toBe("God’s  creation");
    expect(resolveNarrationCue("I reflect (carefully) on this.", "(carefully)")).toBe("(carefully)");
  });
  it("does not guess when a cue is absent, changes wording, or is ambiguous", () => {
    expect(resolveNarrationCue("We read Genesis 1:1–2.", "unspoken text")).toBeNull();
    expect(resolveNarrationCue("I teach this.", null)).toBeNull();
    expect(resolveNarrationCue("We read Genesis 1:1–2 then Genesis 1:1–2.", "Genesis 1:1-2")).toBeNull();
  });
  it("returns the normalized cue alongside verified stored Scripture", async () => {
    find.mockResolvedValue([{ text: "One." }, { text: "Two." }]);
    const [scene] = await verifySceneScripture([{ narration: "I read Genesis 1:1–2.", scriptureRef: "Genesis 1:1–2", scriptureCue: "Genesis 1:1-2" }], "WEB");
    expect(scene.scriptureCue).toBe("Genesis 1:1–2");
    expect(scene.scriptureExcerpt).toBe("One. Two.");
  });
  it("preserves a valid later cue and still rejects missing narration or unresolved Scripture", async () => {
    find.mockResolvedValue([{ text: "Stored Scripture." }]);
    const [scene] = await verifySceneScripture([{ narration: "I begin here. We then reflect together.", scriptureRef: "John 15:5", scriptureCue: "We then reflect" }], "WEB");
    expect(scene.scriptureCue).toBe("We then reflect");
    await expect(verifySceneScripture([{ narration: "  ", scriptureRef: "John 15:5", scriptureCue: null }], "WEB")).rejects.toThrow("add narration");
    find.mockResolvedValue([]);
    await expect(verifySceneScripture([{ narration: "I begin here.", scriptureRef: "John 15:5", scriptureCue: null }], "WEB")).rejects.toThrow("Cannot resolve");
  });
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
  it("defaults missing or stale cues to the scene opening and leaves unreferenced scenes free of Scripture", async () => {
    find.mockResolvedValue([{ text: "Stored Scripture." }]);
    for (const cue of [null, "", "missing phrase"]) {
      const [scene] = await verifySceneScripture([{ narration: "I understand this teaching as a connected passage with shared meaning.", scriptureRef: "John 15:5", scriptureCue: cue }], "WEB");
      expect(scene.scriptureCue).toBe("I understand this teaching as a connected passage");
      expect(scene.narration.indexOf(scene.scriptureCue!)).toBe(0);
      expect(scene.scriptureExcerpt).toBe("Stored Scripture.");
    }
    expect(await verifySceneScripture([{ narration: "The teaching", scriptureRef: null, scriptureCue: null }], "WEB")).toEqual([{ narration: "The teaching", scriptureRef: null, scriptureCue: null, scriptureExcerpt: null }]);
  });
});
