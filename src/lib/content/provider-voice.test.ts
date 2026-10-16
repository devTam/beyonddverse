import { beforeEach, describe, expect, it, vi } from "vitest";
const generation = vi.hoisted(() => vi.fn());
vi.mock("ai", () => ({ generateText: generation, Output: { object: (options: unknown) => options } }));
vi.mock("../settings", () => ({ getProductionSettings: async () => ({ textModel: "test/model" }) }));
import { AiGatewayContentProvider, DevelopmentContentProvider } from "./provider";
import type { GeneratedPackage } from "./schema";

const input = { reference: "Genesis 1", scripture: "God created man in his own image.", explanation: "I understand human dignity as received before achievement. Let us consider how we treat one another in light of that understanding." };
let output: GeneratedPackage;
beforeEach(async () => {
  output = await new DevelopmentContentProvider().generate(input);
  generation.mockReset();
  generation.mockImplementation(async () => ({ output, usage: {} }));
});
describe("AI first-person generation", () => {
  it("explicitly instructs direct first-person teaching, preserving quotations and avoiding invented testimony", async () => {
    const result = await new AiGatewayContentProvider().generate(input);
    const options = generation.mock.calls[0][0];
    expect(options.system).toContain("FIRST PERSON");
    expect(options.system).toContain("Never say 'the creator explains'");
    expect(options.system).toContain("Do not invent personal experiences");
    expect(options.system).toContain("Keep Scripture quotations exact");
    expect(options.prompt).toContain("MY EXPLANATION (speak this as my own first-person teaching)");
    expect(result.script.body).toContain(input.explanation);
  });
  it("rejects third-person creator attribution in the actual spoken scenes", async () => {
    output.script.scenes[0].narration = "The creator explains that we receive dignity before achievement.";
    await expect(new AiGatewayContentProvider().generate(input)).rejects.toThrow("without referring to the creator or author");
  });
  it("rejects neutral narration without a first-person teaching voice", async () => {
    output.script.scenes[0].narration = "Human dignity is received before achievement.";
    await expect(new AiGatewayContentProvider().generate(input)).rejects.toThrow("I/my or we/us/our");
  });
  it("applies the same rule to independently generated shorts", async () => {
    output.shorts[1] = { title: "Dignity", hook: "According to the creator,", body: "we receive dignity before achievement." };
    await expect(new AiGatewayContentProvider().generate(input)).rejects.toThrow("without referring to the creator or author");
  });
});
