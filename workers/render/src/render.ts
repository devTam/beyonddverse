import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { bundle } from "@remotion/bundler";
import { renderMedia, selectComposition } from "@remotion/renderer";
import type { Prisma } from "@prisma/client";
import { VideoInputSchema } from "../../../packages/video/src/types";
import { buildProductionProps } from "../../../src/lib/video/props";
import { contentHash } from "../../../src/lib/content/provider";
import { uploadAndCreateAsset } from "../../../src/lib/storage/cloudinary";
import { prisma } from "../../../src/lib/prisma";
import { normalizeAudio, probeMedia } from "./ffmpeg";
import { getProductionSettings } from "../../../src/lib/settings";

let bundlePromise: Promise<string> | undefined;
function getBundle() {
  bundlePromise ??= bundle({ entryPoint: resolve(process.cwd(), "packages/video/src/index.ts"), webpackOverride: (config) => config });
  return bundlePromise;
}

type RenderInput = { scriptId: string; mediaHash?: string; media?: unknown };

export async function executeRender(renderId: string) {
  const render = await prisma.videoRender.findUniqueOrThrow({ where: { id: renderId } });
  const input = render.input as Prisma.JsonObject & RenderInput;
  if (typeof input.scriptId !== "string") throw new Error("Render input is missing scriptId.");
  await prisma.videoRender.update({ where: { id: render.id }, data: { status: "RUNNING", error: null } });
  const directory = await mkdtemp(join(tmpdir(), "btv-render-"));
  try {
    const currentProps = await buildProductionProps(input.scriptId);
    if (!input.mediaHash || contentHash(JSON.stringify(currentProps)) !== input.mediaHash) throw new Error("Media or production settings changed after render dispatch. Start a new render.");
    const inputProps = VideoInputSchema.parse(input.media);
    const serveUrl = await getBundle();
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
    const finalProps = await buildProductionProps(input.scriptId);
    if (contentHash(JSON.stringify(finalProps)) !== input.mediaHash) throw new Error("Production changed during rendering. Review and render the current revision.");
    await prisma.videoRender.update({ where: { id: render.id }, data: { status: "SUCCEEDED", assetId: asset.id } });
    return { renderId: render.id, assetId: asset.id, durationSeconds: inspected.format.duration };
  } catch (error) {
    await prisma.videoRender.update({ where: { id: render.id }, data: { status: "FAILED", error: error instanceof Error ? error.message : "Unknown render failure" } });
    throw error;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
