import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { createSignedDeliveryUrl } from "../storage/cloudinary";
import { getProductionSettings } from "../settings";
import { narrationSettings, narrationInputHash, assertCurrentScript } from "../avatar/production";
import { PresenterSnapshotSchema } from "../presenter-schema";
import { lessonTranscript } from "../content/lesson";
import { scriptureCueTime, type WordTiming } from "../../../packages/video/src/captions";
import type { VideoInput } from "../../../packages/video/src/types";

export async function buildProductionProps(scriptId: string): Promise<VideoInput> {
  await assertCurrentScript(scriptId);
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId }, include: { scenes: { orderBy: { position: "asc" }, include: { narrations: { orderBy: { createdAt: "desc" }, take: 1, include: { asset: true } }, assetUsages: { where: { role: "PRIMARY_VISUAL" }, include: { asset: true } } } } } });
  if (script.productionVersion !== 2) throw new Error("This is a legacy production. Regenerate content from your explanation for the presenter format. Existing videos remain available.");
  if (!script.scenes.length || lessonTranscript(script.scenes) !== script.body.trim()) throw new Error("Approved scene narration must match the complete lesson transcript.");
  const presenter = PresenterSnapshotSchema.parse(script.presenterSnapshot);
  const settings = await getProductionSettings();
  const scenes = await Promise.all(script.scenes.map(async (scene) => {
    const narration = scene.narrations[0];
    if (!narration?.asset.durationMs || narration.voiceId !== presenter.voiceId) throw new Error(`Scene ${scene.position} needs narration using its approved presenter voice.`);
    if (narration.sourceHash !== narrationInputHash(scene.narration, narrationSettings(script.presenterSnapshot, settings))) throw new Error(`Scene ${scene.position} narration is stale; regenerate it with the approved presenter settings.`);
    const durationMs = narration.asset.durationMs;
    const timings = narration.timings as WordTiming[] | null;
    if (!timings?.length) throw new Error(`Scene ${scene.position} needs aligned captions.`);
    const visual = scene.assetUsages[0]?.asset;
    let presenterVideoUrl: string | undefined;
    if (scene.presentation === "presenter") {
      const job = await prisma.avatarGeneration.findFirst({ where: { sceneId: scene.id, narrationId: narration.id, profileId: presenter.id, status: "SUCCEEDED" }, orderBy: { createdAt: "desc" } });
      const asset = job?.assetId ? await prisma.asset.findUnique({ where: { id: job.assetId } }) : null;
      if (!asset || asset.status !== "APPROVED") throw new Error(`Generate and approve the presenter video for scene ${scene.position}.`);
      if (!asset.durationMs || Math.abs(asset.durationMs - durationMs) > Math.max(750, durationMs * 0.02)) throw new Error("Presenter media does not match narration duration.");
      presenterVideoUrl = createSignedDeliveryUrl(asset);
    } else if (!visual || visual.status !== "APPROVED" || !["IMAGE", "VIDEO"].includes(visual.kind)) throw new Error(`Scene ${scene.position} needs an approved supporting image or video.`);
    const scriptureCards: NonNullable<VideoInput["scenes"][number]["scriptureCards"]> = [];
    if (scene.scriptureRef) {
      if (!scene.scriptureExcerpt || !scene.scriptureCue) throw new Error("Approve verified Scripture excerpts before rendering.");
      const timing = scriptureCueTime(scene.narration, scene.scriptureCue, timings);
      // Paginate long excerpts instead of shrinking text or obscuring the frame.
      const words = scene.scriptureExcerpt.split(/\s+/);
      const pages = Math.ceil(words.length / 24);
      const availableMs = durationMs - timing.startMs;
      if (availableMs < pages * 2000) throw new Error(`Scene ${scene.position} references too much Scripture to display readably. Use a shorter verse range or an earlier cue.`);
      const endMs = Math.min(durationMs, Math.max(timing.endMs, timing.startMs + pages * 5000));
      for (let i = 0; i < pages; i++) scriptureCards.push({ reference: scene.scriptureRef, text: words.slice(i * 24, (i + 1) * 24).join(" "), translation: script.scriptureTranslation, startMs: timing.startMs + (endMs - timing.startMs) * i / pages, endMs: timing.startMs + (endMs - timing.startMs) * (i + 1) / pages });
    }
    return { id: scene.id, narration: scene.narration, narrationUrl: createSignedDeliveryUrl(narration.asset), presentation: scene.presentation as "presenter" | "cutaway", presenterVideoUrl, visualUrl: visual ? createSignedDeliveryUrl(visual) : undefined, visualMediaType: visual?.mimeType.startsWith("video/") ? "video" as const : "image" as const, visualDurationInFrames: visual?.durationMs ? Math.ceil(visual.durationMs / 1000 * 30) : undefined, scriptureRef: scene.scriptureRef, scriptureCards, durationInFrames: Math.ceil(durationMs / 1000 * 30), timings };
  }));
  const musicSetting = await prisma.workspaceSetting.findUnique({ where: { key: "backgroundMusicAssetId" } });
  const music = typeof musicSetting?.value === "string" ? await prisma.asset.findUnique({ where: { id: musicSetting.value } }) : null;
  const brand = settings.brandAssetId ? await prisma.asset.findUnique({ where: { id: settings.brandAssetId } }) : null;
  if (brand && brand.status !== "APPROVED") throw new Error("Brand artwork needs approval.");
  if (music && (music.kind !== "MUSIC" || music.status !== "APPROVED")) throw new Error("Background music needs approval.");
  return { productionVersion: 2, scriptRevision: script.revision, presenterProfileId: presenter.id, title: script.title, hook: script.hook, brandName: settings.brandName, headingFont: settings.headingFont, bodyFont: settings.bodyFont, primaryColor: settings.primaryColor, accentColor: settings.accentColor, brandAssetUrl: brand ? createSignedDeliveryUrl(brand) : undefined, backgroundMusicUrl: music ? createSignedDeliveryUrl(music) : undefined, fps: 30, scenes };
}

// Persist a JSON snapshot of exactly the media approved at render dispatch.
export function productionJson(input: VideoInput): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(input));
}

export async function assertRenderCurrent(render: { input: Prisma.JsonValue }) {
  const input = render.input as { scriptId?: string; mediaHash?: string };
  if (!input.scriptId) throw new Error("Render has no script revision.");
  await assertCurrentScript(input.scriptId);
  if (input.mediaHash) {
    const { contentHash } = await import("../content/provider");
    if (contentHash(JSON.stringify(await buildProductionProps(input.scriptId))) !== input.mediaHash) throw new Error("This render uses superseded media. Render and review the current production before publishing.");
  }
}
