import { describe, expect, it } from "vitest";
import { assertFirstPersonNarration, firstPersonDevelopmentExplanation } from "./narration-voice";

describe("first-person teaching voice", () => {
  it("accepts direct personal and inclusive teaching", () => {
    expect(() => assertFirstPersonNarration("I understand this passage as an invitation. Let us explore what that means for our lives.")).not.toThrow();
  });
  it.each([
    "I agree with what the creator explains about this passage.",
    "The creator says we should care for others.",
    "According to the creator, we should care for others.",
    "The creator’s interpretation tells us that dignity is received.",
    "Your explanation says that we should care for others.",
    "The author believes we should care for others.",
  ])("rejects human-source attribution: %s", (text) => {
    expect(() => assertFirstPersonNarration(text)).toThrow("without referring to the creator or author");
  });
  it("allows God to be called the Creator and preserves Scripture quotations", () => {
    expect(() => assertFirstPersonNarration('I see God as the Creator. Scripture says, “I am the good shepherd.”')).not.toThrow();
    expect(() => assertFirstPersonNarration('Scripture says, “I am the good shepherd.”')).toThrow("first-person");
  });
  it("adds only a teaching invitation to neutral development input", () => {
    const source = "Human dignity is received before achievement.";
    expect(firstPersonDevelopmentExplanation(source)).toBe(`Let us explore this together.\n\n${source}`);
    expect(firstPersonDevelopmentExplanation("I believe human dignity is received.")).toBe("I believe human dignity is received.");
  });
});
