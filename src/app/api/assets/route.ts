import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createSignedUploadParameters, verifyUploadResponse } from "@/lib/storage/cloudinary";

const Kind = z.enum(["IMAGE", "MUSIC", "VIDEO"]);
const Sign = z.object({ action: z.literal("sign"), kind: Kind, filename: z.string().min(1).max(180), mimeType: z.string().min(1), projectId: z.string().uuid().optional() });
const Register = z.object({ action: z.literal("register"), kind: Kind, filename: z.string().min(1), mimeType: z.string().min(1), projectId: z.string().uuid().optional(), parentId: z.string().uuid().optional(), license: z.string().trim().min(3).max(300).optional(), upload: z.object({ public_id: z.string(), version: z.number().int(), signature: z.string(), bytes: z.number().int().positive(), etag: z.string(), secure_url: z.string().url(), resource_type: z.enum(["image", "video"]), type: z.literal("authenticated"), format: z.string().optional(), width: z.number().optional(), height: z.number().optional(), duration: z.number().optional() }) });
export async function POST(request: Request) {
  const session = await requireUser(request.headers); const body: unknown = await request.json();
  if (typeof body === "object" && body && "action" in body && body.action === "sign") { const input = Sign.parse(body); if (input.kind === "IMAGE" && !input.mimeType.startsWith("image/")) return NextResponse.json({ error: "Image file required." }, { status: 400 }); if (input.kind === "VIDEO" && !input.mimeType.startsWith("video/")) return NextResponse.json({ error: "Video file required." }, { status: 400 }); if (input.kind === "MUSIC" && !input.mimeType.startsWith("audio/")) return NextResponse.json({ error: "Audio file required." }, { status: 400 }); return NextResponse.json(createSignedUploadParameters({ kind: input.kind, filename: input.filename, mimeType: input.mimeType, projectId: input.projectId })); }
  const input = Register.parse(body); if (!verifyUploadResponse({ publicId: input.upload.public_id, version: input.upload.version, signature: input.upload.signature })) return NextResponse.json({ error: "Invalid Cloudinary signature." }, { status: 400 });
  const asset = await prisma.asset.create({ data: { kind: input.kind, storageKey: input.upload.public_id, mimeType: input.mimeType, bytes: BigInt(input.upload.bytes), checksum: input.upload.etag, width: input.upload.width, height: input.upload.height, durationMs: input.upload.duration ? Math.round(input.upload.duration * 1000) : undefined, projectId: input.projectId, parentId: input.parentId, license: input.license, providerMetadata: { provider: "cloudinary", resourceType: input.upload.resource_type, deliveryType: input.upload.type, version: input.upload.version, format: input.upload.format, secureUrl: input.upload.secure_url, originalFilename: input.filename } } });
  await prisma.auditLog.create({ data: { actorId: session.user.id, action: input.parentId ? "ASSET_REPLACEMENT_UPLOADED" : "ASSET_UPLOADED", entityType: "Asset", entityId: asset.id, after: { kind: asset.kind, parentId: asset.parentId, license: asset.license } } });
  return NextResponse.json({ assetId: asset.id }, { status: 201 });
}
