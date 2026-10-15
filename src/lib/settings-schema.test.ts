import { describe, expect, it } from "vitest";
import { ProductionSettingsSchema } from "./settings-schema";

describe("ProductionSettingsSchema", () => {
  it("provides safe production defaults", () => {
    const settings = ProductionSettingsSchema.parse({});
    expect(settings.bibleTranslationCode).toBe("WEB");
    expect(settings.youtubePrivacy).toBe("unlisted");
    expect(settings.monthlyBudgetUsd).toBeGreaterThan(0);
    expect(settings.textModel).toBe("openai/gpt-5.4");
    expect(settings.transcriptionModel).toBe("openai/gpt-4o-transcribe");
    expect(settings.speechModel).toBe("fish-audio/drama-3");
    expect(settings.imageModel).toBe("openai/gpt-image-2.5-flare");
    expect(settings.thumbnailModel).toBe("openai/gpt-image-2.5-sunburst");
  });

  it("rejects invalid budgets, colors, and concurrency", () => {
    expect(() => ProductionSettingsSchema.parse({ monthlyBudgetUsd: 0 })).toThrow();
    expect(() => ProductionSettingsSchema.parse({ primaryColor: "gold" })).toThrow();
    expect(() => ProductionSettingsSchema.parse({ concurrencyLimit: 21 })).toThrow();
  });
});
