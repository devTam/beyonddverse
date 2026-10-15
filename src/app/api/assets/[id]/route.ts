import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createSignedDeliveryUrl, deleteMedia } from "@/lib/storage/cloudinary";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await requireUser(request.headers);
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: (await context.params).id } });
  return NextResponse.redirect(createSignedDeliveryUrl(asset));
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireUser(request.headers);
  const asset = await prisma.asset.findUniqueOrThrow({ where: { id: (await context.params).id }, include: { sourceFor: true, usages: true, narrations: true, videoRenders: true } });
  if (asset.sourceFor.length || asset.usages.length || asset.narrations.length || asset.videoRenders.length) return NextResponse.json({ error: "Asset is still referenced and cannot be deleted." }, { status: 409 });
  await deleteMedia(asset);
  await prisma.$transaction([
    prisma.asset.delete({ where: { id: asset.id } }),
    prisma.auditLog.create({ data: { actorId: session.user.id, action: "ASSET_DELETED", entityType: "Asset", entityId: asset.id, before: { kind: asset.kind, storageKey: asset.storageKey } } }),
  ]);
  return NextResponse.json({ deleted: true });
}
