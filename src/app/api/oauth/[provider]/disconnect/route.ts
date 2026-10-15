import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publisherFor } from "@/lib/publishing";
import { decryptSecret } from "@/lib/security/encryption";

export async function POST(request: Request) {
  const session = await requireUser(request.headers);
  const { accountId } = z.object({ accountId: z.string().uuid() }).parse(await request.json());
  const account = await prisma.socialAccount.findUniqueOrThrow({ where: { id: accountId } });
  if (account.encryptedToken) await publisherFor(account).revoke(decryptSecret(account.encryptedToken));
  await prisma.$transaction([
    prisma.socialAccount.update({ where: { id: account.id }, data: { encryptedToken: null, encryptedRefreshToken: null, tokenExpiresAt: null, disconnectedAt: new Date() } }),
    prisma.auditLog.create({ data: { actorId: session.user.id, action: "SOCIAL_ACCOUNT_DISCONNECTED", entityType: "SocialAccount", entityId: account.id, before: { platform: account.platform, connected: true }, after: { connected: false } } }),
  ]);
  return NextResponse.json({ disconnected: true });
}
