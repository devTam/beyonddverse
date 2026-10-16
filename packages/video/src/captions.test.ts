import { describe, expect, it } from "vitest";
import { activeCaption, captionCues, scriptureCueTime } from "./captions";

const timings = "A thoughtful explanation deserves readable captions without obscuring the presenter".split(" ").map((word, i) => ({ word, startMs: i * 500, endMs: i * 500 + 400 }));
describe("compact caption cues", () => {
  it("wraps measured text onto no more than two lines", () => {
    const cues = captionCues(timings, 24, (text) => text.length);
    expect(cues.every((cue) => cue.lines.length <= 2 && cue.lines.every((line) => line.length <= 24))).toBe(true);
    expect(cues.flatMap((cue) => cue.lines).join(" ")).toBe(timings.map((timing) => timing.word).join(" "));
  });
  it("does not reset to the first caption after audio ends, or display before speech", () => {
    const cues = captionCues(timings, 80, (text) => text.length);
    expect(activeCaption(cues, -1)).toBeUndefined();
    expect(activeCaption(cues, 10000)).toBeUndefined();
    expect(activeCaption(cues, 100)?.lines.join(" ")).toContain("thoughtful");
  });
  it("leaves speech pauses empty", () => {
    const cues = captionCues([{ word: "Before", startMs: 0, endMs: 300 }, { word: "After", startMs: 1500, endMs: 1900 }], 80, (text) => text.length);
    expect(activeCaption(cues, 700)).toBeUndefined();
    expect(activeCaption(cues, 1600)?.lines).toEqual(["After"]);
  });
  it("handles oversized tokens without overflowing", () => {
    const cues = captionCues([{ word: "extraordinarilylongword", startMs: 0, endMs: 2000 }], 10, (text) => text.length);
    expect(cues.every((cue) => cue.lines.length <= 2 && cue.lines.every((line) => line.length <= 10))).toBe(true);
  });
  it("locates Scripture at its exact spoken cue", () => {
    const time = scriptureCueTime(timings.map((timing) => timing.word).join(" "), "readable captions", timings);
    expect(time.startMs).toBe(2000);
  });
});
