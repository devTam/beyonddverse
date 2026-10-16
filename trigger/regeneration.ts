import { generateText } from "ai";
import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";
import { assertWithinBudget, recordGenerationCost, tokenCostMicros } from "../src/lib/costs";
import { lessonTranscript, scenesFromText } from "../src/lib/content/lesson";
import { prisma } from "../src/lib/prisma";
import { getProductionSettings } from "../src/lib/settings";

const Input = z.object({ workflowRunId: z.string().uuid(), projectId: z.string().uuid(), scriptId: z.string().uuid(), field: z.enum(["hook", "body"]) });
export const regenerateScriptSection = schemaTask({
  id: "regenerate-script-section", schema: Input, retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 2_000, maxTimeoutInMs: 30_000 }, maxDuration: 600,
  run: async (payload) => {
    const step = { runId_position: { runId: payload.workflowRunId, position: 1 } };
    await prisma.$transaction([prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "RUNNING", startedAt: new Date() } }), prisma.workflowStep.update({ where: step, data: { status: "RUNNING", attempts: { increment: 1 }, startedAt: new Date() } })]);
    try {
      await assertWithinBudget(payload.projectId);
      const { textModel: model, bibleTranslationCode } = await getProductionSettings();
      const script = await prisma.script.findUniqueOrThrow({ where: { id: payload.scriptId }, include: { scenes: { orderBy: { position: "asc" } }, contentPackage: { include: { explanation: true, project: { include: { chapter: { include: { book: true, verses: { where: { translation: { code: bibleTranslationCode } }, orderBy: { number: "asc" } } } } } } } } } });
      const newest = await prisma.script.findFirst({ where: { contentPackageId: script.contentPackageId, kind: script.kind }, orderBy: { revision: "desc" } });
      if (newest?.id !== script.id) throw new Error("Only the latest script revision can be regenerated.");
      const scripture = script.contentPackage.project.chapter.verses.map((verse) => `${verse.number}. ${verse.text}`).join("\n");
      const result = await generateText({ model, temperature: 0.2, system: "Revise only the requested Bible teaching script section. Preserve every teaching point from the creator explanation; faithfully polish without adding new claims or targeting a fixed duration. Never invent Scripture quotations, and return only the replacement text.", prompt: `FIELD: ${payload.field}\nREFERENCE: ${script.contentPackage.project.chapter.book.name} ${script.contentPackage.project.chapter.number}\nSCRIPTURE:\n${scripture}\nCREATOR EXPLANATION:\n${script.contentPackage.explanation.editableText}\nCURRENT TITLE: ${script.title}\nCURRENT HOOK: ${script.hook}\nCURRENT BODY:\n${script.body}` });
      const text = result.text.trim(); if (payload.field === "hook" && text.length < 10) throw new Error("Regenerated hook was too short."); if (payload.field === "body" && text.length < 200) throw new Error("Regenerated body was too short.");
      const scenes = payload.field === "body" ? scenesFromText(text) : script.scenes.map((scene) => ({ narration: scene.narration, visualType: scene.visualType, visualPrompt: scene.visualPrompt, scriptureRef: scene.scriptureRef, scriptureCue: scene.scriptureCue, presentation: scene.presentation, durationMs: scene.durationMs }));
      if (payload.field === "hook") scenes[0] = { ...scenes[0], narration: `${text} ${scenes[0].narration}` };
      const revision = await prisma.$transaction(async (tx) => {
        const created = await tx.script.create({ data: { contentPackageId: script.contentPackageId, parentId: script.id, kind: script.kind, productionVersion: 2, scriptureTranslation: script.scriptureTranslation, revision: script.revision + 1, title: script.title, hook: payload.field === "hook" ? text : script.hook, body: lessonTranscript(scenes), status: "PENDING", scenes: { create: scenes.map((scene, i) => ({ ...scene, position: i + 1 })) } } });
        await tx.script.update({ where: { id: script.id }, data: { status: "DRAFT" } });
        await tx.contentVariant.updateMany({ where: { contentPackageId: script.contentPackageId }, data: { status: "PENDING" } });
        return created;
      });
      await recordGenerationCost({ projectId: payload.projectId, provider: "vercel-ai-gateway", model, operation: `REGENERATE_${payload.field.toUpperCase()}`, amountMicros: tokenCostMicros(result.usage.inputTokens ?? 0, result.usage.outputTokens ?? 0), units: { inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 } });
      await prisma.$transaction([prisma.workflowStep.update({ where: step, data: { status: "SUCCEEDED", completedAt: new Date() } }), prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "SUCCEEDED", completedAt: new Date(), output: { scriptId: revision.id } } })]);
      return { scriptId: revision.id };
    } catch (error) { const message = error instanceof Error ? error.message : "Section regeneration failed"; await prisma.$transaction([prisma.workflowStep.update({ where: step, data: { status: "FAILED", completedAt: new Date(), error: message } }), prisma.workflowRun.update({ where: { id: payload.workflowRunId }, data: { status: "FAILED", completedAt: new Date(), error: message } })]); throw error; }
  },
});
import "../src/lib/observability/node";
