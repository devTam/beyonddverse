import "../src/lib/observability/node";
import { schemaTask, wait } from "@trigger.dev/sdk";
import { z } from "zod";
import { prisma } from "../src/lib/prisma";
import { getProductionSettings } from "../src/lib/settings";
import { getSpeechProvider } from "../src/lib/audio/tts";
import { getImageProvider } from "../src/lib/visuals/image-provider";
import { contentHash } from "../src/lib/content/provider";
import { createSignedDeliveryUrl, uploadAndCreateAsset } from "../src/lib/storage/cloudinary";
import { PresenterSnapshotSchema, PRESENTER_PREVIEW_TEXT } from "../src/lib/presenter-schema";
import { HeyGenAvatarProvider } from "../src/lib/avatar/heygen";
import { completeAvatarJob } from "../src/lib/avatar/generation";
import { assertCurrentScript } from "../src/lib/avatar/production";
import { assertWithinBudget, configuredRate, recordGenerationCost } from "../src/lib/costs";

const Input = z.object({ workflowRunId: z.string().uuid(), projectId: z.string().uuid(), profileId: z.string().uuid().optional(), scriptId: z.string().uuid().optional(), replacementSceneId: z.string().uuid().optional(), replacementId: z.string().uuid().optional() });
const pause = () => wait.for({ seconds: 15 });

export const presenterPipeline = schemaTask({
  id: "generate-presenter", schema: Input, maxDuration: 3600,
  retry: { maxAttempts: 3, minTimeoutInMs: 5000, maxTimeoutInMs: 60000, factor: 2 },
  run: async (payload) => {
    await prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "RUNNING", error: null, startedAt: new Date() } });
    try {
      const settings = await getProductionSettings();
      if (payload.profileId) {
        let profile = await prisma.presenterProfile.findUniqueOrThrow({ where: { id: payload.profileId } });
        const provider = new HeyGenAvatarProvider();
        if (!profile.providerAvatarId) {
          // Stable key makes retries safe during the provider's 24-hour idempotency window.
          const portrait = await prisma.asset.findUniqueOrThrow({ where: { id: profile.portraitAssetId } });
          if (portrait.status !== "APPROVED") throw new Error("Approve the presenter portrait before preview generation.");
          const registrationKey = `presenter:${profile.id}`;
          const marker = await prisma.workspaceSetting.findUnique({ where: { key: registrationKey } });
          if (typeof marker?.value === "string" && Date.now() - new Date(marker.value).getTime() > 23 * 3600000) throw new Error("Reconcile the portrait registration in HeyGen, then save a new presenter version with the existing Look ID.");
          await prisma.workspaceSetting.upsert({ where: { key: registrationKey }, create: { key: registrationKey, value: new Date().toISOString() }, update: {} });
          const creationRate = process.env.HEYGEN_AVATAR_CREATION_COST_USD ? configuredRate("HEYGEN_AVATAR_CREATION_COST_USD") : 1.32;
          await assertWithinBudget(payload.projectId, creationRate);
          const avatarId = await provider.registerPortrait(profile.name, createSignedDeliveryUrl(portrait), registrationKey);
          const profileId = profile.id;
          profile = await prisma.$transaction(async (tx) => {
            const claimed = await tx.presenterProfile.updateMany({ where: { id: profileId, providerAvatarId: null }, data: { providerAvatarId: avatarId } });
            if (claimed.count) await tx.generationCost.create({ data: { projectId: payload.projectId, provider: "heygen", model: "photo_avatar", operation: "PRESENTER_REGISTRATION", estimated: true, amountMicros: BigInt(Math.round(creationRate * 1e6)), units: { avatars: 1, profileId } } });
            return tx.presenterProfile.findUniqueOrThrow({ where: { id: profileId } });
          });
        }
        let ready = false;
        for (let i = 0; i < 80; i++) {
          const status = await provider.lookStatus(profile.providerAvatarId!);
          if (status === "failed") throw new Error("HeyGen could not prepare this presenter portrait.");
          if (status === "completed") { ready = true; break; }
          await pause();
        }
        if (!ready) throw new Error("Presenter portrait is still processing. Resume the preview later.");
        const hash = contentHash(`preview:${profile.id}`);
        let job = await prisma.avatarGeneration.findUnique({ where: { inputHash: hash } });
        if (!job) {
          await assertWithinBudget(payload.projectId);
          const dictionary = z.record(z.string(), z.string()).parse(profile.pronunciationDictionary);
          const speech = await getSpeechProvider().synthesize(PRESENTER_PREVIEW_TEXT, { model: profile.speechModel, voice: profile.voiceId, speed: profile.speechSpeed, pronunciationDictionary: dictionary });
          const audio = await uploadAndCreateAsset({ body: speech.audio, kind: "NARRATION", mimeType: speech.mimeType, filename: "presenter-preview.mp3", projectId: payload.projectId });
          if (!audio.durationMs) throw new Error("Preview audio duration is missing.");
          await recordGenerationCost({ projectId: payload.projectId, provider: speech.provider, model: profile.speechModel, operation: "PRESENTER_PREVIEW_SPEECH", amountMicros: PRESENTER_PREVIEW_TEXT.length * configuredRate("AI_SPEECH_COST_PER_MILLION_CHARACTERS"), units: { characters: PRESENTER_PREVIEW_TEXT.length } });
          job = await prisma.avatarGeneration.upsert({ where: { inputHash: hash }, update: {}, create: { inputHash: hash, profileId: profile.id, projectId: payload.projectId, audioAssetId: audio.id, durationMs: audio.durationMs, ratePerMinute: settings.avatarRatePerMinute } });
        }
        const complete = await completeAvatarJob(job.id, { avatarId: profile.providerAvatarId!, aspectRatio: "16:9", motionPrompt: profile.appearance, pause });
        await prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "SUCCEEDED", completedAt: new Date(), output: { profileId: profile.id, assetId: complete.assetId } } });
        return { profileId: profile.id };
      }
      if (!payload.scriptId) throw new Error("Choose a presenter profile or script.");
      const script = await assertCurrentScript(payload.scriptId);
      if (script.productionVersion !== 2) throw new Error("Regenerate this legacy script to use a presenter.");
      const presenter = PresenterSnapshotSchema.parse(script.presenterSnapshot);
      const scenes = await prisma.scriptScene.findMany({ where: { scriptId: script.id, presentation: "presenter", ...(payload.replacementSceneId ? { id: payload.replacementSceneId } : {}) }, include: { narrations: { orderBy: { createdAt: "desc" }, take: 1, include: { asset: true } } }, orderBy: { position: "asc" } });
      for (const scene of scenes) {
        await assertCurrentScript(script.id);
        const narration = scene.narrations[0];
        if (!narration?.asset.durationMs) throw new Error(`Generate narration for scene ${scene.position} first.`);
        const hash = contentHash(JSON.stringify({ sceneId: scene.id, narrationId: narration.id, presenter, ...(payload.replacementId ? { replacementId: payload.replacementId } : {}), aspectRatio: script.kind.startsWith("SHORT_") ? "9:16" : "16:9" }));
        const reusable = !payload.replacementId ? await prisma.avatarGeneration.findFirst({ where: { sceneId: scene.id, narrationId: narration.id, profileId: presenter.id }, orderBy: { createdAt: "desc" } }) : null;
        const job = reusable ?? await prisma.avatarGeneration.upsert({ where: { inputHash: hash }, update: {}, create: { inputHash: hash, profileId: presenter.id, projectId: payload.projectId, sceneId: scene.id, narrationId: narration.id, audioAssetId: narration.assetId, durationMs: narration.asset.durationMs, ratePerMinute: settings.avatarRatePerMinute } });
        await completeAvatarJob(job.id, { avatarId: presenter.providerAvatarId, aspectRatio: script.kind.startsWith("SHORT_") ? "9:16" : "16:9", motionPrompt: presenter.appearance, pause });
      }
      await assertCurrentScript(script.id);
      await prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "SUCCEEDED", completedAt: new Date(), output: { scriptId: script.id } } });
      return { scriptId: script.id };
    } catch (error) {
      await prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "FAILED", error: error instanceof Error ? error.message : "Presenter generation failed", completedAt: new Date() } });
      throw error;
    }
  },
});

export const presenterPortrait = schemaTask({
  id: "generate-presenter-portrait", schema: z.object({ workflowRunId: z.string().uuid(), projectId: z.string().uuid(), prompt: z.string().min(20) }), maxDuration: 900,
  run: async (payload) => {
    await prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "RUNNING", startedAt: new Date() } });
    try {
      await assertWithinBudget(payload.projectId);
      const settings = await getProductionSettings();
      const image = await getImageProvider().generate(`Create a photorealistic portrait of one original fictional human presenter. ${payload.prompt}. Front-facing, waist-up, centered in the middle third so both landscape and portrait crops retain the face, natural skin texture, warm neutral studio lighting, simple background, no text. This is the identity reference for a consistent educational host.`, { model: settings.imageModel, aspectRatio: "16:9" });
      const asset = await uploadAndCreateAsset({ body: image.body, kind: "IMAGE", mimeType: image.mimeType, filename: "presenter-portrait.png", projectId: payload.projectId });
      await recordGenerationCost({ projectId: payload.projectId, provider: image.provider, model: image.model, operation: "PRESENTER_PORTRAIT", amountMicros: configuredRate("AI_IMAGE_COST_USD") * 1e6, units: { images: 1 } });
      await prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "SUCCEEDED", completedAt: new Date(), output: { assetId: asset.id } } });
      return { assetId: asset.id };
    } catch (error) {
      await prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "FAILED", completedAt: new Date(), error: error instanceof Error ? error.message : "Portrait generation failed" } }); throw error;
    }
  },
});
