import { describe, expect, it } from "vitest";
import { ProductionSettingsSchema } from "./settings-schema";

describe("ProductionSettingsSchema", () => {
  it("provides safe production defaults", () => {
    const settings = ProductionSettingsSchema.parse({});
    expect(settings.bibleTranslationCode).toBe("WEB");
    expect(settings.youtubePrivacy).toBe("unlisted");
    expect(settings.monthlyBudgetUsd).toBeGreaterThan(0);
  });

  it("rejects invalid budgets, colors, and concurrency", () => {
    expect(() => ProductionSettingsSchema.parse({ monthlyBudgetUsd: 0 })).toThrow();
    expect(() => ProductionSettingsSchema.parse({ primaryColor: "gold" })).toThrow();
    expect(() => ProductionSettingsSchema.parse({ concurrencyLimit: 21 })).toThrow();
  });
});
