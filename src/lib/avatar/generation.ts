import "server-only";
import { prisma } from "../prisma";
import { createSignedDeliveryUrl, uploadAndCreateAsset } from "../storage/cloudinary";
import { assertWithinBudget } from "../costs";
import { HeyGenAvatarProvider, type AvatarProvider } from "./heygen";

/** A durable row owns one paid submission. Persist its provider ID before polling. */
export async function completeAvatarJob(jobId: string, options: { avatarId: string; aspectRatio: "16:9" | "9:16"; motionPrompt: string; pause: () => Promise<unknown>; provider?: AvatarProvider }) {
  const provider = options.provider ?? new HeyGenAvatarProvider();
  let job = await prisma.avatarGeneration.findUniqueOrThrow({ where: { id: jobId } });
  if (job.status === "SUCCEEDED" && job.assetId) return job;
  if (job.status === "FAILED" && job.externalJobId) throw new Error(job.error ?? "Presenter generation failed. Inspect the provider job before submitting a replacement.");
  if (!job.externalJobId) {
    // HeyGen mutation idempotency expires after 24 hours. Never blindly resubmit an uncertain old request.
    if (job.submissionStartedAt && Date.now() - job.submissionStartedAt.getTime() > 23 * 60 * 60 * 1000) throw new Error("Presenter submission needs reconciliation in HeyGen; its idempotency window has expired.");
    await assertWithinBudget(job.projectId, job.durationMs / 60000 * job.ratePerMinute);
    const audio = await prisma.asset.findUniqueOrThrow({ where: { id: job.audioAssetId } });
    job = await prisma.avatarGeneration.update({ where: { id: job.id }, data: { status: "RUNNING", error: null, submissionStartedAt: job.submissionStartedAt ?? new Date() } });
    const externalJobId = await provider.submit({ avatarId: options.avatarId, audioUrl: createSignedDeliveryUrl(audio), aspectRatio: options.aspectRatio, motionPrompt: options.motionPrompt, key: job.inputHash });
    job = await prisma.avatarGeneration.update({ where: { id: job.id }, data: { externalJobId } });
  }
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.avatarGeneration.updateMany({ where: { id: job.id, costRecorded: false }, data: { costRecorded: true } });
    if (claimed.count) await tx.generationCost.create({ data: { projectId: job.projectId, provider: "heygen", model: "avatar_iv", operation: "AVATAR", estimated: true, amountMicros: BigInt(Math.round(job.durationMs / 60000 * job.ratePerMinute * 1e6)), units: { durationMs: job.durationMs, externalJobId: job.externalJobId } } });
  });
  for (let attempt = 0; attempt < 100; attempt++) {
    const state = await provider.status(job.externalJobId!);
    if (state.status === "failed") {
      await prisma.avatarGeneration.update({ where: { id: job.id }, data: { status: "FAILED", error: state.error ?? "HeyGen generation failed." } });
      throw new Error(state.error ?? "HeyGen generation failed.");
    }
    if (state.status === "completed") {
      if (!state.videoUrl) throw new Error("HeyGen completed without a video URL.");
      if (state.duration && Math.abs(state.duration * 1000 - job.durationMs) > Math.max(750, job.durationMs * 0.02)) throw new Error("Presenter video duration does not match its narration.");
      const url = new URL(state.videoUrl);
      if (url.protocol !== "https:") throw new Error("HeyGen media delivery must use HTTPS.");
      const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
      if (!response.ok) throw new Error("Unable to retrieve completed presenter video; retry will reuse the existing job.");
      const asset = await uploadAndCreateAsset({ body: Buffer.from(await response.arrayBuffer()), kind: "VIDEO", mimeType: "video/mp4", filename: `presenter-${job.id}.mp4`, projectId: job.projectId });
      return prisma.avatarGeneration.update({ where: { id: job.id }, data: { status: "SUCCEEDED", assetId: asset.id, error: null } });
    }
    await options.pause();
  }
  await prisma.avatarGeneration.update({ where: { id: job.id }, data: { status: "WAITING" } });
  throw new Error("Presenter is still processing. Resume generation to check the same provider job.");
}
