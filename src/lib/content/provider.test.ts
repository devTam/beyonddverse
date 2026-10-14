import { describe, expect, it } from "vitest";
import { DevelopmentContentProvider } from "./provider";

describe("DevelopmentContentProvider", () => {
  it("returns a validated package with three independent shorts", async () => {
    const result = await new DevelopmentContentProvider().generate({
      reference: "Genesis 1",
      scripture: "In the beginning God created. Humanity was made in God's image. It was very good.",
      explanation: "The chapter presents creation as ordered and purposeful, and human dignity as received from God.",
    });
    expect(result.shorts).toHaveLength(3);
    expect(result.script.scenes.length).toBeGreaterThanOrEqual(3);
    expect(result.citations.every((citation) => citation.supported)).toBe(true);
  });
});
