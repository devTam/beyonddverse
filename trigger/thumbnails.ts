import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { assertWithinBudget, configuredRate } from "../src/lib/costs";
import { getImageProvider } from "../src/lib/visuals/image-provider";
import { uploadAndCreateAsset } from "../src/lib/storage/cloudinary";
import { prisma } from "../src/lib/prisma";
import { getProductionSettings } from "../src/lib/settings";

const Input = z.object({ workflowRunId: z.string().uuid(), projectId: z.string().uuid(), contentPackageId: z.string().uuid() });
export const generateThumbnail = schemaTask({
  id: "generate-content-thumbnail", schema: Input, retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 3_000, maxTimeoutInMs: 60_000 }, maxDuration: 900,
  run: async (payload) => {
    const step = { runId_position: { runId: payload.workflowRunId, position: 1 } };
    await prisma.$transaction([prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "RUNNING", startedAt: new Date() } }), prisma.workflowStep.update({ where: step, data: { status: "RUNNING", attempts: { increment: 1 }, startedAt: new Date() } })]);
    try {
      await assertWithinBudget(payload.projectId);
      const content = await prisma.contentPackage.findUniqueOrThrow({ where: { id: payload.contentPackageId } });
      const settings = await getProductionSettings();
      const metadata = content.metadata as Record<string, unknown>;
      const prompt = String(metadata.thumbnailConcept ?? "Premium editorial Bible teaching thumbnail with dramatic warm gold light and generous negative space");
      const visual = await getImageProvider().generate(`${prompt}. Create a high-contrast YouTube thumbnail background with no embedded text. Brand: ${settings.brandName}. Palette: ${settings.primaryColor}, ${settings.accentColor}.`, { model: settings.thumbnailModel, aspectRatio: "16:9" });
      const asset = await uploadAndCreateAsset({ body: visual.body, kind: "THUMBNAIL", mimeType: visual.mimeType, filename: `thumbnail-${content.id}.${visual.format}`, projectId: payload.projectId });
      const storage = (asset.providerMetadata ?? {}) as Prisma.JsonObject;
      await prisma.$transaction([
        prisma.asset.update({ where: { id: asset.id }, data: { providerMetadata: { ...storage, generation: { prompt, provider: visual.provider, model: visual.model, aspectRatio: "16:9" }, contentPackageId: content.id } } }),
        prisma.generationCost.create({ data: { projectId: payload.projectId, provider: visual.provider, model: visual.model, operation: "THUMBNAIL", amountMicros: BigInt(Math.round(configuredRate("AI_IMAGE_COST_USD") * 1_000_000)), units: { images: 1 } } }),
        prisma.workflowStep.update({ where: step, data: { status: "SUCCEEDED", completedAt: new Date() } }),
        prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "SUCCEEDED", completedAt: new Date(), output: { assetId: asset.id } } }),
      ]);
      return { assetId: asset.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Thumbnail generation failed";
      await prisma.$transaction([prisma.workflowStep.update({ where: step, data: { status: "FAILED", completedAt: new Date(), error: message } }), prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "FAILED", completedAt: new Date(), error: message } })]);
      throw error;
    }
  },
});
import "../src/lib/observability/node";
