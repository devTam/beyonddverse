import { metadata, queue, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { contentHash } from "../src/lib/content/provider";
import { getSpeechProvider } from "../src/lib/audio/tts";
import { uploadAndCreateAsset } from "../src/lib/storage/cloudinary";
import { prisma } from "../src/lib/prisma";
import { assertWithinBudget, configuredRate, recordGenerationCost } from "../src/lib/costs";
import { getProductionSettings } from "../src/lib/settings";

const narrationQueue = queue({ name: "narration-generation", concurrencyLimit: 3 });
const SceneInput = z.object({ workflowRunId: z.string().uuid(), projectId: z.string().uuid(), sceneId: z.string().uuid(), position: z.number().int().positive() });
const PipelineInput = z.object({ workflowRunId: z.string().uuid(), projectId: z.string().uuid(), scriptId: z.string().uuid() });

function wordTimings(text: string, durationMs: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const weight = words.reduce((sum, word) => sum + Math.max(1, word.length), 0);
  let cursor = 0;
  return words.map((word) => { const startMs = cursor; cursor += Math.round(durationMs * Math.max(1, word.length) / weight); return { word, startMs, endMs: cursor }; });
}

export const generateSceneNarration = schemaTask({
  id: "generate-scene-narration",
  schema: SceneInput,
  queue: narrationQueue,
  retry: { maxAttempts: 4, factor: 2, minTimeoutInMs: 2_000, maxTimeoutInMs: 60_000, randomize: true },
  maxDuration: 600,
  run: async (payload) => {
    const stepKey = { runId_position: { runId: payload.workflowRunId, position: payload.position } };
    await prisma.workflowStep.update({ where: stepKey, data: { status: "RUNNING", attempts: { increment: 1 }, startedAt: new Date(), error: null } });
    try {
      const scene = await prisma.scriptScene.findUniqueOrThrow({ where: { id: payload.sceneId }, include: { script: true } });
      if (scene.script.status !== "APPROVED") throw new Error("Narration requires an approved script.");
      const settings = await getProductionSettings();
      const voice = settings.narratorVoice;
      const model = settings.speechModel;
      const inputHash = contentHash(JSON.stringify({ narration: scene.narration, voice, model, speed: settings.speechSpeed, dictionary: settings.pronunciationDictionary }));
      const cached = await prisma.narration.findFirst({ where: { inputHash }, include: { asset: true } });
      const narration = cached
        ? await prisma.narration.create({ data: { sceneId: scene.id, assetId: cached.assetId, provider: cached.provider, voiceId: cached.voiceId, inputHash, timings: cached.timings ?? undefined } })
        : await (async () => {
            await assertWithinBudget(payload.projectId);
            const speech = await getSpeechProvider().synthesize(scene.narration, { model, voice, speed: settings.speechSpeed, pronunciationDictionary: settings.pronunciationDictionary });
            const asset = await uploadAndCreateAsset({ body: speech.audio, kind: "NARRATION", mimeType: speech.mimeType, filename: `scene-${scene.position}.${speech.format}`, projectId: payload.projectId });
            const timings = wordTimings(scene.narration, asset.durationMs ?? scene.durationMs);
            const created = await prisma.narration.create({ data: { sceneId: scene.id, assetId: asset.id, provider: speech.provider, voiceId: speech.voiceId, inputHash, timings } });
            await recordGenerationCost({ projectId: payload.projectId, provider: speech.provider, model, operation: "SPEECH", amountMicros: scene.narration.length * configuredRate("AI_SPEECH_COST_PER_MILLION_CHARACTERS"), units: { characters: scene.narration.length } });
            return created;
          })();
      await prisma.workflowStep.update({ where: stepKey, data: { status: "SUCCEEDED", completedAt: new Date() } });
      return { narrationId: narration.id, assetId: narration.assetId, cached: Boolean(cached) };
    } catch (error) {
      await prisma.workflowStep.update({ where: stepKey, data: { status: "FAILED", completedAt: new Date(), error: error instanceof Error ? error.message : "Unknown narration failure" } });
      throw error;
    }
  },
});

export const narrationPipeline = schemaTask({
  id: "generate-script-narration",
  schema: PipelineInput,
  maxDuration: 1_800,
  run: async (payload, { ctx }) => {
    const script = await prisma.script.findUniqueOrThrow({ where: { id: payload.scriptId }, include: { scenes: { orderBy: { position: "asc" } } } });
    if (script.status !== "APPROVED") throw new Error("Narration requires an approved script.");
    await prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "RUNNING", startedAt: new Date() } });
    metadata.set("projectId", payload.projectId).set("scriptId", payload.scriptId);
    try {
      const results = [];
      for (const [index, scene] of script.scenes.entries()) {
        metadata.set("scene", index + 1);
        const settings = await getProductionSettings();
        const configHash = contentHash(JSON.stringify({ narration: scene.narration, model: settings.speechModel, voice: settings.narratorVoice, speed: settings.speechSpeed, dictionary: settings.pronunciationDictionary }));
        results.push(await generateSceneNarration.triggerAndWait({ ...payload, sceneId: scene.id, position: index + 1 }, { idempotencyKey: `narration:${scene.id}:${configHash}` }).unwrap());
      }
      await prisma.$transaction([
        prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "SUCCEEDED", completedAt: new Date(), output: { triggerRunId: ctx.run.id, scriptId: script.id, scenes: results } } }),
        prisma.chapterProject.update({ where: { id: payload.projectId }, data: { currentStage: 5 } }),
      ]);
      return { scriptId: script.id, scenes: results };
    } catch (error) {
      await prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "FAILED", completedAt: new Date(), error: error instanceof Error ? error.message : "Unknown narration pipeline failure" } });
      throw error;
    }
  },
});
import "../src/lib/observability/node";
