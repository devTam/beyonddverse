"use server";

import { UserInputError } from "@/lib/action-error";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { buildProductionProps, productionJson, assertRenderCurrent } from "@/lib/video/props";
import { activePresenterSnapshot, availablePresenterSnapshot, assertCurrentScript } from "@/lib/avatar/production";
import { verifySceneScripture } from "@/lib/content/scripture";
import { NARRATION_VOICE_VERSION, assertFirstPersonNarration } from "@/lib/content/narration-voice";
import { lessonTranscript, scenesFromText, scenesFromTranscriptEdit } from "@/lib/content/lesson";
import { ACTIVE_PRESENTER_KEY, PresenterSnapshotSchema } from "@/lib/presenter-schema";
import type { presenterPipeline, presenterPortrait } from "../../trigger/presenter";
import { contentHash } from "@/lib/content/provider";
import { publisherFor } from "@/lib/publishing";
import { decryptSecret } from "@/lib/security/encryption";
import { assertWorkflowCapacity, getProductionSettings, ProductionSettingsSchema, PRODUCTION_SETTINGS_KEY } from "@/lib/settings";
import type { contentPipeline } from "../../trigger/content-pipeline";
import type { narrationPipeline } from "../../trigger/narration";
import type { regenerateSingleSceneNarration } from "../../trigger/narration";
import type { visualPipeline } from "../../trigger/visuals";
import type { regenerateSingleSceneVisual } from "../../trigger/visuals";
import type { renderLongFormVideo } from "../../trigger/rendering";
import type { renderShortFormVideo } from "../../trigger/rendering";
import type { publishScheduledPost } from "../../trigger/publishing";
import type { generateThumbnail } from "../../trigger/thumbnails";
import type { regenerateScriptSection } from "../../trigger/regeneration";

const ExplanationInput = z.object({
  projectId: z.string().uuid(),
  explanation: z.string().trim().min(80, "Add at least 80 characters so your explanation remains the teaching source."),
});

const ScriptRevisionInput = z.object({
  scriptId: z.string().uuid(),
  title: z.string().trim().min(3).max(180),
  hook: z.string().trim().min(10).max(1_000),

});

const SceneRevisionInput = z.object({
  id: z.string().uuid(),
  narration: z.string().trim().min(1),
  visualPrompt: z.string().trim().min(1),
  scriptureRef: z.string().trim().max(120).nullable(),
  scriptureCue: z.string().trim().nullable(),
  presentation: z.enum(["presenter", "cutaway"]),
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
  revalidatePath("/studio/genesis-1");
}

export async function updateSceneVisualApproval(sceneId: string, status: string) {
  const session = await requireUser(await headers());
  const input = z.object({ sceneId: z.string().uuid(), status: z.enum(["APPROVED", "REJECTED"]) }).parse({ sceneId, status });
  const usage = await prisma.assetUsage.findFirstOrThrow({ where: { sceneId: input.sceneId, role: "PRIMARY_VISUAL" }, include: { asset: true, scene: { include: { script: { include: { contentPackage: true } } } } } });
  await prisma.$transaction([
    prisma.asset.update({ where: { id: usage.assetId }, data: { status: input.status } }),
    prisma.auditLog.create({ data: { actorId: session.user.id, action: `ASSET_${input.status}`, entityType: "Asset", entityId: usage.assetId, before: { status: usage.asset.status }, after: { status: input.status, sceneId: input.sceneId } } }),
  ]);
  revalidatePath("/studio/genesis-1");
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

export async function updateProductionSettings(formData: FormData) {
  const session = await requireUser(await headers());
  const dictionaryText = z.string().max(20_000).parse(formData.get("pronunciationDictionary"));
  let pronunciationDictionary: unknown;
  try { pronunciationDictionary = JSON.parse(dictionaryText || "{}"); } catch { throw new Error("Pronunciation dictionary must be valid JSON."); }
  const optional = (name: string) => { const value = z.string().trim().parse(formData.get(name)); return value || null; };
  const settings = ProductionSettingsSchema.parse({
    avatarRatePerMinute: Number(formData.get("avatarRatePerMinute") ?? 2.31),
    brandName: formData.get("brandName"), brandAssetId: optional("brandAssetId"), headingFont: formData.get("headingFont"), bodyFont: formData.get("bodyFont"), primaryColor: formData.get("primaryColor"), accentColor: formData.get("accentColor"), narratorVoice: formData.get("narratorVoice"), speechSpeed: Number(formData.get("speechSpeed")), pronunciationDictionary,
    textModel: formData.get("textModel"), alignmentModel: formData.get("alignmentModel") ?? "openai/whisper-1", transcriptionModel: formData.get("transcriptionModel"), speechModel: formData.get("speechModel"), imageModel: formData.get("imageModel"), bibleTranslationCode: formData.get("bibleTranslationCode"), youtubePrivacy: formData.get("youtubePrivacy"), monthlyBudgetUsd: Number(formData.get("monthlyBudgetUsd")), generationLimit: Number(formData.get("generationLimit")), concurrencyLimit: Number(formData.get("concurrencyLimit")), videoQuality: formData.get("videoQuality"), errorNotificationEmail: optional("errorNotificationEmail"),
  });
  const existing = await prisma.workspaceSetting.findUnique({ where: { key: PRODUCTION_SETTINGS_KEY } });
  await prisma.$transaction([
    prisma.workspaceSetting.upsert({ where: { key: PRODUCTION_SETTINGS_KEY }, create: { key: PRODUCTION_SETTINGS_KEY, value: settings }, update: { value: settings } }),
    prisma.auditLog.create({ data: { actorId: session.user.id, action: "PRODUCTION_SETTINGS_UPDATED", entityType: "WorkspaceSetting", entityId: PRODUCTION_SETTINGS_KEY, before: existing?.value ?? undefined, after: settings } }),
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
  await assertWorkflowCapacity();
  const run = await prisma.workflowRun.create({ data: { projectId: script.contentPackage.projectId, type: "THUMBNAIL", idempotencyKey, input: { contentPackageId: script.contentPackageId }, steps: { create: { position: 1, name: "Generate thumbnail" } } } });
  const handle = await tasks.trigger<typeof generateThumbnail>("generate-content-thumbnail", { workflowRunId: run.id, projectId: script.contentPackage.projectId, contentPackageId: script.contentPackageId }, { idempotencyKey, idempotencyKeyTTL: "30d", tags: [`project:${script.contentPackage.projectId}`, `package:${script.contentPackageId}`] });
  await prisma.workflowRun.update({ where: { id: run.id }, data: { output: { triggerRunId: handle.id } } });
  redirect(`/studio/genesis-1?workflow=${run.id}`);
}

export async function regenerateSection(formData: FormData) {
  await requireUser(await headers());
  const input = z.object({ scriptId: z.string().uuid(), field: z.enum(["hook", "body"]) }).parse(Object.fromEntries(formData));
  const script = await prisma.script.findUniqueOrThrow({ where: { id: input.scriptId }, include: { contentPackage: true } });
  const idempotencyKey = `regenerate:${script.id}:${input.field}:${NARRATION_VOICE_VERSION}`;
  const existing = await prisma.workflowRun.findUnique({ where: { idempotencyKey } });
  if (existing) redirect(`/studio/genesis-1?workflow=${existing.id}`);
  await assertWorkflowCapacity();
  const run = await prisma.workflowRun.create({ data: { projectId: script.contentPackage.projectId, type: "SECTION_REGENERATION", idempotencyKey, input, steps: { create: { position: 1, name: `Regenerate ${input.field}` } } } });
  const handle = await tasks.trigger<typeof regenerateScriptSection>("regenerate-script-section", { workflowRunId: run.id, projectId: script.contentPackage.projectId, ...input }, { idempotencyKey, idempotencyKeyTTL: "30d", tags: [`project:${script.contentPackage.projectId}`, `script:${script.id}`] });
  await prisma.workflowRun.update({ where: { id: run.id }, data: { output: { triggerRunId: handle.id } } });
  redirect(`/studio/genesis-1?workflow=${run.id}`);
}

export async function generateContent(formData: FormData) {
  await requireUser(await headers());
  const projectId = z.string().uuid().parse(formData.get("projectId"));
  if (!process.env.TRIGGER_SECRET_KEY) return { error: "Content automation is not connected. Add TRIGGER_SECRET_KEY to Vercel Production, then redeploy." };
  const explanation = await prisma.explanation.findFirst({ where: { projectId }, orderBy: { revision: "desc" } });
  if (!explanation) throw new Error("Save an explanation before generating content.");

  const baseKey = `content:${projectId}:${explanation.id}:${NARRATION_VOICE_VERSION}`;
  const existing = await prisma.workflowRun.findFirst({ where: { idempotencyKey: { startsWith: baseKey } }, orderBy: { startedAt: "desc" } });
  if (existing && ["QUEUED", "RUNNING", "WAITING", "SUCCEEDED"].includes(existing.status)) {
    redirect(`/studio/genesis-1?workflow=${existing.id}`);
  }
  await assertWorkflowCapacity();
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
    const message = error instanceof Error ? error.message : "Unknown generation failure";
    await prisma.workflowRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), error: message } });
    return { error: `Unable to start content generation: ${message}` };
  }
  redirect(`/studio/genesis-1?workflow=${run.id}`);
}

export async function approveScript(formData: FormData) {
  try {
    const session = await requireUser(await headers());
    const scriptId = z.string().uuid().parse(formData.get("scriptId"));
    const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId }, include: { contentPackage: true, scenes: { orderBy: { position: "asc" } } } });
    const laterRevision = await prisma.script.findFirst({ where: { contentPackageId: script.contentPackageId, kind: script.kind, revision: { gt: script.revision } } });
    if (laterRevision) throw new UserInputError("Only the latest script revision can be approved.");
    const report = script.contentPackage.validationReport as { valid?: boolean } | null;
    if (!script.scenes.length) throw new UserInputError("The script needs narrated scenes before approval.");
    if (script.productionVersion === 2) assertFirstPersonNarration(lessonTranscript(script.scenes));
    const verifiedScenes = await verifySceneScripture(script.scenes, script.scriptureTranslation);
    if (script.productionVersion === 2 && lessonTranscript(script.scenes) !== script.body.trim()) throw new UserInputError("Transcript and scene narration differ. Save a new scene revision before approval.");
    const presenterSnapshot = script.productionVersion === 2
      ? (script.presenterSnapshot ? PresenterSnapshotSchema.parse(script.presenterSnapshot) : await availablePresenterSnapshot())
      : undefined;
    if (script.productionVersion === 1 && !report?.valid) throw new UserInputError("Resolve Scripture validation issues before approval.");
    await prisma.$transaction(async (tx) => {
      if (script.kind.startsWith("SHORT_") && !script.scenes.length) {
        const narration = `${script.hook} ${script.body}`;
        await tx.scriptScene.create({ data: { scriptId: script.id, position: 1, narration, visualType: "typography", visualPrompt: `Premium editorial Bible education visual for “${script.title}”. Warm gold light, dark neutral and deep green palette, generous negative space, no depiction of God, no embedded text.`, durationMs: Math.max(30_000, Math.min(60_000, Math.round(narration.split(/\s+/).length / 2.4 * 1_000))) } });
      }
      for (const [index, scene] of verifiedScenes.entries()) await tx.scriptScene.update({ where: { id: script.scenes[index].id }, data: { scriptureExcerpt: scene.scriptureExcerpt, scriptureCue: scene.scriptureCue } });
      await tx.script.update({ where: { id: scriptId }, data: { status: "APPROVED", ...(presenterSnapshot ? { presenterSnapshot } : {}) } });
      await tx.contentPackage.update({ where: { id: script.contentPackageId }, data: { status: "APPROVED" } });
      await tx.approvalEvent.create({ data: { scriptId, actorId: session.user.id, action: "APPROVED", note: "Teaching script approved; presenter setup is checked before narration production" } });
      await tx.chapterProject.update({ where: { id: script.contentPackage.projectId }, data: { status: "MEDIA_PRODUCTION", currentStage: 4 } });
    });
    revalidatePath("/");
    revalidatePath("/studio/genesis-1");
  } catch (error) {
    if (error instanceof UserInputError) return { error: error.message };
    throw error;
  }
}

export async function saveScriptRevision(formData: FormData) {
  const session = await requireUser(await headers());
  const input = ScriptRevisionInput.parse(Object.fromEntries(formData));
  const current = await prisma.script.findUniqueOrThrow({ where: { id: input.scriptId }, include: { scenes: { orderBy: { position: "asc" } } } });
  const latest = await prisma.script.findFirst({ where: { contentPackageId: current.contentPackageId, kind: current.kind }, orderBy: { revision: "desc" } });
  if (latest?.id !== current.id) throw new Error("This revision is no longer current. Reload before editing.");
  const sceneInput = current.scenes.map((scene) => SceneRevisionInput.parse({
    id: scene.id,
    narration: formData.get(`scene.${scene.id}.narration`) ?? scene.narration,
    visualPrompt: formData.get(`scene.${scene.id}.visualPrompt`) ?? scene.visualPrompt,
    scriptureRef: String(formData.get(`scene.${scene.id}.scriptureRef`) ?? scene.scriptureRef ?? "").trim() || null,
    scriptureCue: String(formData.get(`scene.${scene.id}.scriptureCue`) ?? scene.scriptureCue ?? "").trim() || null,
    presentation: formData.get(`scene.${scene.id}.presentation`) ?? scene.presentation,
    durationMs: Number(formData.get(`scene.${scene.id}.durationMs`) ?? scene.durationMs),
  }));
  const transcript = formData.has("transcript") ? z.string().trim().min(1).max(200_000).parse(formData.get("transcript")) : null;
  const scenes = transcript !== null
    ? (transcript === current.body.trim() ? sceneInput : scenesFromTranscriptEdit(transcript))
    : current.kind.startsWith("SHORT_") && formData.get("body")
    ? scenesFromText(`${input.hook} ${String(formData.get("body"))}`)
    : sceneInput;
  try {
    const verified = await verifySceneScripture<{ narration: string; scriptureRef: string | null; scriptureCue: string | null }>(scenes, current.scriptureTranslation);
    for (const [index, scene] of scenes.entries()) scene.scriptureCue = verified[index].scriptureCue;
  } catch (error) {
    if (error instanceof UserInputError) return { error: error.message };
    throw error;
  }
  const next = await prisma.$transaction(async (tx) => {
    const created = await tx.script.create({ data: {
      contentPackageId: current.contentPackageId,
      parentId: current.id,
      kind: current.kind,
      revision: current.revision + 1,
      title: input.title,
      hook: input.hook,
      body: lessonTranscript(scenes),
      productionVersion: 2, scriptureTranslation: current.scriptureTranslation,
      status: "PENDING",
      scenes: { create: scenes.map((scene, index) => ({
        position: index + 1,
        narration: scenes[index].narration,
        visualType: "illustration",
        visualPrompt: scenes[index].visualPrompt,
        scriptureRef: scenes[index].scriptureRef,
        scriptureCue: scenes[index].scriptureCue,
        presentation: scenes[index].presentation,
        durationMs: scenes[index].durationMs,
      })) },
    } });
    await tx.contentVariant.updateMany({ where: { contentPackageId: current.contentPackageId }, data: { status: "PENDING" } });
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
  await assertCurrentScript(script.id);
  if (!script.scenes.length) throw new Error("The script has no scenes to narrate.");
  if (script.productionVersion === 2 && !script.presenterSnapshot) {
    try {
      const snapshot = await activePresenterSnapshot();
      await prisma.script.update({ where: { id: script.id }, data: { presenterSnapshot: snapshot } });
      script.presenterSnapshot = snapshot;
    } catch (error) {
      if (error instanceof UserInputError) return { error: error.message };
      throw error;
    }
  }
  const settings = await getProductionSettings();
  const narrationConfigHash = contentHash(JSON.stringify({ presenter: script.presenterSnapshot, model: settings.speechModel, voice: settings.narratorVoice, speed: settings.speechSpeed, dictionary: settings.pronunciationDictionary })).slice(0, 16);
  const baseKey = `narration:${script.id}:${narrationConfigHash}`;
  const existing = await prisma.workflowRun.findFirst({ where: { idempotencyKey: { startsWith: baseKey } }, orderBy: { startedAt: "desc" } });
  if (existing && ["QUEUED", "RUNNING", "WAITING", "SUCCEEDED"].includes(existing.status)) redirect(`/studio/genesis-1?workflow=${existing.id}&script=${script.id}`);
  await assertWorkflowCapacity();
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
  redirect(`/studio/genesis-1?workflow=${run.id}&script=${script.id}`);
}

export async function generateVisuals(formData: FormData) {
  await requireUser(await headers());
  if (!process.env.TRIGGER_SECRET_KEY) throw new Error("TRIGGER_SECRET_KEY is required to start visual generation.");
  const scriptId = z.string().uuid().parse(formData.get("scriptId"));
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId }, include: { scenes: { orderBy: { position: "asc" }, include: { narrations: true } }, contentPackage: true } });
  if (script.status !== "APPROVED") throw new Error("Approve the script before generating visuals.");
  if (script.scenes.some((scene) => !scene.narrations.length)) throw new Error("Generate narration for every scene before visuals.");
  const settings = await getProductionSettings();
  const visualConfigHash = contentHash(JSON.stringify({ model: settings.imageModel, brand: settings.brandName, colors: [settings.primaryColor, settings.accentColor] })).slice(0, 16);
  const baseKey = `visuals:${script.id}:${visualConfigHash}`;
  const existing = await prisma.workflowRun.findFirst({ where: { idempotencyKey: { startsWith: baseKey } }, orderBy: { startedAt: "desc" } });
  if (existing && ["QUEUED", "RUNNING", "WAITING", "SUCCEEDED"].includes(existing.status)) redirect(`/studio/genesis-1?workflow=${existing.id}&script=${script.id}`);
  await assertWorkflowCapacity();
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
  redirect(`/studio/genesis-1?workflow=${run.id}&script=${script.id}`);
}

export async function regenerateSceneNarration(sceneId: string) {
  await requireUser(await headers());
  sceneId = z.string().uuid().parse(sceneId);
  const scene = await prisma.scriptScene.findUniqueOrThrow({ where: { id: sceneId }, include: { script: { include: { contentPackage: true } } } });
  if (scene.script.status !== "APPROVED") throw new Error("Approve the script before regenerating narration.");
  await assertWorkflowCapacity();
  const regenerationId = crypto.randomUUID();
  const idempotencyKey = `narration-regeneration:${scene.id}:${regenerationId}`;
  const run = await prisma.workflowRun.create({ data: { projectId: scene.script.contentPackage.projectId, type: "SCENE_NARRATION_REGENERATION", idempotencyKey, input: { sceneId, regenerationId }, steps: { create: { position: 1, name: `Regenerate narration for scene ${scene.position}` } } } });
  const handle = await tasks.trigger<typeof regenerateSingleSceneNarration>("regenerate-single-scene-narration", { workflowRunId: run.id, projectId: scene.script.contentPackage.projectId, sceneId, position: 1, regenerationId }, { idempotencyKey, idempotencyKeyTTL: "30d", tags: [`project:${scene.script.contentPackage.projectId}`, `scene:${scene.id}`] });
  await prisma.workflowRun.update({ where: { id: run.id }, data: { output: { triggerRunId: handle.id } } });
  redirect(`/studio/genesis-1?workflow=${run.id}&script=${scene.scriptId}`);
}

export async function regenerateSceneVisual(sceneId: string) {
  await requireUser(await headers());
  sceneId = z.string().uuid().parse(sceneId);
  const scene = await prisma.scriptScene.findUniqueOrThrow({ where: { id: sceneId }, include: { narrations: true, script: { include: { contentPackage: true } } } });
  if (scene.script.status !== "APPROVED") throw new Error("Approve the script before regenerating a visual.");
  if (!scene.narrations.length) throw new Error("Generate narration before regenerating a visual.");
  await assertWorkflowCapacity();
  const regenerationId = crypto.randomUUID();
  const idempotencyKey = `visual-regeneration:${scene.id}:${regenerationId}`;
  const run = await prisma.workflowRun.create({ data: { projectId: scene.script.contentPackage.projectId, type: "SCENE_VISUAL_REGENERATION", idempotencyKey, input: { sceneId, regenerationId }, steps: { create: { position: 1, name: `Regenerate visual for scene ${scene.position}` } } } });
  const handle = await tasks.trigger<typeof regenerateSingleSceneVisual>("regenerate-single-scene-visual", { workflowRunId: run.id, projectId: scene.script.contentPackage.projectId, sceneId, position: 1, regenerationId }, { idempotencyKey, idempotencyKeyTTL: "30d", tags: [`project:${scene.script.contentPackage.projectId}`, `scene:${scene.id}`] });
  await prisma.workflowRun.update({ where: { id: run.id }, data: { output: { triggerRunId: handle.id } } });
  redirect(`/studio/genesis-1?workflow=${run.id}&script=${scene.scriptId}`);
}

export async function renderLongVideo(formData: FormData) {
  await requireUser(await headers());
  if (!process.env.TRIGGER_SECRET_KEY) throw new Error("TRIGGER_SECRET_KEY is required to start rendering.");
  const scriptId = z.string().uuid().parse(formData.get("scriptId"));
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId }, include: { scenes: { include: { narrations: true, assetUsages: { where: { role: "PRIMARY_VISUAL" }, include: { asset: true } } } }, contentPackage: true } });
  await assertCurrentScript(script.id);
  if (script.kind !== "LONG_FORM") throw new Error("Choose a long-form script for this render.");
  if (script.scenes.some((scene) => !scene.narrations.length || (scene.presentation !== "presenter" && (!scene.assetUsages.length || scene.assetUsages.some((usage) => usage.asset.status !== "APPROVED"))))) throw new Error("Every scene needs narration and an approved visual before rendering.");
  const media = await buildProductionProps(script.id);
  const mediaHash = contentHash(JSON.stringify(media));
  const baseKey = `render:long:${script.id}:${mediaHash}`;
  const existing = await prisma.workflowRun.findFirst({ where: { idempotencyKey: { startsWith: baseKey } }, orderBy: { startedAt: "desc" } });
  const idempotencyKey = existing ? `${baseKey}:retry:${Date.now()}` : baseKey;
  if (existing && ["QUEUED", "RUNNING", "WAITING", "SUCCEEDED"].includes(existing.status)) redirect(`/studio/genesis-1?workflow=${existing.id}&script=${script.id}`);
  await assertWorkflowCapacity();
  const render = await prisma.videoRender.create({ data: { format: "16:9", composition: "YouTubeLong", status: "QUEUED", input: { scriptId: script.id, mediaHash, media: productionJson(media) } } });
  const longCopy = (script.contentPackage.socialCopy as Record<string, unknown>).youtube ?? null;
  await prisma.contentVariant.upsert({ where: { contentPackageId_platform_kind: { contentPackageId: script.contentPackageId, platform: "YOUTUBE", kind: "LONG_FORM_MASTER" } }, create: { contentPackageId: script.contentPackageId, videoRenderId: render.id, platform: "YOUTUBE", kind: "LONG_FORM_MASTER", metadata: { aspectRatio: "16:9", scriptId: script.id, title: script.title, copy: longCopy } }, update: { status: "PENDING", videoRenderId: render.id, metadata: { aspectRatio: "16:9", scriptId: script.id, title: script.title, copy: longCopy } } });
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
  redirect(`/studio/genesis-1?workflow=${run.id}&script=${script.id}`);
}

export async function renderShortVideo(formData: FormData) {
  await requireUser(await headers());
  if (!process.env.TRIGGER_SECRET_KEY) throw new Error("TRIGGER_SECRET_KEY is required to start rendering.");
  const scriptId = z.string().uuid().parse(formData.get("scriptId"));
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId }, include: { scenes: { include: { narrations: true, assetUsages: { where: { role: "PRIMARY_VISUAL" }, include: { asset: true } } } }, contentPackage: true } });
  if (!script.kind.startsWith("SHORT_")) throw new Error("This render action only accepts short scripts.");
  await assertCurrentScript(script.id);
  if (!script.scenes.length || script.scenes.some((scene) => !scene.narrations.length || (scene.presentation !== "presenter" && (!scene.assetUsages.length || scene.assetUsages.some((usage) => usage.asset.status !== "APPROVED"))))) throw new Error("Every short scene needs narration and an approved visual before rendering.");
  const media = await buildProductionProps(script.id);
  const mediaHash = contentHash(JSON.stringify(media));
  const baseKey = `render:short:${script.id}:${mediaHash}`;
  const existing = await prisma.workflowRun.findFirst({ where: { idempotencyKey: { startsWith: baseKey } }, orderBy: { startedAt: "desc" } });
  const idempotencyKey = existing ? `${baseKey}:retry:${Date.now()}` : baseKey;
  if (existing && ["QUEUED", "RUNNING", "WAITING", "SUCCEEDED"].includes(existing.status)) redirect(`/studio/genesis-1?workflow=${existing.id}&script=${script.id}`);
  await assertWorkflowCapacity();
  const render = await prisma.videoRender.create({ data: { format: "9:16", composition: "YouTubeShort", status: "QUEUED", input: { scriptId: script.id, mediaHash, media: productionJson(media) } } });
  await prisma.contentVariant.upsert({ where: { contentPackageId_platform_kind: { contentPackageId: script.contentPackageId, platform: "MASTER", kind: script.kind } }, create: { contentPackageId: script.contentPackageId, videoRenderId: render.id, platform: "MASTER", kind: script.kind, metadata: { aspectRatio: "9:16", scriptId: script.id } }, update: { status: "PENDING", videoRenderId: render.id, metadata: { aspectRatio: "9:16", scriptId: script.id } } });
  const socialCopy = script.contentPackage.socialCopy as Record<string, unknown>;
  const copyKey: Record<string, string> = { YOUTUBE_SHORTS: "youtubeShorts", TIKTOK: "tiktok", INSTAGRAM_REELS: "instagram", FACEBOOK_REELS: "facebook", X: "x" };
  await Promise.all(["YOUTUBE_SHORTS", "TIKTOK", "INSTAGRAM_REELS", "FACEBOOK_REELS", "X"].map((platform) => prisma.contentVariant.upsert({
    where: { contentPackageId_platform_kind: { contentPackageId: script.contentPackageId, platform, kind: script.kind } },
    create: { contentPackageId: script.contentPackageId, videoRenderId: render.id, platform, kind: script.kind, metadata: { aspectRatio: "9:16", scriptId: script.id, copy: socialCopy[copyKey[platform]] ?? null } },
    update: { status: "PENDING", videoRenderId: render.id, metadata: { aspectRatio: "9:16", scriptId: script.id, copy: socialCopy[copyKey[platform]] ?? null } },
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
  redirect(`/studio/genesis-1?workflow=${run.id}&script=${script.id}`);
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
  const variant = await prisma.contentVariant.findUniqueOrThrow({ where: { id: variantId }, include: { videoRender: true, contentPackage: true } });
  if (variant.videoRender?.status !== "SUCCEEDED" || !variant.videoRender.assetId) throw new Error("Only a completed render can receive final approval.");
  await assertRenderCurrent(variant.videoRender);
  if (variant.platform === "YOUTUBE" && variant.kind === "LONG_FORM_MASTER") {
    const thumbnail = await prisma.asset.findFirst({ where: { projectId: variant.contentPackage.projectId, kind: "THUMBNAIL", status: "APPROVED" } });
    if (!thumbnail) throw new Error("Approve a YouTube thumbnail before approving the long-form master.");
  }
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
  await assertRenderCurrent(variant.videoRender);
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

export async function savePresenterProfile(formData: FormData) {
  await requireUser(await headers());
  const input = z.object({ name: z.string().trim().min(2).max(80), portraitAssetId: z.string().uuid(), voiceId: z.string().trim().min(1), appearance: z.string().trim().min(10).max(1000), providerAvatarId: z.string().trim().min(1).max(200).nullable() }).parse({ ...Object.fromEntries(formData), providerAvatarId: String(formData.get("providerAvatarId") ?? "").trim() || null });
  const portrait = await prisma.asset.findUniqueOrThrow({ where: { id: input.portraitAssetId } });
  if (portrait.kind !== "IMAGE" || portrait.status !== "APPROVED") throw new Error("Choose an approved portrait image.");
  const settings = await getProductionSettings();
  const latest = await prisma.presenterProfile.findFirst({ orderBy: { revision: "desc" } });
  await prisma.presenterProfile.create({ data: { ...input, revision: (latest?.revision ?? 0) + 1, speechModel: settings.speechModel, speechSpeed: settings.speechSpeed, pronunciationDictionary: settings.pronunciationDictionary } });
  revalidatePath("/settings");
}

export async function approvePresenterProfile(formData: FormData) {
  const session = await requireUser(await headers());
  const profileId = z.string().uuid().parse(formData.get("profileId"));
  const profile = await prisma.presenterProfile.findUniqueOrThrow({ where: { id: profileId } });
  PresenterSnapshotSchema.parse(profile);
  const job = await prisma.avatarGeneration.findUniqueOrThrow({ where: { inputHash: contentHash(`preview:${profile.id}`) } });
  if (job.status !== "SUCCEEDED" || !job.assetId) throw new Error("Generate and review this profile's preview before approval.");
  await prisma.$transaction([
    prisma.presenterProfile.update({ where: { id: profileId }, data: { status: "APPROVED", approvedAt: new Date() } }),
    prisma.asset.update({ where: { id: job.assetId }, data: { status: "APPROVED" } }),
    prisma.workspaceSetting.upsert({ where: { key: ACTIVE_PRESENTER_KEY }, create: { key: ACTIVE_PRESENTER_KEY, value: profileId }, update: { value: profileId } }),
    prisma.auditLog.create({ data: { actorId: session.user.id, action: "PRESENTER_APPROVED", entityType: "PresenterProfile", entityId: profileId, after: { previewAssetId: job.assetId, revision: profile.revision } } }),
  ]);
  revalidatePath("/settings"); revalidatePath("/studio/genesis-1");
}

export async function generatePresenter(formData: FormData) {
  await requireUser(await headers());
  if (!process.env.HEYGEN_API_KEY || !process.env.TRIGGER_SECRET_KEY) throw new Error("Configure HEYGEN_API_KEY and TRIGGER_SECRET_KEY before generating a presenter.");
  const profileId = formData.get("profileId") ? z.string().uuid().parse(formData.get("profileId")) : undefined;
  const scriptId = formData.get("scriptId") ? z.string().uuid().parse(formData.get("scriptId")) : undefined;
  const script = scriptId ? await assertCurrentScript(scriptId) : null;
  const projectId = script?.contentPackage.projectId ?? z.string().uuid().parse(formData.get("projectId"));
  if (!script && !profileId) throw new Error("Select a profile or script.");
  await assertWorkflowCapacity();
  const baseKey = `presenter:${scriptId ?? profileId}`;
  const active = await prisma.workflowRun.findFirst({ where: { idempotencyKey: { startsWith: baseKey }, status: { in: ["QUEUED", "RUNNING", "WAITING"] } } });
  if (active) redirect(`/studio/genesis-1?workflow=${active.id}&project=${projectId}`);
  const idempotencyKey = `${baseKey}:${crypto.randomUUID()}`;
  const run = await prisma.workflowRun.create({ data: { projectId, type: "PRESENTER", idempotencyKey, input: { ...(scriptId ? { scriptId } : { profileId: profileId! }) } } });
  try {
    const handle = await tasks.trigger<typeof presenterPipeline>("generate-presenter", { workflowRunId: run.id, projectId, scriptId, profileId }, { idempotencyKey, tags: [`project:${projectId}`] });
    await prisma.workflowRun.update({ where: { id: run.id }, data: { output: { triggerRunId: handle.id } } });
  } catch (error) {
    await prisma.workflowRun.update({ where: { id: run.id }, data: { status: "FAILED", error: error instanceof Error ? error.message : "Unable to start presenter generation" } }); throw error;
  }
  redirect(`/studio/genesis-1?workflow=${run.id}&project=${projectId}${scriptId ? `&script=${scriptId}` : ""}`);
}

export async function generatePresenterPortrait(formData: FormData) {
  await requireUser(await headers());
  const input = z.object({ projectId: z.string().uuid(), prompt: z.string().trim().min(20).max(2000) }).parse(Object.fromEntries(formData));
  await assertWorkflowCapacity();
  const idempotencyKey = `portrait:${crypto.randomUUID()}`;
  const run = await prisma.workflowRun.create({ data: { projectId: input.projectId, type: "PRESENTER_PORTRAIT", idempotencyKey, input } });
  try {
    const handle = await tasks.trigger<typeof presenterPortrait>("generate-presenter-portrait", { workflowRunId: run.id, ...input }, { idempotencyKey });
    await prisma.workflowRun.update({ where: { id: run.id }, data: { output: { triggerRunId: handle.id } } });
  } catch (error) {
    await prisma.workflowRun.update({ where: { id: run.id }, data: { status: "FAILED", error: error instanceof Error ? error.message : "Unable to start portrait generation" } }); throw error;
  }
  redirect(`/studio/genesis-1?workflow=${run.id}&project=${input.projectId}`);
}

export async function selectSceneVisual(sceneId: string, formData: FormData) {
  await requireUser(await headers());
  const assetId = z.string().uuid().parse(formData.get(`scene.${sceneId}.assetId`));
  const scene = await prisma.scriptScene.findUniqueOrThrow({ where: { id: sceneId } });
  await assertCurrentScript(scene.scriptId);
  if (scene.presentation === "presenter") throw new Error("Choose a cutaway scene to attach supporting media.");
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: assetId } });
  if (!["IMAGE", "VIDEO"].includes(asset.kind) || asset.status !== "APPROVED") throw new Error("Choose approved image or video media.");
  await prisma.$transaction([
    prisma.assetUsage.deleteMany({ where: { sceneId, role: "PRIMARY_VISUAL" } }),
    prisma.assetUsage.create({ data: { sceneId, assetId, role: "PRIMARY_VISUAL" } }),
    prisma.contentVariant.updateMany({ where: { contentPackage: { scripts: { some: { id: scene.scriptId } } } }, data: { status: "PENDING" } }),
  ]);
  revalidatePath("/studio/genesis-1");
}

export async function reviewPresenterVideo(assetId: string) {
  const session = await requireUser(await headers());
  assetId = z.string().uuid().parse(assetId);
  const job = await prisma.avatarGeneration.findFirstOrThrow({ where: { assetId, status: "SUCCEEDED", sceneId: { not: null } } });
  const scene = await prisma.scriptScene.findUniqueOrThrow({ where: { id: job.sceneId! } });
  await assertCurrentScript(scene.scriptId);
  await prisma.$transaction([
    prisma.asset.update({ where: { id: assetId }, data: { status: "APPROVED" } }),
    prisma.auditLog.create({ data: { actorId: session.user.id, action: "PRESENTER_CLIP_APPROVED", entityType: "Asset", entityId: assetId, after: { sceneId: scene.id, narrationId: job.narrationId } } }),
  ]);
  revalidatePath("/studio/genesis-1");
}

export async function regenerateScenePresenter(sceneId: string) {
  await requireUser(await headers());
  const scene = await prisma.scriptScene.findUniqueOrThrow({ where: { id: z.string().uuid().parse(sceneId) } });
  const script = await assertCurrentScript(scene.scriptId);
  if (scene.presentation !== "presenter") throw new Error("Choose a presenter scene.");
  const latestJob = await prisma.avatarGeneration.findFirst({ where: { sceneId }, orderBy: { createdAt: "desc" } });
  if (latestJob && !["SUCCEEDED", "FAILED"].includes(latestJob.status)) throw new Error("Resume the existing presenter job before requesting a replacement.");
  await assertWorkflowCapacity();
  const replacementId = crypto.randomUUID();
  const idempotencyKey = `presenter-replacement:${sceneId}:${replacementId}`;
  const projectId = script.contentPackage.projectId;
  const run = await prisma.workflowRun.create({ data: { projectId, type: "PRESENTER_REPLACEMENT", idempotencyKey, input: { scriptId: script.id, sceneId, replacementId } } });
  try {
    const handle = await tasks.trigger<typeof presenterPipeline>("generate-presenter", { workflowRunId: run.id, projectId, scriptId: script.id, replacementSceneId: sceneId, replacementId }, { idempotencyKey });
    await prisma.workflowRun.update({ where: { id: run.id }, data: { output: { triggerRunId: handle.id } } });
  } catch (error) {
    await prisma.workflowRun.update({ where: { id: run.id }, data: { status: "FAILED", error: error instanceof Error ? error.message : "Unable to dispatch replacement" } }); throw error;
  }
  revalidatePath("/studio/genesis-1");
  redirect(`/studio/genesis-1?workflow=${run.id}&script=${script.id}`);
}
