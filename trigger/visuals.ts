import { metadata, queue, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { contentHash } from "../src/lib/content/provider";
import { getImageProvider } from "../src/lib/visuals/image-provider";
import { uploadAndCreateAsset } from "../src/lib/storage/cloudinary";
import { prisma } from "../src/lib/prisma";

const visualQueue = queue({ name: "scene-visual-generation", concurrencyLimit: 2 });
const SceneInput = z.object({ workflowRunId: z.string().uuid(), projectId: z.string().uuid(), sceneId: z.string().uuid(), position: z.number().int().positive() });
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
      const model = process.env.AI_IMAGE_MODEL;
      if (!model) throw new Error("AI_IMAGE_MODEL is required.");
      const inputHash = contentHash(JSON.stringify({ prompt: scene.visualPrompt, model, aspectRatio: "16:9", brand: "beyond-the-verse-v1" }));
      const cached = await prisma.asset.findFirst({ where: { kind: "IMAGE", providerMetadata: { path: ["generation", "inputHash"], equals: inputHash } } });
      const asset = cached ?? await (async () => {
        const visual = await getImageProvider().generate(scene.visualPrompt);
        const created = await uploadAndCreateAsset({ body: visual.body, kind: "IMAGE", mimeType: visual.mimeType, filename: `scene-${scene.position}.${visual.format}`, projectId: payload.projectId });
        const storage = (created.providerMetadata ?? {}) as Prisma.JsonObject;
        return prisma.asset.update({ where: { id: created.id }, data: { providerMetadata: { ...storage, generation: { inputHash, prompt: scene.visualPrompt, provider: visual.provider, model: visual.model, aspectRatio: "16:9" } } } });
      })();
      await prisma.assetUsage.upsert({ where: { assetId_sceneId_role: { assetId: asset.id, sceneId: scene.id, role: "PRIMARY_VISUAL" } }, create: { assetId: asset.id, sceneId: scene.id, role: "PRIMARY_VISUAL" }, update: {} });
      await prisma.workflowStep.update({ where: stepKey, data: { status: "SUCCEEDED", completedAt: new Date() } });
      return { assetId: asset.id, cached: Boolean(cached) };
    } catch (error) {
      await prisma.workflowStep.update({ where: stepKey, data: { status: "FAILED", completedAt: new Date(), error: error instanceof Error ? error.message : "Unknown visual failure" } });
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
        const configHash = contentHash(JSON.stringify({ prompt: scene.visualPrompt, model: process.env.AI_IMAGE_MODEL, brand: "beyond-the-verse-v1" }));
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
