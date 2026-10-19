import { describe, expect, it } from "vitest";
import { lessonTranscript, scenesFromText, scenesFromTranscriptEdit } from "./lesson";

describe("passage-led narration editing", () => {
  it("keeps one explanation for several verses, without duplicating it for each verse", () => {
    const text = "I read Genesis 1:1–5 as one connected teaching about the beginning. We can consider these verses together without separate commentary for each one.";
    const scenes = scenesFromText(text);
    expect(scenes).toHaveLength(1);
    expect(scenes[0].scriptureRef).toBe("Genesis 1:1–5");
    expect(lessonTranscript(scenes)).toBe(text);
  });
  it("retains grouped passages and all manually edited teaching paragraphs", () => {
    const text = "I consider Genesis 1:1-5 together as one passage.\n\nWe then reflect on Genesis 1:6–10 as another connected passage.";
    const scenes = scenesFromTranscriptEdit(text);
    expect(scenes.map((s) => s.scriptureRef)).toEqual(["Genesis 1:1-5", "Genesis 1:6–10"]);
    expect(lessonTranscript(scenes)).toBe(text);
  });
  it("does not invent explanations or Scripture cards for uncovered verses", () => {
    const scenes = scenesFromTranscriptEdit("I want us to consider the chapter as a whole. We can reflect on its central theme together.");
    expect(scenes).toHaveLength(1);
    expect(scenes[0].scriptureRef).toBeNull();
  });
  it("rejects empty transcript edits", () => {
    expect(() => scenesFromTranscriptEdit(" \n ")).toThrow("Enter narration");
  });
});
