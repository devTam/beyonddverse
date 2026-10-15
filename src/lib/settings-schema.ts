import { z } from "zod";

export const ProductionSettingsSchema = z.object({
  brandName: z.string().trim().min(2).max(80).default("Beyond the Verse"),
  brandAssetId: z.string().uuid().nullable().default(null),
  headingFont: z.string().trim().min(2).max(100).default("Georgia"),
  bodyFont: z.string().trim().min(2).max(100).default("Inter"),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).default("#17140f"),
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/i).default("#c89b3c"),
  narratorVoice: z.string().trim().min(1).max(100).default("alloy"),
  speechSpeed: z.number().min(0.5).max(2).default(1),
  pronunciationDictionary: z.record(z.string().min(1), z.string().min(1)).default({}),
  textModel: z.string().trim().min(3).max(200).default("openai/gpt-5.4-mini"),
  transcriptionModel: z.string().trim().min(3).max(200).default("openai/gpt-4o-mini-transcribe"),
  speechModel: z.string().trim().min(3).max(200).default("openai/gpt-4o-mini-tts"),
  imageModel: z.string().trim().min(3).max(200).default("google/gemini-3.1-flash-image-preview"),
  bibleTranslationCode: z.string().trim().min(2).max(20).default("WEB"),
  youtubePrivacy: z.enum(["private", "unlisted", "public"]).default("unlisted"),
  monthlyBudgetUsd: z.number().positive().max(1_000_000).default(25),
  generationLimit: z.number().int().positive().max(10_000).default(250),
  concurrencyLimit: z.number().int().min(1).max(20).default(3),
  videoQuality: z.enum(["standard", "high", "production"]).default("high"),
  errorNotificationEmail: z.string().email().nullable().default(null),
});

export type ProductionSettings = z.infer<typeof ProductionSettingsSchema>;
export const PRODUCTION_SETTINGS_KEY = "productionSettings";
