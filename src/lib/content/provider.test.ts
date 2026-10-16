import { describe, expect, it } from "vitest";
import { DevelopmentContentProvider } from "./provider";
import { lessonTranscript, narrationChunks } from "./lesson";

const provider = new DevelopmentContentProvider();
describe("explanation-led teaching", () => {
  it("preserves the full supplied teaching in the narrated scenes", async () => {
    const explanation = "The chapter presents creation as ordered and purposeful, and human dignity as received from God.\n\nEvery person has worth before achievement. This is why our treatment of other people matters.";
    const result = await provider.generate({ reference: "Genesis 1", scripture: "Stored Scripture", explanation });
    expect(result.script.body).toBe(explanation);
    expect(lessonTranscript(result.script.scenes)).toBe(result.script.body);
    expect(result.script.scenes[0].presentation).toBe("presenter");
    expect(result.script.scenes.at(-1)?.presentation).toBe("presenter");
    expect(result.shorts).toHaveLength(3);
    expect(result.citations).toEqual([]);
  });
  it("produces different lessons for different explanations and references", async () => {
    const first = await provider.generate({ reference: "Genesis 1", scripture: "Text", explanation: "Creation teaches us to care for the world entrusted to us." });
    const second = await provider.generate({ reference: "John 15", scripture: "Text", explanation: "Abiding describes a continuing relationship. Fruit grows from remaining connected rather than performing for approval." });
    expect(first.script.body).not.toBe(second.script.body);
    expect(second.script.title).toContain("John 15");
    expect(second.script.body).not.toContain("Genesis");
    expect(second.script.scenes.map((scene) => scene.narration).join(" ")).toContain("Abiding describes");
  });
  it("splits long paragraphs without losing a word or imposing a fixed runtime", () => {
    const source = Array.from({ length: 405 }, (_, i) => `word${i}`).join(" ");
    expect(narrationChunks(source).join(" ")).toBe(source);
    expect(narrationChunks(source).every((chunk) => chunk.split(" ").length <= 90)).toBe(true);
  });
  it("cues Scripture only when the explanation explicitly references it", async () => {
    const result = await provider.generate({ reference: "Genesis 1", scripture: "Text", explanation: "John 15:5 explains the connection between abiding and fruitfulness. Let us consider what that means for daily life." });
    expect(result.script.scenes[0].scriptureRef).toBe("John 15:5");
    expect(result.script.scenes[0].scriptureCue).toBe("John 15:5");
  });
});
