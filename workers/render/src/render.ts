import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { Prisma } from "@prisma/client";
import type { VideoInput } from "../../../packages/video/src/types";
import { createSignedDeliveryUrl, uploadAndCreateAsset } from "../../../src/lib/storage/cloudinary";
import { prisma } from "../../../src/lib/prisma";
import { probeMedia } from "./ffmpeg";

let bundlePromise: Promise<string> | undefined;
function getBundle() {
  bundlePromise ??= bundle({ entryPoint: resolve(process.cwd(), "packages/video/src/index.ts"), webpackOverride: (config) => config });
  return bundlePromise;
}

type RenderInput = { scriptId: string };

async function buildProps(scriptId: string): Promise<VideoInput> {
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId }, include: { scenes: { orderBy: { position: "asc" }, include: { narrations: { orderBy: { createdAt: "desc" }, take: 1, include: { asset: true } }, assetUsages: { where: { role: "PRIMARY_VISUAL" }, take: 1, include: { asset: true } } } } } });
  if (script.status !== "APPROVED") throw new Error("Rendering requires an approved script.");
  const scenes = script.scenes.map((scene) => {
    const narration = scene.narrations[0];
    const visual = scene.assetUsages[0];
    if (!narration || !visual) throw new Error(`Scene ${scene.position} is missing narration or a visual.`);
    const durationMs = narration.asset.durationMs ?? scene.durationMs;
    return { id: scene.id, narration: scene.narration, narrationUrl: createSignedDeliveryUrl(narration.asset), visualUrl: createSignedDeliveryUrl(visual.asset), scriptureRef: scene.scriptureRef, durationInFrames: Math.max(30, Math.ceil(durationMs / 1_000 * 30)) };
  });
  return { title: script.title, hook: script.hook, brandName: "Beyond the Verse", fps: 30, scenes };
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
    await renderMedia({ composition, serveUrl, codec: "h264", outputLocation: output, inputProps, imageFormat: "jpeg", chromiumOptions: { disableWebSecurity: false }, concurrency: 1 });
    const inspected = await probeMedia(output);
    if (!inspected.streams.some((stream) => stream.codec_type === "video") || !inspected.streams.some((stream) => stream.codec_type === "audio")) throw new Error("Rendered output must contain video and audio streams.");
    const asset = await uploadAndCreateAsset({ body: await readFile(output), kind: "VIDEO", mimeType: "video/mp4", filename: `${render.composition}-${render.id}.mp4` });
    await prisma.videoRender.update({ where: { id: render.id }, data: { status: "SUCCEEDED", assetId: asset.id } });
    return { renderId: render.id, assetId: asset.id, durationSeconds: inspected.format.duration };
  } catch (error) {
    await prisma.videoRender.update({ where: { id: render.id }, data: { status: "FAILED", error: error instanceof Error ? error.message : "Unknown render failure" } });
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
