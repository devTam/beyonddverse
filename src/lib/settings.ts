import { prisma } from "@/lib/prisma";
import { ProductionSettingsSchema, PRODUCTION_SETTINGS_KEY, type ProductionSettings } from "@/lib/settings-schema";
export { ProductionSettingsSchema, PRODUCTION_SETTINGS_KEY } from "@/lib/settings-schema";

function environmentDefaults(): ProductionSettings {
  const dictionary = (() => { try { return JSON.parse(process.env.PRONUNCIATION_DICTIONARY ?? "{}"); } catch { return {}; } })();
  return ProductionSettingsSchema.parse({
    brandName: process.env.BRAND_NAME ?? "Beyond the Verse",
    narratorVoice: process.env.TTS_VOICE ?? "alloy",
    speechSpeed: Number(process.env.TTS_SPEED ?? 1),
    pronunciationDictionary: dictionary,
    textModel: process.env.AI_GATEWAY_MODEL ?? "openai/gpt-5.4-mini",
    transcriptionModel: process.env.AI_TRANSCRIPTION_MODEL ?? "openai/gpt-4o-mini-transcribe",
    speechModel: process.env.AI_SPEECH_MODEL ?? "openai/gpt-4o-mini-tts",
    imageModel: process.env.AI_IMAGE_MODEL ?? "google/gemini-3.1-flash-image-preview",
    bibleTranslationCode: process.env.BIBLE_TRANSLATION_CODE ?? "WEB",
    youtubePrivacy: process.env.YOUTUBE_DEFAULT_PRIVACY ?? "unlisted",
    monthlyBudgetUsd: Number(process.env.MONTHLY_BUDGET_USD ?? 25),
    generationLimit: Number(process.env.MONTHLY_GENERATION_LIMIT ?? 250),
    concurrencyLimit: Number(process.env.GENERATION_CONCURRENCY_LIMIT ?? 3),
    videoQuality: process.env.VIDEO_QUALITY ?? "high",
    errorNotificationEmail: process.env.ERROR_NOTIFICATION_EMAIL || null,
  });
}

export async function getProductionSettings() {
  const fallback = environmentDefaults();
  const stored = await prisma.workspaceSetting.findUnique({ where: { key: PRODUCTION_SETTINGS_KEY } });
  return ProductionSettingsSchema.parse({ ...fallback, ...(stored?.value && typeof stored.value === "object" && !Array.isArray(stored.value) ? stored.value : {}) });
}

export async function assertWorkflowCapacity() {
  const { concurrencyLimit } = await getProductionSettings();
  const active = await prisma.workflowRun.count({ where: { status: { in: ["QUEUED", "RUNNING"] } } });
  if (active >= concurrencyLimit) throw new Error(`The workspace concurrency limit (${concurrencyLimit}) is currently in use. Wait for an active workflow to finish.`);
}
