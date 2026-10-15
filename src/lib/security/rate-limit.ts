import "server-only";
import { createHash } from "node:crypto";
import { prisma } from "@/lib/prisma";

export async function enforceRateLimit(request: Request, namespace: string, limit: number, windowSeconds: number) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const identity = forwarded || request.headers.get("x-real-ip") || "unknown";
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  const key = createHash("sha256").update(`${namespace}:${identity}:${bucket}`).digest("hex");
  const now = new Date();
  const expiresAt = new Date((bucket + 1) * windowSeconds * 1000);
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "rate_limit_entries" ("key", "count", "window_start", "expires_at")
    VALUES (${key}, 1, ${now}, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE SET "count" = "rate_limit_entries"."count" + 1
    RETURNING "count"
  `;
  if ((rows[0]?.count ?? 1) > limit) throw new RateLimitError(Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 1000)));
}

export class RateLimitError extends Error {
  constructor(readonly retryAfter: number) { super("Too many requests."); }
}
