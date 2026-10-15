import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const body = await request.text(); const signature = request.headers.get("tiktok-signature") ?? ""; const values = Object.fromEntries(signature.split(",").map((part) => part.split("=", 2))) as Record<string, string>;
  const secret = process.env.TIKTOK_CLIENT_SECRET; const timestamp = Number(values.t); const supplied = values.s;
  if (!secret || !supplied || !Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) return new Response("Unauthorized", { status: 401 });
  const expected = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
  if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return new Response("Unauthorized", { status: 401 });
  await prisma.auditLog.create({ data: { action: "TIKTOK_WEBHOOK_RECEIVED", entityType: "Webhook", entityId: crypto.randomUUID(), after: { bytes: Buffer.byteLength(body) } } });
  return NextResponse.json({ received: true });
}
