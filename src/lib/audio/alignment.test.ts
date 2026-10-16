import { describe, expect, it } from "vitest";
import { alignNarration } from "./alignment";

describe("approved narration alignment", () => {
  it("preserves approved wording and punctuation with audio segment timing", () => {
    const timings = alignNarration("Grace, not achievement. A gift.", [{ text: "Grace not achievement", startSecond: 0.3, endSecond: 2 }, { text: "A gift", startSecond: 3, endSecond: 4 }], 4500);
    expect(timings.map((word) => word.word).join(" ")).toBe("Grace, not achievement. A gift.");
    expect(timings[0].startMs).toBe(300);
    expect(timings[3].startMs).toBe(3000);
    expect(timings.at(-1)?.endMs).toBe(4000);
  });
  it("aligns Bible reference numerals with their spoken spelling without changing approved captions", () => {
    const timings = alignNarration("Genesis 1:27 teaches dignity.", [{ text: "Genesis one twenty seven teaches dignity", startSecond: 0, endSecond: 5 }], 5000);
    expect(timings.map((word) => word.word).join(" ")).toBe("Genesis 1:27 teaches dignity.");
    expect(timings[1].endMs).toBeGreaterThan(timings[1].startMs);
  });
  it("rejects missing or changed teaching instead of silently captioning it", () => {
    expect(() => alignNarration("Every paragraph matters", [{ text: "Every matters", startSecond: 0, endSecond: 2 }], 2000)).toThrow("differs");
    expect(() => alignNarration("A lesson", [], 2000)).toThrow("differs");
  });
});
