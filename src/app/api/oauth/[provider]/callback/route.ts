import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { oauthProvider, type SupportedProvider } from "@/lib/publishing";
import { encryptSecret } from "@/lib/security/encryption";
import type { Prisma } from "@prisma/client";

const Provider = z.enum(["youtube", "meta", "tiktok"]);
const digest = (value: string) => createHash("sha256").update(value).digest("base64url");

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  const session = await requireUser(request.headers);
  const provider = Provider.parse((await context.params).provider) as SupportedProvider;
  const url = new URL(request.url);
  const code = z.string().min(1).parse(url.searchParams.get("code"));
  const state = z.string().min(1).parse(url.searchParams.get("state"));
  const saved = await prisma.oAuthState.findUnique({ where: { stateHash: digest(state) } });
  if (!saved || saved.provider !== provider || saved.consumedAt || saved.expiresAt <= new Date()) return NextResponse.json({ error: "OAuth state is invalid or expired." }, { status: 400 });
  const adapter = oauthProvider(provider);
  const tokens = await adapter.exchange(code, saved.redirectUri, saved.codeVerifier ?? undefined);
  const identity = await adapter.identity(tokens.accessToken);
  const metadata = { ...(identity.metadata ?? {}) };
  const accountToken = typeof metadata.pageAccessToken === "string" ? metadata.pageAccessToken : tokens.accessToken;
  delete metadata.pageAccessToken;
  const platform = provider === "youtube" ? "YOUTUBE" : provider === "tiktok" ? "TIKTOK" : metadata.instagramBusinessId ? "INSTAGRAM" : "FACEBOOK";
  await prisma.$transaction([
    prisma.oAuthState.update({ where: { id: saved.id }, data: { consumedAt: new Date() } }),
    prisma.socialAccount.upsert({
      where: { platform_externalId: { platform, externalId: identity.externalId } },
      create: { platform, externalId: identity.externalId, displayName: identity.displayName, encryptedToken: encryptSecret(accountToken), encryptedRefreshToken: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : null, tokenExpiresAt: tokens.expiresAt, scopes: tokens.scopes, providerMetadata: metadata as Prisma.InputJsonValue },
      update: { displayName: identity.displayName, encryptedToken: encryptSecret(accountToken), encryptedRefreshToken: tokens.refreshToken ? encryptSecret(tokens.refreshToken) : undefined, tokenExpiresAt: tokens.expiresAt, scopes: tokens.scopes, providerMetadata: metadata as Prisma.InputJsonValue, disconnectedAt: null },
    }),
    prisma.auditLog.create({ data: { actorId: session.user.id, action: "SOCIAL_ACCOUNT_CONNECTED", entityType: "SocialAccount", entityId: identity.externalId, after: { platform, displayName: identity.displayName, scopes: tokens.scopes } } }),
  ]);
  return NextResponse.redirect(new URL("/settings?connected=1", request.url));
}
