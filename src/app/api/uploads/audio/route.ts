import { tasks } from "@trigger.dev/sdk";
import { NextResponse } from "next/server";
import { z } from "zod";
import type { transcribeExplanation } from "../../../../../trigger/transcription";
import { prisma } from "@/lib/prisma";
import { createSignedUploadParameters, verifyUploadResponse } from "@/lib/storage/cloudinary";
import { requireUser } from "@/lib/auth";

const SignInput = z.object({ action: z.literal("sign"), projectId: z.string().uuid(), filename: z.string().min(1).max(180), mimeType: z.string().startsWith("audio/") });
const RegisterInput = z.object({
  action: z.literal("register"), projectId: z.string().uuid(), filename: z.string().min(1), mimeType: z.string().startsWith("audio/"),
  upload: z.object({ public_id: z.string().min(1), version: z.number().int(), signature: z.string().min(1), bytes: z.number().int().positive(), etag: z.string().min(1), secure_url: z.string().url(), resource_type: z.literal("video"), type: z.literal("authenticated"), format: z.string().optional(), duration: z.number().optional() }),
});

export async function POST(request: Request) {
  await requireUser(request.headers);
  const body: unknown = await request.json();
  if (typeof body === "object" && body !== null && "action" in body && body.action === "sign") {
    const input = SignInput.parse(body);
    return NextResponse.json(createSignedUploadParameters({ projectId: input.projectId, filename: input.filename, mimeType: input.mimeType, kind: "SOURCE_AUDIO" }));
  }
  const input = RegisterInput.parse(body);
  if (!process.env.TRIGGER_SECRET_KEY) return NextResponse.json({ error: "Trigger.dev is not configured." }, { status: 503 });
  if (!verifyUploadResponse({ publicId: input.upload.public_id, version: input.upload.version, signature: input.upload.signature })) {
    return NextResponse.json({ error: "Cloudinary upload signature is invalid." }, { status: 400 });
  }
  await prisma.chapterProject.findUniqueOrThrow({ where: { id: input.projectId } });
  const asset = await prisma.asset.create({ data: {
    kind: "SOURCE_AUDIO", storageKey: input.upload.public_id, mimeType: input.mimeType, bytes: BigInt(input.upload.bytes), checksum: input.upload.etag,
    durationMs: input.upload.duration ? Math.round(input.upload.duration * 1000) : null,
    projectId: input.projectId,
    providerMetadata: { provider: "cloudinary", resourceType: input.upload.resource_type, deliveryType: input.upload.type, version: input.upload.version, format: input.upload.format, secureUrl: input.upload.secure_url, originalFilename: input.filename },
  } });
  const workflow = await prisma.workflowRun.create({ data: {
    projectId: input.projectId, type: "TRANSCRIPTION", status: "QUEUED", idempotencyKey: `transcription:${asset.id}`, input: { assetId: asset.id },
    steps: { create: { position: 1, name: "Transcribe source audio" } },
  } });
  try {
    const handle = await tasks.trigger<typeof transcribeExplanation>("transcribe-explanation-audio", { workflowRunId: workflow.id, projectId: input.projectId, assetId: asset.id }, { idempotencyKey: `transcription:${asset.id}`, idempotencyKeyTTL: "30d", tags: [`project:${input.projectId}`, `workflow:${workflow.id}`] });
    await prisma.workflowRun.update({ where: { id: workflow.id }, data: { output: { triggerRunId: handle.id } } });
    return NextResponse.json({ workflowId: workflow.id }, { status: 202 });
  } catch (error) {
    await prisma.workflowRun.update({ where: { id: workflow.id }, data: { status: "FAILED", completedAt: new Date(), error: error instanceof Error ? error.message : "Unable to dispatch transcription" } });
    throw error;
  }
}
