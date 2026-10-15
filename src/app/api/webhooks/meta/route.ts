import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  if (url.searchParams.get("hub.mode") === "subscribe" && url.searchParams.get("hub.verify_token") === process.env.META_WEBHOOK_VERIFY_TOKEN) return new Response(url.searchParams.get("hub.challenge") ?? "", { status: 200 });
  return new Response("Forbidden", { status: 403 });
}
export async function POST(request: Request) {
  const body = await request.text(); const secret = process.env.META_WEBHOOK_SECRET; const supplied = request.headers.get("x-hub-signature-256")?.replace(/^sha256=/, "");
  if (!secret || !supplied) return new Response("Unauthorized", { status: 401 });
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  const valid = supplied.length === expected.length && timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
  if (!valid) return new Response("Unauthorized", { status: 401 });
  await prisma.auditLog.create({ data: { action: "META_WEBHOOK_RECEIVED", entityType: "Webhook", entityId: crypto.randomUUID(), after: { bytes: Buffer.byteLength(body) } } });
  return NextResponse.json({ received: true });
}
