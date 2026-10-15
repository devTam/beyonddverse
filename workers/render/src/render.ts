import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { Prisma } from "@prisma/client";
import type { VideoInput } from "../../../packages/video/src/types";
import { createSignedDeliveryUrl, uploadAndCreateAsset } from "../../../src/lib/storage/cloudinary";
import { prisma } from "../../../src/lib/prisma";
import { normalizeAudio, probeMedia } from "./ffmpeg";
import { getProductionSettings } from "../../../src/lib/settings";

let bundlePromise: Promise<string> | undefined;
function getBundle() {
  bundlePromise ??= bundle({ entryPoint: resolve(process.cwd(), "packages/video/src/index.ts"), webpackOverride: (config) => config });
  return bundlePromise;
}

type RenderInput = { scriptId: string };

async function buildProps(scriptId: string): Promise<VideoInput> {
  const [script, musicSetting, settings] = await Promise.all([
    prisma.script.findUniqueOrThrow({ where: { id: scriptId }, include: { scenes: { orderBy: { position: "asc" }, include: { narrations: { orderBy: { createdAt: "desc" }, take: 1, include: { asset: true } }, assetUsages: { where: { role: "PRIMARY_VISUAL" }, take: 1, include: { asset: true } } } } } }),
    prisma.workspaceSetting.findUnique({ where: { key: "backgroundMusicAssetId" } }),
    getProductionSettings(),
  ]);
  if (script.status !== "APPROVED") throw new Error("Rendering requires an approved script.");
  const scenes = script.scenes.map((scene) => {
    const narration = scene.narrations[0];
    const visual = scene.assetUsages[0];
    if (!narration || !visual) throw new Error(`Scene ${scene.position} is missing narration or a visual.`);
    const durationMs = narration.asset.durationMs ?? scene.durationMs;
    const timings = Array.isArray(narration.timings) ? narration.timings as Array<{ word: string; startMs: number; endMs: number }> : undefined;
    return { id: scene.id, narration: scene.narration, narrationUrl: createSignedDeliveryUrl(narration.asset), visualUrl: createSignedDeliveryUrl(visual.asset), scriptureRef: scene.scriptureRef, durationInFrames: Math.max(30, Math.ceil(durationMs / 1_000 * 30)), timings };
  });
  const musicAssetId = typeof musicSetting?.value === "string" ? musicSetting.value : undefined;
  const musicAsset = musicAssetId ? await prisma.asset.findUnique({ where: { id: musicAssetId } }) : null;
  const brandAsset = settings.brandAssetId ? await prisma.asset.findUnique({ where: { id: settings.brandAssetId } }) : null;
  if (musicAsset && (musicAsset.kind !== "MUSIC" || musicAsset.status !== "APPROVED")) throw new Error("Configured background music must be an approved MUSIC asset.");
  return { title: script.title, hook: script.hook, brandName: settings.brandName, brandAssetUrl: brandAsset ? createSignedDeliveryUrl(brandAsset) : undefined, headingFont: settings.headingFont, bodyFont: settings.bodyFont, primaryColor: settings.primaryColor, accentColor: settings.accentColor, backgroundMusicUrl: musicAsset ? createSignedDeliveryUrl(musicAsset) : undefined, fps: 30, scenes };
}

export async function executeRender(renderId: string) {
  const render = await prisma.videoRender.findUniqueOrThrow({ where: { id: renderId } });
  const input = render.input as Prisma.JsonObject & RenderInput;
  if (typeof input.scriptId !== "string") throw new Error("Render input is missing scriptId.");
  await prisma.videoRender.update({ where: { id: render.id }, data: { status: "RUNNING", error: null } });
  const directory = await mkdtemp(join(tmpdir(), "btv-render-"));
  try {
    const [serveUrl, inputProps] = await Promise.all([getBundle(), buildProps(input.scriptId)]);
    const composition = await selectComposition({ serveUrl, id: render.composition, inputProps });
    const output = join(directory, `${render.id}.mp4`);
    const normalizedOutput = join(directory, `${render.id}-normalized.mp4`);
    const settings = await getProductionSettings();
    const quality = settings.videoQuality === "production" ? { crf: 14, jpegQuality: 100 } : settings.videoQuality === "high" ? { crf: 18, jpegQuality: 95 } : { crf: 23, jpegQuality: 85 };
    await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: output, inputProps, imageFormat: "jpeg", ...quality, chromiumOptions: { disableWebSecurity: false }, concurrency: Math.min(settings.concurrencyLimit, 4) });
    await normalizeAudio(output, normalizedOutput);
    const inspected = await probeMedia(normalizedOutput);
    if (!inspected.streams.some((stream) => stream.codec_type === "video") || !inspected.streams.some((stream) => stream.codec_type === "audio")) throw new Error("Rendered output must contain video and audio streams.");
    const video = inspected.streams.find((stream) => stream.codec_type === "video");
    const expected = render.format === "16:9" ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 };
    if (video?.width !== expected.width || video.height !== expected.height) throw new Error(`Rendered dimensions must be ${expected.width}x${expected.height}.`);
    const expectedDuration = composition.durationInFrames / composition.fps;
    if (Math.abs(inspected.format.duration - expectedDuration) > Math.max(1, expectedDuration * 0.02)) throw new Error("Rendered duration differs from the timing-derived composition duration.");
    const asset = await uploadAndCreateAsset({ body: await readFile(normalizedOutput), kind: "VIDEO", mimeType: "video/mp4", filename: `${render.composition}-${render.id}.mp4` });
    await prisma.videoRender.update({ where: { id: render.id }, data: { status: "SUCCEEDED", assetId: asset.id } });
    return { renderId: render.id, assetId: asset.id, durationSeconds: inspected.format.duration };
  } catch (error) {
    await prisma.videoRender.update({ where: { id: render.id }, data: { status: "FAILED", error: error instanceof Error ? error.message : "Unknown render failure" } });
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
