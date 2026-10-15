import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { oauthProvider, type SupportedProvider } from "@/lib/publishing";

const Provider = z.enum(["youtube", "meta", "tiktok"]);
const digest = (value: string) => createHash("sha256").update(value).digest("base64url");

export async function GET(request: Request, context: { params: Promise<{ provider: string }> }) {
  await requireUser(request.headers);
  const provider = Provider.parse((await context.params).provider) as SupportedProvider;
  const origin = new URL(request.url).origin;
  const redirectUri = `${origin}/api/oauth/${provider}/callback`;
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  await prisma.oAuthState.create({ data: { provider, stateHash: digest(state), codeVerifier: verifier, redirectUri, expiresAt: new Date(Date.now() + 10 * 60_000) } });
  return NextResponse.redirect(oauthProvider(provider).authorizationUrl(state, redirectUri, digest(verifier)));
}
