import { prisma } from "@/lib/prisma";
import { ProductionSettingsSchema, PRODUCTION_SETTINGS_KEY, type ProductionSettings } from "@/lib/settings-schema";
export { ProductionSettingsSchema, PRODUCTION_SETTINGS_KEY } from "@/lib/settings-schema";

function environmentDefaults(): ProductionSettings {
  const dictionary = (() => { try { return JSON.parse(process.env.PRONUNCIATION_DICTIONARY ?? "{}"); } catch { return {}; } })();
  return ProductionSettingsSchema.parse({
    avatarRatePerMinute: Number(process.env.HEYGEN_AVATAR_COST_PER_MINUTE_USD ?? 2.31),
    brandName: process.env.BRAND_NAME ?? "Beyond the Verse",
    narratorVoice: process.env.TTS_VOICE ?? "933563129e564b19a115bedd57b7406a",
    speechSpeed: Number(process.env.TTS_SPEED ?? 1),
    pronunciationDictionary: dictionary,
    textModel: process.env.AI_GATEWAY_MODEL ?? "openai/gpt-5.4",
    alignmentModel: process.env.NARRATION_ALIGNMENT_MODEL ?? "openai/whisper-1",
    transcriptionModel: process.env.AI_TRANSCRIPTION_MODEL ?? "openai/gpt-4o-transcribe",
    speechModel: process.env.AI_SPEECH_MODEL ?? "fish-audio/drama-3",
    imageModel: process.env.AI_IMAGE_MODEL ?? "openai/gpt-image-2.5-flare",
    thumbnailModel: process.env.AI_THUMBNAIL_MODEL ?? "openai/gpt-image-2.5-sunburst",
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
