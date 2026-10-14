"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { contentHash } from "@/lib/content/provider";
import type { contentPipeline } from "../../trigger/content-pipeline";
import type { narrationPipeline } from "../../trigger/narration";
import type { visualPipeline } from "../../trigger/visuals";
import type { renderLongFormVideo } from "../../trigger/rendering";

const ExplanationInput = z.object({
  projectId: z.string().uuid(),
  explanation: z.string().trim().min(80, "Add at least 80 characters so the creator's interpretation remains primary."),
});

const ScriptRevisionInput = z.object({
  scriptId: z.string().uuid(),
  title: z.string().trim().min(3).max(180),
  hook: z.string().trim().min(10).max(1_000),
  body: z.string().trim().min(200),
});

const SceneRevisionInput = z.object({
  id: z.string().uuid(),
  narration: z.string().trim().min(1),
  visualPrompt: z.string().trim().min(1),
  scriptureRef: z.string().trim().max(120).nullable(),
  durationMs: z.number().int().min(1_000).max(300_000),
});

export async function saveExplanation(formData: FormData) {
  const session = await requireUser(await headers());
  const input = ExplanationInput.parse(Object.fromEntries(formData));
  const latest = await prisma.explanation.findFirst({ where: { projectId: input.projectId }, orderBy: { revision: "desc" } });
  await prisma.$transaction([
    prisma.explanation.create({
      data: {
        projectId: input.projectId,
        revision: (latest?.revision ?? 0) + 1,
        sourceType: "TEXT",
        originalText: input.explanation,
        editableText: input.explanation,
        authorId: session.user.id,
      },
    }),
    prisma.chapterProject.update({ where: { id: input.projectId }, data: { status: "WRITING", currentStage: 2 } }),
  ]);
  revalidatePath("/studio/genesis-1");
}

export async function generateContent(formData: FormData) {
  await requireUser(await headers());
  const projectId = z.string().uuid().parse(formData.get("projectId"));
  if (!process.env.TRIGGER_SECRET_KEY) throw new Error("TRIGGER_SECRET_KEY is required to start content generation.");
  const explanation = await prisma.explanation.findFirst({ where: { projectId }, orderBy: { revision: "desc" } });
  if (!explanation) throw new Error("Save an explanation before generating content.");

  const baseKey = `content:${projectId}:${explanation.id}`;
  const existing = await prisma.workflowRun.findFirst({ where: { idempotencyKey: { startsWith: baseKey } }, orderBy: { startedAt: "desc" } });
  if (existing && ["QUEUED", "RUNNING", "WAITING", "SUCCEEDED"].includes(existing.status)) {
    redirect(`/studio/genesis-1?workflow=${existing.id}`);
  }
  const idempotencyKey = existing ? `${baseKey}:retry:${Date.now()}` : baseKey;
  const run = await prisma.workflowRun.create({
    data: {
      projectId,
      type: "CONTENT_PACKAGE",
      status: "QUEUED",
      idempotencyKey,
      input: { explanationId: explanation.id },
      steps: { create: [
        { position: 1, name: "Prepare Scripture context" },
        { position: 2, name: "Generate structured package" },
        { position: 3, name: "Validate Scripture citations" },
        { position: 4, name: "Persist versioned artifacts" },
      ] },
    },
  });
  try {
    const handle = await tasks.trigger<typeof contentPipeline>(
      "chapter-content-pipeline",
      { workflowRunId: run.id, projectId, explanationId: explanation.id },
      { idempotencyKey, idempotencyKeyTTL: "30d", tags: [`project:${projectId}`, `workflow:${run.id}`] },
    );
    await prisma.workflowRun.update({ where: { id: run.id }, data: { output: { triggerRunId: handle.id } } });
  } catch (error) {
    await prisma.workflowRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), error: error instanceof Error ? error.message : "Unknown generation failure" } });
    throw error;
  }
  redirect(`/studio/genesis-1?workflow=${run.id}`);
}

export async function approveScript(formData: FormData) {
  const session = await requireUser(await headers());
  const scriptId = z.string().uuid().parse(formData.get("scriptId"));
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId }, include: { contentPackage: true } });
  const laterRevision = await prisma.script.findFirst({ where: { contentPackageId: script.contentPackageId, kind: script.kind, revision: { gt: script.revision } } });
  if (laterRevision) throw new Error("Only the latest script revision can be approved.");
  const report = script.contentPackage.validationReport as { valid?: boolean } | null;
  if (!report?.valid) throw new Error("Resolve Scripture validation issues before approval.");
  await prisma.$transaction([
    prisma.script.update({ where: { id: scriptId }, data: { status: "APPROVED" } }),
    prisma.contentPackage.update({ where: { id: script.contentPackageId }, data: { status: "APPROVED" } }),
    prisma.approvalEvent.create({ data: { scriptId, actorId: session.user.id, action: "APPROVED", note: "Approved for media production" } }),
    prisma.chapterProject.update({ where: { id: script.contentPackage.projectId }, data: { status: "MEDIA_PRODUCTION", currentStage: 4 } }),
  ]);
  revalidatePath("/");
  revalidatePath("/studio/genesis-1");
}

export async function saveScriptRevision(formData: FormData) {
  const session = await requireUser(await headers());
  const input = ScriptRevisionInput.parse(Object.fromEntries(formData));
  const current = await prisma.script.findUniqueOrThrow({ where: { id: input.scriptId }, include: { scenes: { orderBy: { position: "asc" } } } });
  const latest = await prisma.script.findFirst({ where: { contentPackageId: current.contentPackageId, kind: current.kind }, orderBy: { revision: "desc" } });
  if (latest?.id !== current.id) throw new Error("This revision is no longer current. Reload before editing.");
  const scenes = current.scenes.map((scene) => SceneRevisionInput.parse({
    id: scene.id,
    narration: formData.get(`scene.${scene.id}.narration`),
    visualPrompt: formData.get(`scene.${scene.id}.visualPrompt`),
    scriptureRef: String(formData.get(`scene.${scene.id}.scriptureRef`) ?? "").trim() || null,
    durationMs: Number(formData.get(`scene.${scene.id}.durationMs`)),
  }));
  const next = await prisma.$transaction(async (tx) => {
    const created = await tx.script.create({ data: {
      contentPackageId: current.contentPackageId,
      parentId: current.id,
      kind: current.kind,
      revision: current.revision + 1,
      title: input.title,
      hook: input.hook,
      body: input.body,
      status: "PENDING",
      scenes: { create: current.scenes.map((scene, index) => ({
        position: scene.position,
        narration: scenes[index].narration,
        visualType: scene.visualType,
        visualPrompt: scenes[index].visualPrompt,
        scriptureRef: scenes[index].scriptureRef,
        durationMs: scenes[index].durationMs,
      })) },
    } });
    await tx.script.update({ where: { id: current.id }, data: { status: current.status === "APPROVED" ? "DRAFT" : current.status } });
    await tx.contentPackage.update({ where: { id: current.contentPackageId }, data: { status: "PENDING" } });
    await tx.approvalEvent.create({ data: { scriptId: created.id, actorId: session.user.id, action: "REVISION_CREATED", note: `Revision ${created.revision} created from revision ${current.revision}` } });
    return created;
  });
  revalidatePath("/studio/genesis-1");
  redirect(`/studio/genesis-1?script=${next.id}`);
}

export async function rejectScript(formData: FormData) {
  const session = await requireUser(await headers());
  const scriptId = z.string().uuid().parse(formData.get("scriptId"));
  const note = z.string().trim().min(10).max(1_000).parse(formData.get("note"));
  await prisma.$transaction([
    prisma.script.update({ where: { id: scriptId }, data: { status: "REJECTED" } }),
    prisma.approvalEvent.create({ data: { scriptId, actorId: session.user.id, action: "REJECTED", note } }),
  ]);
  revalidatePath("/studio/genesis-1");
}

export async function reopenScript(formData: FormData) {
  const session = await requireUser(await headers());
  const scriptId = z.string().uuid().parse(formData.get("scriptId"));
  const script = await prisma.script.update({ where: { id: scriptId }, data: { status: "PENDING" } });
  await prisma.$transaction([
    prisma.contentPackage.update({ where: { id: script.contentPackageId }, data: { status: "PENDING" } }),
    prisma.approvalEvent.create({ data: { scriptId, actorId: session.user.id, action: "REOPENED", note: "Approved script reopened for editorial changes" } }),
  ]);
  revalidatePath("/studio/genesis-1");
}

export async function generateNarration(formData: FormData) {
  await requireUser(await headers());
  if (!process.env.TRIGGER_SECRET_KEY) throw new Error("TRIGGER_SECRET_KEY is required to start narration generation.");
  const scriptId = z.string().uuid().parse(formData.get("scriptId"));
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId }, include: { scenes: { orderBy: { position: "asc" } }, contentPackage: true } });
  if (script.status !== "APPROVED") throw new Error("Approve the script before generating narration.");
  if (!script.scenes.length) throw new Error("The script has no scenes to narrate.");
  const narrationConfigHash = contentHash(JSON.stringify({ model: process.env.AI_SPEECH_MODEL, voice: process.env.TTS_VOICE, speed: process.env.TTS_SPEED ?? "1", dictionary: process.env.PRONUNCIATION_DICTIONARY ?? "{}" })).slice(0, 16);
  const baseKey = `narration:${script.id}:${narrationConfigHash}`;
  const existing = await prisma.workflowRun.findFirst({ where: { idempotencyKey: { startsWith: baseKey } }, orderBy: { startedAt: "desc" } });
  if (existing && ["QUEUED", "RUNNING", "WAITING", "SUCCEEDED"].includes(existing.status)) redirect(`/studio/genesis-1?workflow=${existing.id}`);
  const idempotencyKey = existing ? `${baseKey}:retry:${Date.now()}` : baseKey;
  const run = await prisma.workflowRun.create({ data: {
    projectId: script.contentPackage.projectId,
    type: "NARRATION",
    status: "QUEUED",
    idempotencyKey,
    input: { scriptId: script.id },
    steps: { create: script.scenes.map((scene, index) => ({ position: index + 1, name: `Narrate scene ${scene.position}` })) },
  } });
  try {
    const handle = await tasks.trigger<typeof narrationPipeline>("generate-script-narration", { workflowRunId: run.id, projectId: script.contentPackage.projectId, scriptId: script.id }, { idempotencyKey, idempotencyKeyTTL: "30d", tags: [`project:${script.contentPackage.projectId}`, `script:${script.id}`, `workflow:${run.id}`] });
    await prisma.workflowRun.update({ where: { id: run.id }, data: { output: { triggerRunId: handle.id } } });
  } catch (error) {
    await prisma.workflowRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), error: error instanceof Error ? error.message : "Unable to dispatch narration" } });
    throw error;
  }
  redirect(`/studio/genesis-1?workflow=${run.id}`);
}

export async function generateVisuals(formData: FormData) {
  await requireUser(await headers());
  if (!process.env.TRIGGER_SECRET_KEY) throw new Error("TRIGGER_SECRET_KEY is required to start visual generation.");
  const scriptId = z.string().uuid().parse(formData.get("scriptId"));
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId }, include: { scenes: { orderBy: { position: "asc" }, include: { narrations: true } }, contentPackage: true } });
  if (script.status !== "APPROVED") throw new Error("Approve the script before generating visuals.");
  if (script.scenes.some((scene) => !scene.narrations.length)) throw new Error("Generate narration for every scene before visuals.");
  const visualConfigHash = contentHash(JSON.stringify({ model: process.env.AI_IMAGE_MODEL, brand: "beyond-the-verse-v1" })).slice(0, 16);
  const baseKey = `visuals:${script.id}:${visualConfigHash}`;
  const existing = await prisma.workflowRun.findFirst({ where: { idempotencyKey: { startsWith: baseKey } }, orderBy: { startedAt: "desc" } });
  if (existing && ["QUEUED", "RUNNING", "WAITING", "SUCCEEDED"].includes(existing.status)) redirect(`/studio/genesis-1?workflow=${existing.id}`);
  const idempotencyKey = existing ? `${baseKey}:retry:${Date.now()}` : baseKey;
  const run = await prisma.workflowRun.create({ data: {
    projectId: script.contentPackage.projectId, type: "VISUAL_GENERATION", status: "QUEUED", idempotencyKey, input: { scriptId: script.id },
    steps: { create: script.scenes.map((scene, index) => ({ position: index + 1, name: `Generate visual ${scene.position}` })) },
  } });
  try {
    const handle = await tasks.trigger<typeof visualPipeline>("generate-script-visuals", { workflowRunId: run.id, projectId: script.contentPackage.projectId, scriptId: script.id }, { idempotencyKey, idempotencyKeyTTL: "30d", tags: [`project:${script.contentPackage.projectId}`, `script:${script.id}`, `workflow:${run.id}`] });
    await prisma.workflowRun.update({ where: { id: run.id }, data: { output: { triggerRunId: handle.id } } });
  } catch (error) {
    await prisma.workflowRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), error: error instanceof Error ? error.message : "Unable to dispatch visual generation" } });
    throw error;
  }
  redirect(`/studio/genesis-1?workflow=${run.id}`);
}

export async function renderLongVideo(formData: FormData) {
  await requireUser(await headers());
  if (!process.env.TRIGGER_SECRET_KEY) throw new Error("TRIGGER_SECRET_KEY is required to start rendering.");
  const scriptId = z.string().uuid().parse(formData.get("scriptId"));
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId }, include: { scenes: { include: { narrations: true, assetUsages: { where: { role: "PRIMARY_VISUAL" } } } }, contentPackage: true } });
  if (script.status !== "APPROVED") throw new Error("Approve the script before rendering.");
  if (script.scenes.some((scene) => !scene.narrations.length || !scene.assetUsages.length)) throw new Error("Every scene needs narration and an approved visual before rendering.");
  const idempotencyKey = `render:long:${script.id}:v1`;
  const existing = await prisma.workflowRun.findUnique({ where: { idempotencyKey } });
  if (existing) redirect(`/studio/genesis-1?workflow=${existing.id}`);
  const render = await prisma.videoRender.create({ data: { format: "16:9", composition: "YouTubeLong", status: "QUEUED", input: { scriptId: script.id } } });
  const run = await prisma.workflowRun.create({ data: { projectId: script.contentPackage.projectId, type: "LONG_FORM_RENDER", status: "QUEUED", idempotencyKey, input: { scriptId: script.id, renderId: render.id }, steps: { create: { position: 1, name: "Render 16:9 master" } } } });
  try {
    const handle = await tasks.trigger<typeof renderLongFormVideo>("render-long-form-video", { workflowRunId: run.id, renderId: render.id }, { idempotencyKey, idempotencyKeyTTL: "30d", tags: [`project:${script.contentPackage.projectId}`, `script:${script.id}`, `render:${render.id}`] });
    await prisma.workflowRun.update({ where: { id: run.id }, data: { output: { triggerRunId: handle.id, renderId: render.id } } });
  } catch (error) {
    await prisma.$transaction([
      prisma.videoRender.update({ where: { id: render.id }, data: { status: "FAILED", error: error instanceof Error ? error.message : "Unable to dispatch render" } }),
      prisma.workflowRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), error: error instanceof Error ? error.message : "Unable to dispatch render" } }),
    ]);
    throw error;
  }
  redirect(`/studio/genesis-1?workflow=${run.id}`);
}
