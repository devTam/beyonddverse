"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { contentHash } from "@/lib/content/provider";
import { publisherFor } from "@/lib/publishing";
import { decryptSecret } from "@/lib/security/encryption";
import type { contentPipeline } from "../../trigger/content-pipeline";
import type { narrationPipeline } from "../../trigger/narration";
import type { visualPipeline } from "../../trigger/visuals";
import type { renderLongFormVideo } from "../../trigger/rendering";
import type { renderShortFormVideo } from "../../trigger/rendering";
import type { publishScheduledPost } from "../../trigger/publishing";
import type { generateThumbnail } from "../../trigger/thumbnails";
import type { regenerateScriptSection } from "../../trigger/regeneration";

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

export async function openChapterProject(formData: FormData) {
  await requireUser(await headers());
  const chapterId = z.string().uuid().parse(formData.get("chapterId"));
  const chapter = await prisma.bibleChapter.findUniqueOrThrow({ where: { id: chapterId }, include: { book: true, projects: { take: 1, orderBy: { updatedAt: "desc" } } } });
  const project = chapter.projects[0] ?? await prisma.chapterProject.create({ data: { chapterId: chapter.id, title: `${chapter.book.name} ${chapter.number} teaching` } });
  redirect(`/studio/genesis-1?project=${project.id}`);
}

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

export async function updateAssetApproval(formData: FormData) {
  const session = await requireUser(await headers());
  const input = z.object({ assetId: z.string().uuid(), status: z.enum(["APPROVED", "REJECTED"]) }).parse(Object.fromEntries(formData));
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: input.assetId } });
  await prisma.$transaction([
    prisma.asset.update({ where: { id: asset.id }, data: { status: input.status } }),
    prisma.auditLog.create({ data: { actorId: session.user.id, action: `ASSET_${input.status}`, entityType: "Asset", entityId: asset.id, before: { status: asset.status }, after: { status: input.status } } }),
  ]);
  revalidatePath("/assets");
}

export async function resolveOperationalAlert(formData: FormData) {
  const session = await requireUser(await headers());
  const alertId = z.string().uuid().parse(formData.get("alertId"));
  const alert = await prisma.operationalAlert.findUniqueOrThrow({ where: { id: alertId } });
  if (alert.resolvedAt) return;
  const resolvedAt = new Date();
  await prisma.$transaction([
    prisma.operationalAlert.update({ where: { id: alert.id }, data: { resolvedAt } }),
    prisma.auditLog.create({ data: { actorId: session.user.id, action: "OPERATIONAL_ALERT_RESOLVED", entityType: "OperationalAlert", entityId: alert.id, before: { resolvedAt: null }, after: { resolvedAt } } }),
  ]);
  revalidatePath("/operations");
}

export async function selectBackgroundMusic(formData: FormData) {
  const session = await requireUser(await headers());
  const assetId = z.string().uuid().parse(formData.get("assetId"));
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
  if (asset.kind !== "MUSIC" || asset.status !== "APPROVED") throw new Error("Select an approved music asset.");
  await prisma.$transaction([
    prisma.workspaceSetting.upsert({ where: { key: "backgroundMusicAssetId" }, create: { key: "backgroundMusicAssetId", value: asset.id }, update: { value: asset.id } }),
    prisma.auditLog.create({ data: { actorId: session.user.id, action: "BACKGROUND_MUSIC_SELECTED", entityType: "Asset", entityId: asset.id, after: { assetId: asset.id, license: asset.license } } }),
  ]);
  revalidatePath("/settings");
}

export async function generateContentThumbnail(formData: FormData) {
  await requireUser(await headers());
  const scriptId = z.string().uuid().parse(formData.get("scriptId"));
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId }, include: { contentPackage: true } });
  if (script.status !== "APPROVED") throw new Error("Approve the script before generating a thumbnail.");
  const idempotencyKey = `thumbnail:${script.contentPackageId}:${script.revision}`;
  const existing = await prisma.workflowRun.findUnique({ where: { idempotencyKey } });
  if (existing) redirect(`/studio/genesis-1?workflow=${existing.id}`);
  const run = await prisma.workflowRun.create({ data: { projectId: script.contentPackage.projectId, type: "THUMBNAIL", idempotencyKey, input: { contentPackageId: script.contentPackageId }, steps: { create: { position: 1, name: "Generate thumbnail" } } } });
  const handle = await tasks.trigger<typeof generateThumbnail>("generate-content-thumbnail", { workflowRunId: run.id, projectId: script.contentPackage.projectId, contentPackageId: script.contentPackageId }, { idempotencyKey, idempotencyKeyTTL: "30d", tags: [`project:${script.contentPackage.projectId}`, `package:${script.contentPackageId}`] });
  await prisma.workflowRun.update({ where: { id: run.id }, data: { output: { triggerRunId: handle.id } } });
  redirect(`/studio/genesis-1?workflow=${run.id}`);
}

export async function regenerateSection(formData: FormData) {
  await requireUser(await headers());
  const input = z.object({ scriptId: z.string().uuid(), field: z.enum(["hook", "body"]) }).parse(Object.fromEntries(formData));
  const script = await prisma.script.findUniqueOrThrow({ where: { id: input.scriptId }, include: { contentPackage: true } });
  const idempotencyKey = `regenerate:${script.id}:${input.field}`;
  const existing = await prisma.workflowRun.findUnique({ where: { idempotencyKey } });
  if (existing) redirect(`/studio/genesis-1?workflow=${existing.id}`);
  const run = await prisma.workflowRun.create({ data: { projectId: script.contentPackage.projectId, type: "SECTION_REGENERATION", idempotencyKey, input, steps: { create: { position: 1, name: `Regenerate ${input.field}` } } } });
  const handle = await tasks.trigger<typeof regenerateScriptSection>("regenerate-script-section", { workflowRunId: run.id, projectId: script.contentPackage.projectId, ...input }, { idempotencyKey, idempotencyKeyTTL: "30d", tags: [`project:${script.contentPackage.projectId}`, `script:${script.id}`] });
  await prisma.workflowRun.update({ where: { id: run.id }, data: { output: { triggerRunId: handle.id } } });
  redirect(`/studio/genesis-1?workflow=${run.id}`);
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
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId }, include: { contentPackage: true, scenes: true } });
  const laterRevision = await prisma.script.findFirst({ where: { contentPackageId: script.contentPackageId, kind: script.kind, revision: { gt: script.revision } } });
  if (laterRevision) throw new Error("Only the latest script revision can be approved.");
  const report = script.contentPackage.validationReport as { valid?: boolean } | null;
  if (!report?.valid) throw new Error("Resolve Scripture validation issues before approval.");
  await prisma.$transaction(async (tx) => {
    if (script.kind.startsWith("SHORT_") && !script.scenes.length) {
      const narration = `${script.hook} ${script.body}`;
      await tx.scriptScene.create({ data: { scriptId: script.id, position: 1, narration, visualType: "typography", visualPrompt: `Premium editorial Bible education visual for “${script.title}”. Warm gold light, dark neutral and deep green palette, generous negative space, no depiction of God, no embedded text.`, durationMs: Math.max(30_000, Math.min(60_000, Math.round(narration.split(/\s+/).length / 2.4 * 1_000))) } });
    }
    await tx.script.update({ where: { id: scriptId }, data: { status: "APPROVED" } });
    await tx.contentPackage.update({ where: { id: script.contentPackageId }, data: { status: "APPROVED" } });
    await tx.approvalEvent.create({ data: { scriptId, actorId: session.user.id, action: "APPROVED", note: "Approved for media production" } });
    await tx.chapterProject.update({ where: { id: script.contentPackage.projectId }, data: { status: "MEDIA_PRODUCTION", currentStage: 4 } });
  });
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
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId }, include: { scenes: { include: { narrations: true, assetUsages: { where: { role: "PRIMARY_VISUAL" }, include: { asset: true } } } }, contentPackage: true } });
  if (script.status !== "APPROVED") throw new Error("Approve the script before rendering.");
  if (script.scenes.some((scene) => !scene.narrations.length || !scene.assetUsages.length || scene.assetUsages.some((usage) => usage.asset.status !== "APPROVED"))) throw new Error("Every scene needs narration and an approved visual before rendering.");
  const idempotencyKey = `render:long:${script.id}:v1`;
  const existing = await prisma.workflowRun.findUnique({ where: { idempotencyKey } });
  if (existing) redirect(`/studio/genesis-1?workflow=${existing.id}`);
  const render = await prisma.videoRender.create({ data: { format: "16:9", composition: "YouTubeLong", status: "QUEUED", input: { scriptId: script.id } } });
  const longCopy = (script.contentPackage.socialCopy as Record<string, unknown>).youtube ?? null;
  await prisma.contentVariant.upsert({ where: { contentPackageId_platform_kind: { contentPackageId: script.contentPackageId, platform: "YOUTUBE", kind: "LONG_FORM_MASTER" } }, create: { contentPackageId: script.contentPackageId, videoRenderId: render.id, platform: "YOUTUBE", kind: "LONG_FORM_MASTER", metadata: { aspectRatio: "16:9", scriptId: script.id, title: script.title, copy: longCopy } }, update: { videoRenderId: render.id, metadata: { aspectRatio: "16:9", scriptId: script.id, title: script.title, copy: longCopy } } });
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

export async function renderShortVideo(formData: FormData) {
  await requireUser(await headers());
  if (!process.env.TRIGGER_SECRET_KEY) throw new Error("TRIGGER_SECRET_KEY is required to start rendering.");
  const scriptId = z.string().uuid().parse(formData.get("scriptId"));
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId }, include: { scenes: { include: { narrations: true, assetUsages: { where: { role: "PRIMARY_VISUAL" }, include: { asset: true } } } }, contentPackage: true } });
  if (!script.kind.startsWith("SHORT_")) throw new Error("This render action only accepts short scripts.");
  if (script.status !== "APPROVED") throw new Error("Approve the short before rendering.");
  if (!script.scenes.length || script.scenes.some((scene) => !scene.narrations.length || !scene.assetUsages.length || scene.assetUsages.some((usage) => usage.asset.status !== "APPROVED"))) throw new Error("Every short scene needs narration and an approved visual before rendering.");
  const idempotencyKey = `render:short:${script.id}:v1`;
  const existing = await prisma.workflowRun.findUnique({ where: { idempotencyKey } });
  if (existing) redirect(`/studio/genesis-1?workflow=${existing.id}`);
  const render = await prisma.videoRender.create({ data: { format: "9:16", composition: "YouTubeShort", status: "QUEUED", input: { scriptId: script.id } } });
  await prisma.contentVariant.upsert({ where: { contentPackageId_platform_kind: { contentPackageId: script.contentPackageId, platform: "MASTER", kind: script.kind } }, create: { contentPackageId: script.contentPackageId, videoRenderId: render.id, platform: "MASTER", kind: script.kind, metadata: { aspectRatio: "9:16", scriptId: script.id } }, update: { videoRenderId: render.id, metadata: { aspectRatio: "9:16", scriptId: script.id } } });
  const socialCopy = script.contentPackage.socialCopy as Record<string, unknown>;
  const copyKey: Record<string, string> = { YOUTUBE_SHORTS: "youtubeShorts", TIKTOK: "tiktok", INSTAGRAM_REELS: "instagram", FACEBOOK_REELS: "facebook", X: "x" };
  await Promise.all(["YOUTUBE_SHORTS", "TIKTOK", "INSTAGRAM_REELS", "FACEBOOK_REELS", "X"].map((platform) => prisma.contentVariant.upsert({
    where: { contentPackageId_platform_kind: { contentPackageId: script.contentPackageId, platform, kind: script.kind } },
    create: { contentPackageId: script.contentPackageId, videoRenderId: render.id, platform, kind: script.kind, metadata: { aspectRatio: "9:16", scriptId: script.id, copy: socialCopy[copyKey[platform]] ?? null } },
    update: { videoRenderId: render.id, metadata: { aspectRatio: "9:16", scriptId: script.id, copy: socialCopy[copyKey[platform]] ?? null } },
  })));
  const run = await prisma.workflowRun.create({ data: { projectId: script.contentPackage.projectId, type: "SHORT_FORM_RENDER", status: "QUEUED", idempotencyKey, input: { scriptId: script.id, renderId: render.id }, steps: { create: { position: 1, name: `Render ${script.kind.toLowerCase().replace("_", " ")} master` } } } });
  try {
    const handle = await tasks.trigger<typeof renderShortFormVideo>("render-short-form-video", { workflowRunId: run.id, renderId: render.id }, { idempotencyKey, idempotencyKeyTTL: "30d", tags: [`project:${script.contentPackage.projectId}`, `script:${script.id}`, `render:${render.id}`] });
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

export async function createManualSocialAccount(formData: FormData) {
  const session = await requireUser(await headers());
  const input = z.object({ platform: z.enum(["YOUTUBE", "TIKTOK", "INSTAGRAM", "FACEBOOK", "X"]), displayName: z.string().trim().min(2).max(100), timezone: z.string().trim().min(1).max(100) }).parse(Object.fromEntries(formData));
  const account = await prisma.socialAccount.upsert({ where: { platform_externalId: { platform: input.platform, externalId: `manual:${input.platform.toLowerCase()}` } }, create: { platform: input.platform, externalId: `manual:${input.platform.toLowerCase()}`, displayName: input.displayName, timezone: input.timezone, encryptedToken: null }, update: { displayName: input.displayName, timezone: input.timezone } });
  await prisma.auditLog.create({ data: { actorId: session.user.id, action: "MANUAL_SOCIAL_ACCOUNT_CONFIGURED", entityType: "SocialAccount", entityId: account.id, after: { platform: account.platform, displayName: account.displayName, timezone: account.timezone } } });
  revalidatePath("/settings");
  revalidatePath("/calendar");
}

export async function disconnectSocialAccount(formData: FormData) {
  const session = await requireUser(await headers());
  const accountId = z.string().uuid().parse(formData.get("accountId"));
  const account = await prisma.socialAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (account.encryptedToken) await publisherFor(account).revoke(decryptSecret(account.encryptedToken));
  await prisma.$transaction([
    prisma.socialAccount.update({ where: { id: account.id }, data: { encryptedToken: null, encryptedRefreshToken: null, tokenExpiresAt: null, disconnectedAt: new Date() } }),
    prisma.auditLog.create({ data: { actorId: session.user.id, action: "SOCIAL_ACCOUNT_DISCONNECTED", entityType: "SocialAccount", entityId: account.id, before: { platform: account.platform, connected: Boolean(account.encryptedToken) }, after: { connected: false } } }),
  ]);
  revalidatePath("/settings");
  revalidatePath("/calendar");
}

export async function approveVariant(formData: FormData) {
  const session = await requireUser(await headers());
  const variantId = z.string().uuid().parse(formData.get("variantId"));
  const variant = await prisma.contentVariant.findUniqueOrThrow({ where: { id: variantId }, include: { videoRender: true } });
  if (variant.videoRender?.status !== "SUCCEEDED" || !variant.videoRender.assetId) throw new Error("Only a completed render can receive final approval.");
  await prisma.$transaction([
    prisma.contentVariant.update({ where: { id: variant.id }, data: { status: "APPROVED" } }),
    prisma.auditLog.create({ data: { actorId: session.user.id, action: "CONTENT_VARIANT_APPROVED", entityType: "ContentVariant", entityId: variant.id, before: { status: variant.status }, after: { status: "APPROVED" } } }),
  ]);
  revalidatePath("/calendar");
}

export async function schedulePost(formData: FormData) {
  await requireUser(await headers());
  if (!process.env.TRIGGER_SECRET_KEY) throw new Error("TRIGGER_SECRET_KEY is required to schedule publication.");
  const input = z.object({ variantId: z.string().uuid(), socialAccountId: z.string().uuid(), scheduledAt: z.string().datetime({ offset: true }) }).parse(Object.fromEntries(formData));
  const scheduledAt = new Date(input.scheduledAt);
  if (scheduledAt.getTime() < Date.now() + 60_000) throw new Error("Schedule at least one minute in the future.");
  const [variant, account] = await Promise.all([prisma.contentVariant.findUniqueOrThrow({ where: { id: input.variantId }, include: { contentPackage: true, videoRender: true } }), prisma.socialAccount.findUniqueOrThrow({ where: { id: input.socialAccountId } })]);
  if (variant.status !== "APPROVED" || variant.videoRender?.status !== "SUCCEEDED") throw new Error("Final media approval is required before scheduling.");
  const compatible = variant.platform === "MASTER" || variant.platform.startsWith(account.platform);
  if (!compatible) throw new Error("The selected variant is not compatible with this platform account.");
  const idempotencyKey = `publish:${variant.id}:${account.id}:${scheduledAt.toISOString()}`;
  const post = await prisma.scheduledPost.create({ data: { projectId: variant.contentPackage.projectId, variantId: variant.id, socialAccountId: account.id, scheduledAt, status: "SCHEDULED", idempotencyKey } });
  const run = await prisma.workflowRun.create({ data: { projectId: variant.contentPackage.projectId, type: "SOCIAL_PUBLISH", status: "QUEUED", idempotencyKey: `workflow:${idempotencyKey}`, input: { scheduledPostId: post.id }, steps: { create: { position: 1, name: `Publish to ${account.platform}` } } } });
  try {
    const handle = await tasks.trigger<typeof publishScheduledPost>("publish-scheduled-post", { workflowRunId: run.id, scheduledPostId: post.id }, { idempotencyKey, idempotencyKeyTTL: "30d", delay: scheduledAt, tags: [`post:${post.id}`, `platform:${account.platform}`] });
    await prisma.workflowRun.update({ where: { id: run.id }, data: { output: { triggerRunId: handle.id, scheduledPostId: post.id } } });
  } catch (error) {
    await prisma.$transaction([
      prisma.scheduledPost.update({ where: { id: post.id }, data: { status: "FAILED" } }),
      prisma.workflowRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), error: error instanceof Error ? error.message : "Unable to schedule publication" } }),
    ]);
    throw error;
  }
  revalidatePath("/calendar");
}

export async function cancelScheduledPost(formData: FormData) {
  const session = await requireUser(await headers());
  const postId = z.string().uuid().parse(formData.get("postId"));
  const post = await prisma.scheduledPost.findUniqueOrThrow({ where: { id: postId } });
  if (!["SCHEDULED", "AWAITING_APPROVAL", "MANUAL_REQUIRED"].includes(post.status)) throw new Error("This publication can no longer be canceled.");
  await prisma.$transaction([
    prisma.scheduledPost.update({ where: { id: post.id }, data: { status: "CANCELED" } }),
    prisma.auditLog.create({ data: { actorId: session.user.id, action: "SCHEDULED_POST_CANCELED", entityType: "ScheduledPost", entityId: post.id, before: { status: post.status }, after: { status: "CANCELED" } } }),
  ]);
  revalidatePath("/calendar");
}

export async function reschedulePost(formData: FormData) {
  await requireUser(await headers());
  const input = z.object({ postId: z.string().uuid(), scheduledAt: z.string().datetime({ offset: true }) }).parse(Object.fromEntries(formData));
  const post = await prisma.scheduledPost.findUniqueOrThrow({ where: { id: input.postId } });
  if (!["SCHEDULED", "MANUAL_REQUIRED"].includes(post.status)) throw new Error("Only pending publications can be rescheduled.");
  await prisma.scheduledPost.update({ where: { id: post.id }, data: { status: "CANCELED" } });
  const replacement = new FormData();
  replacement.set("variantId", post.variantId);
  replacement.set("socialAccountId", post.socialAccountId);
  replacement.set("scheduledAt", input.scheduledAt);
  await schedulePost(replacement);
}
