import { schemaTask } from "@trigger.dev/sdk";
import { transcribe } from "ai";
import { z } from "zod";
import { createSignedDeliveryUrl } from "../src/lib/storage/cloudinary";
import { prisma } from "../src/lib/prisma";

const TranscriptionInput = z.object({
  workflowRunId: z.string().uuid(),
  projectId: z.string().uuid(),
  assetId: z.string().uuid(),
});

export const transcribeExplanation = schemaTask({
  id: "transcribe-explanation-audio",
  schema: TranscriptionInput,
  retry: { maxAttempts: 4, factor: 2, minTimeoutInMs: 2_000, maxTimeoutInMs: 60_000, randomize: true },
  maxDuration: 900,
  run: async (payload, { ctx }) => {
    const model = process.env.AI_TRANSCRIPTION_MODEL;
    if (!model) throw new Error("AI_TRANSCRIPTION_MODEL is required for audio transcription.");
    await prisma.$transaction([
      prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "RUNNING", startedAt: new Date() } }),
      prisma.workflowStep.update({ where: { runId_position: { runId: payload.workflowRunId, position: 1 } }, data: { status: "RUNNING", attempts: { increment: 1 }, startedAt: new Date() } }),
    ]);
    try {
      const asset = await prisma.asset.findUniqueOrThrow({ where: { id: payload.assetId } });
      if (asset.kind !== "SOURCE_AUDIO") throw new Error("The supplied asset is not source audio.");
      const result = await transcribe({
        model,
        audio: new URL(createSignedDeliveryUrl(asset)),
        maxRetries: 2,
        telemetry: { isEnabled: true, functionId: "explanation-transcription", recordInputs: false, recordOutputs: false },
      });
      if (result.text.trim().length < 20) throw new Error("The transcription was too short to use as an explanation.");
      const latest = await prisma.explanation.findFirst({ where: { projectId: payload.projectId }, orderBy: { revision: "desc" } });
      const explanation = await prisma.$transaction(async (tx) => {
        const created = await tx.explanation.create({ data: {
          projectId: payload.projectId,
          revision: (latest?.revision ?? 0) + 1,
          sourceType: "AUDIO",
          originalText: result.text,
          editableText: result.text,
          sourceAssetId: asset.id,
        } });
        await tx.workflowStep.update({ where: { runId_position: { runId: payload.workflowRunId, position: 1 } }, data: { status: "SUCCEEDED", completedAt: new Date() } });
        await tx.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "SUCCEEDED", completedAt: new Date(), output: { triggerRunId: ctx.run.id, explanationId: created.id, language: result.language, durationInSeconds: result.durationInSeconds, segments: result.segments } } });
        await tx.chapterProject.update({ where: { id: payload.projectId }, data: { status: "WRITING", currentStage: 2 } });
        return created;
      });
      return { explanationId: explanation.id, text: explanation.editableText };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown transcription failure";
      await prisma.$transaction([
        prisma.workflowStep.update({ where: { runId_position: { runId: payload.workflowRunId, position: 1 } }, data: { status: "FAILED", completedAt: new Date(), error: message } }),
        prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "FAILED", completedAt: new Date(), error: message } }),
      ]);
      throw error;
    }
  },
});
