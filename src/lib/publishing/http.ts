import { z } from "zod";

export async function providerJson<T>(url: string | URL, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000) });
  const body = await response.text();
  if (!response.ok) throw new Error(`Provider request failed (${response.status}): ${body.slice(0, 500)}`);
  return schema.parse(body ? JSON.parse(body) : {});
}

export async function mediaBuffer(url: string, maxBytes = 500 * 1024 * 1024) {
  const response = await fetch(url, { signal: AbortSignal.timeout(5 * 60_000) });
  if (!response.ok) throw new Error(`Unable to retrieve rendered media (${response.status}).`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error("Rendered media exceeds the provider upload limit.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) throw new Error("Rendered media exceeds the provider upload limit.");
  return buffer;
}
