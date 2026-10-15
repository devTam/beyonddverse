import { logger, metadata, queue, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { getContentProvider } from "../src/lib/content/provider";
import { GeneratedPackageSchema } from "../src/lib/content/schema";
import { prisma } from "../src/lib/prisma";
import { assertWithinBudget, recordGenerationCost, tokenCostMicros } from "../src/lib/costs";
import { getProductionSettings } from "../src/lib/settings";

const contentQueue = queue({ name: "content-generation", concurrencyLimit: 3 });
const PipelineInput = z.object({ workflowRunId: z.string().uuid(), projectId: z.string().uuid(), explanationId: z.string().uuid() });
const ContextOutput = z.object({ reference: z.string(), scripture: z.string(), explanation: z.string() });

async function startStep(runId: string, position: number) {
  await prisma.workflowStep.update({
    where: { runId_position: { runId, position } },
    data: { status: "RUNNING", attempts: { increment: 1 }, startedAt: new Date(), error: null },
  });
}

async function finishStep(runId: string, position: number) {
  await prisma.workflowStep.update({
    where: { runId_position: { runId, position } },
    data: { status: "SUCCEEDED", completedAt: new Date() },
  });
}

async function failStep(runId: string, position: number, error: unknown) {
  await prisma.workflowStep.update({
    where: { runId_position: { runId, position } },
    data: { status: "FAILED", completedAt: new Date(), error: error instanceof Error ? error.message : "Unknown task failure" },
  });
}

export const prepareScriptureContext = schemaTask({
  id: "prepare-scripture-context",
  schema: PipelineInput,
  queue: contentQueue,
  run: async (payload) => {
    await startStep(payload.workflowRunId, 1);
    try {
      const { bibleTranslationCode } = await getProductionSettings();
      const [project, explanation] = await Promise.all([
        prisma.chapterProject.findUniqueOrThrow({
          where: { id: payload.projectId },
          include: { chapter: { include: { book: true, verses: { where: { translation: { code: bibleTranslationCode } }, orderBy: { number: "asc" } } } } },
        }),
        prisma.explanation.findUniqueOrThrow({ where: { id: payload.explanationId } }),
      ]);
      if (explanation.projectId !== project.id) throw new Error("Explanation does not belong to this project.");
      const output = ContextOutput.parse({
        reference: `${project.chapter.book.name} ${project.chapter.number}`,
        scripture: project.chapter.verses.map((verse) => `${verse.number}. ${verse.text}`).join("\n"),
        explanation: explanation.editableText,
      });
      await finishStep(payload.workflowRunId, 1);
      return output;
    } catch (error) {
      await failStep(payload.workflowRunId, 1, error);
      throw error;
    }
  },
});

export const generateStructuredPackage = schemaTask({
  id: "generate-structured-content-package",
  schema: PipelineInput.extend({ context: ContextOutput }),
  queue: contentQueue,
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 2_000, maxTimeoutInMs: 30_000, randomize: true },
  run: async (payload) => {
    await startStep(payload.workflowRunId, 2);
    try {
      await assertWithinBudget(payload.projectId);
      const generated = await getContentProvider().generate(payload.context, async (usage) => {
        await recordGenerationCost({ projectId: payload.projectId, provider: usage.provider, model: usage.model, operation: "CONTENT_GENERATION", amountMicros: tokenCostMicros(usage.inputTokens, usage.outputTokens), units: { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens } });
      });
      await finishStep(payload.workflowRunId, 2);
      return generated;
    } catch (error) {
      await failStep(payload.workflowRunId, 2, error);
      throw error;
    }
  },
});

function referencedVerses(reference: string) {
  const match = reference.match(/:(\d+)(?:[–-](\d+))?$/);
  if (!match) return [];
  const start = Number(match[1]);
  const end = Number(match[2] ?? match[1]);
  return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
}

export const validateScriptureReferences = schemaTask({
  id: "validate-scripture-references",
  schema: PipelineInput.extend({ generated: GeneratedPackageSchema }),
  queue: contentQueue,
  run: async (payload) => {
    await startStep(payload.workflowRunId, 3);
    try {
      const verses = await prisma.bibleVerse.findMany({ where: { chapter: { projects: { some: { id: payload.projectId } } } }, select: { number: true } });
      const available = new Set(verses.map((verse) => verse.number));
      const citations = payload.generated.citations.map((citation) => {
        const numbers = referencedVerses(citation.reference);
        const supported = numbers.length > 0 && numbers.every((number) => available.has(number));
        return { ...citation, supported, note: supported ? "Reference exists in the stored chapter text." : "Reference could not be resolved in the stored chapter text." };
      });
      const sceneReferences = payload.generated.script.scenes
        .filter((scene) => scene.scriptureRef)
        .map((scene) => scene.scriptureRef as string)
        .map((reference) => ({ reference, supported: referencedVerses(reference).every((number) => available.has(number)) }));
      const report = { citations, sceneReferences, valid: citations.every((item) => item.supported) && sceneReferences.every((item) => item.supported) };
      await finishStep(payload.workflowRunId, 3);
      return report;
    } catch (error) {
      await failStep(payload.workflowRunId, 3, error);
      throw error;
    }
  },
});

export const persistContentPackage = schemaTask({
  id: "persist-content-package",
  schema: PipelineInput.extend({ generated: GeneratedPackageSchema, validationReport: z.record(z.string(), z.unknown()) }),
  queue: contentQueue,
  run: async (payload) => {
    await startStep(payload.workflowRunId, 4);
    try {
      const latest = await prisma.contentPackage.findFirst({ where: { projectId: payload.projectId }, orderBy: { version: "desc" } });
      const contentPackage = await prisma.contentPackage.create({
        data: {
          projectId: payload.projectId,
          explanationId: payload.explanationId,
          version: (latest?.version ?? 0) + 1,
          status: "PENDING",
          outline: payload.generated.outline,
          socialCopy: payload.generated.socialCopy,
          metadata: payload.generated.metadata,
          validationReport: payload.validationReport as Prisma.InputJsonValue,
          scripts: { create: [
            {
              kind: "LONG_FORM", revision: 1, title: payload.generated.script.title, hook: payload.generated.script.hook,
              body: payload.generated.script.body, status: "PENDING",
              scenes: { create: payload.generated.script.scenes.map((scene, index) => ({ ...scene, position: index + 1 })) },
            },
            ...payload.generated.shorts.map((short, index) => ({
              kind: `SHORT_${index + 1}`,
              revision: 1,
              ...short,
              status: "PENDING" as const,
              scenes: { create: [{
                position: 1,
                narration: `${short.hook} ${short.body}`,
                visualType: "typography",
                visualPrompt: `Premium editorial Bible education visual for “${short.title}”. Warm gold light, dark neutral and deep green palette, generous negative space, no depiction of God, no embedded text.`,
                scriptureRef: null,
                durationMs: Math.max(30_000, Math.min(60_000, Math.round(`${short.hook} ${short.body}`.split(/\s+/).length / 2.4 * 1_000))),
              }] },
            })),
          ] },
        },
      });
      await finishStep(payload.workflowRunId, 4);
      return { contentPackageId: contentPackage.id };
    } catch (error) {
      await failStep(payload.workflowRunId, 4, error);
      throw error;
    }
  },
});

export const contentPipeline = schemaTask({
  id: "chapter-content-pipeline",
  schema: PipelineInput,
  queue: contentQueue,
  maxDuration: 900,
  run: async (payload, { ctx }) => {
    metadata.set("projectId", payload.projectId).set("workflowRunId", payload.workflowRunId).set("stage", "context");
    await prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "RUNNING", startedAt: new Date() } });
    try {
      const context = await prepareScriptureContext.triggerAndWait(payload).unwrap();
      metadata.set("stage", "generation");
      const generated = await generateStructuredPackage.triggerAndWait({ ...payload, context }).unwrap();
      metadata.set("stage", "validation");
      const validationReport = await validateScriptureReferences.triggerAndWait({ ...payload, generated }).unwrap();
      metadata.set("stage", "persistence");
      const output = await persistContentPackage.triggerAndWait({ ...payload, generated, validationReport }).unwrap();
      await prisma.$transaction([
        prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "SUCCEEDED", completedAt: new Date(), output: { triggerRunId: ctx.run.id, ...output } } }),
        prisma.chapterProject.update({ where: { id: payload.projectId }, data: { status: "SCRIPT_REVIEW", currentStage: 3 } }),
      ]);
      metadata.set("stage", "complete").set("contentPackageId", output.contentPackageId);
      return output;
    } catch (error) {
      logger.error("Content pipeline failed", { workflowRunId: payload.workflowRunId, error: error instanceof Error ? error.message : String(error) });
      await prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "FAILED", completedAt: new Date(), error: error instanceof Error ? error.message : "Unknown pipeline failure" } });
      throw error;
    }
  },
});
import "../src/lib/observability/node";
