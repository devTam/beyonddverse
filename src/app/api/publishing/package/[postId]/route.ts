import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createSignedDeliveryUrl } from "@/lib/storage/cloudinary";

export async function GET(request: Request, context: { params: Promise<{ postId: string }> }) {
  await requireUser(request.headers);
  const post = await prisma.scheduledPost.findUniqueOrThrow({ where: { id: (await context.params).postId }, include: { socialAccount: true, variant: { include: { videoRender: { include: { asset: true } }, contentPackage: { include: { project: true } } } } } });
  const asset = post.variant.videoRender?.asset;
  if (!asset) return NextResponse.json({ error: "Rendered media is unavailable." }, { status: 409 });
  const manifest = { platform: post.socialAccount.platform, scheduledAt: post.scheduledAt.toISOString(), project: post.variant.contentPackage.project.title, variant: post.variant.kind, metadata: post.variant.metadata, media: { downloadUrl: createSignedDeliveryUrl(asset), mimeType: asset.mimeType, bytes: Number(asset.bytes), checksum: asset.checksum } };
  return new NextResponse(JSON.stringify(manifest, null, 2), { headers: { "content-type": "application/json", "content-disposition": `attachment; filename="beyond-the-verse-${post.id}.json"`, "cache-control": "private, no-store" } });
}
