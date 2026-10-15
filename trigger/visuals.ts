import { metadata, queue, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { contentHash } from "../src/lib/content/provider";
import { getImageProvider } from "../src/lib/visuals/image-provider";
import { uploadAndCreateAsset } from "../src/lib/storage/cloudinary";
import { prisma } from "../src/lib/prisma";
import { assertWithinBudget, configuredRate, recordGenerationCost } from "../src/lib/costs";
import { getProductionSettings } from "../src/lib/settings";

const visualQueue = queue({ name: "scene-visual-generation", concurrencyLimit: 2 });
const SceneInput = z.object({ workflowRunId: z.string().uuid(), projectId: z.string().uuid(), sceneId: z.string().uuid(), position: z.number().int().positive(), regenerationId: z.string().uuid().optional() });
const PipelineInput = z.object({ workflowRunId: z.string().uuid(), projectId: z.string().uuid(), scriptId: z.string().uuid() });

export const generateSceneVisual = schemaTask({
  id: "generate-scene-visual",
  schema: SceneInput,
  queue: visualQueue,
  retry: { maxAttempts: 4, factor: 2, minTimeoutInMs: 2_000, maxTimeoutInMs: 90_000, randomize: true },
  maxDuration: 900,
  run: async (payload) => {
    const stepKey = { runId_position: { runId: payload.workflowRunId, position: payload.position } };
    await prisma.workflowStep.update({ where: stepKey, data: { status: "RUNNING", attempts: { increment: 1 }, startedAt: new Date(), error: null } });
    try {
      const scene = await prisma.scriptScene.findUniqueOrThrow({ where: { id: payload.sceneId }, include: { script: true } });
      if (scene.script.status !== "APPROVED") throw new Error("Visual generation requires an approved script.");
      const settings = await getProductionSettings();
      const model = settings.imageModel;
      const inputHash = contentHash(JSON.stringify({ prompt: scene.visualPrompt, model, aspectRatio: "16:9", brand: settings.brandName, colors: [settings.primaryColor, settings.accentColor], regenerationId: payload.regenerationId }));
      const cached = await prisma.asset.findFirst({ where: { kind: "IMAGE", providerMetadata: { path: ["generation", "inputHash"], equals: inputHash } } });
      const asset = cached ?? await (async () => {
        await assertWithinBudget(payload.projectId);
        const visual = await getImageProvider().generate(`${scene.visualPrompt}\nBrand: ${settings.brandName}. Palette: ${settings.primaryColor}, ${settings.accentColor}.`, model);
        const created = await uploadAndCreateAsset({ body: visual.body, kind: "IMAGE", mimeType: visual.mimeType, filename: `scene-${scene.position}.${visual.format}`, projectId: payload.projectId });
        const storage = (created.providerMetadata ?? {}) as Prisma.JsonObject;
        const updated = await prisma.asset.update({ where: { id: created.id }, data: { providerMetadata: { ...storage, generation: { inputHash, prompt: scene.visualPrompt, provider: visual.provider, model: visual.model, aspectRatio: "16:9" } } } });
        await recordGenerationCost({ projectId: payload.projectId, provider: visual.provider, model: visual.model, operation: "IMAGE", amountMicros: configuredRate("AI_IMAGE_COST_USD") * 1_000_000, units: { images: 1 } });
        return updated;
      })();
      await prisma.$transaction([
        prisma.assetUsage.deleteMany({ where: { sceneId: scene.id, role: "PRIMARY_VISUAL" } }),
        prisma.assetUsage.create({ data: { assetId: asset.id, sceneId: scene.id, role: "PRIMARY_VISUAL" } }),
      ]);
      await prisma.workflowStep.update({ where: stepKey, data: { status: "SUCCEEDED", completedAt: new Date() } });
      return { assetId: asset.id, cached: Boolean(cached) };
    } catch (error) {
      await prisma.workflowStep.update({ where: stepKey, data: { status: "FAILED", completedAt: new Date(), error: error instanceof Error ? error.message : "Unknown visual failure" } });
      throw error;
    }
  },
});

export const regenerateSingleSceneVisual = schemaTask({
  id: "regenerate-single-scene-visual",
  schema: SceneInput.extend({ regenerationId: z.string().uuid() }),
  maxDuration: 1_200,
  run: async (payload, { ctx }) => {
    await prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "RUNNING", startedAt: new Date() } });
    try {
      const result = await generateSceneVisual.triggerAndWait(payload, { idempotencyKey: `visual-regeneration:${payload.sceneId}:${payload.regenerationId}` }).unwrap();
      await prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "SUCCEEDED", completedAt: new Date(), output: { ...result, triggerRunId: ctx.run.id } } });
      return result;
    } catch (error) {
      await prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "FAILED", completedAt: new Date(), error: error instanceof Error ? error.message : "Scene visual regeneration failed" } });
      throw error;
    }
  },
});

export const visualPipeline = schemaTask({
  id: "generate-script-visuals",
  schema: PipelineInput,
  maxDuration: 1_800,
  run: async (payload, { ctx }) => {
    const script = await prisma.script.findUniqueOrThrow({ where: { id: payload.scriptId }, include: { scenes: { orderBy: { position: "asc" }, include: { narrations: true } } } });
    if (script.status !== "APPROVED") throw new Error("Visual generation requires an approved script.");
    if (script.scenes.some((scene) => !scene.narrations.length)) throw new Error("Generate narration for every scene before visuals.");
    await prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "RUNNING", startedAt: new Date() } });
    try {
      const results = [];
      for (const [index, scene] of script.scenes.entries()) {
        metadata.set("scene", index + 1);
        const settings = await getProductionSettings();
        const configHash = contentHash(JSON.stringify({ prompt: scene.visualPrompt, model: settings.imageModel, brand: settings.brandName, colors: [settings.primaryColor, settings.accentColor] }));
        results.push(await generateSceneVisual.triggerAndWait({ ...payload, sceneId: scene.id, position: index + 1 }, { idempotencyKey: `visual:${scene.id}:${configHash}` }).unwrap());
      }
      await prisma.$transaction([
        prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "SUCCEEDED", completedAt: new Date(), output: { triggerRunId: ctx.run.id, scriptId: script.id, scenes: results } } }),
        prisma.chapterProject.update({ where: { id: payload.projectId }, data: { currentStage: 6 } }),
      ]);
      return { scriptId: script.id, scenes: results };
    } catch (error) {
      await prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "FAILED", completedAt: new Date(), error: error instanceof Error ? error.message : "Unknown visual pipeline failure" } });
      throw error;
    }
  },
});
import "../src/lib/observability/node";
