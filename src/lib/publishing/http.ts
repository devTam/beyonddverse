import { z } from "zod";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export async function providerJson<T>(url: string | URL, init: RequestInit, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(60_000) });
  const body = await response.text();
  if (!response.ok) throw new Error(`Provider request failed (${response.status}): ${body.slice(0, 500)}`);
  return schema.parse(body ? JSON.parse(body) : {});
}

export function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase().split("%")[0];
  if (isIP(normalized) === 4) {
    const [a, b] = normalized.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  }
  if (isIP(normalized) === 6) {
    return normalized === "::" || normalized === "::1" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("ff") || normalized.startsWith("::ffff:127.") || normalized.startsWith("::ffff:10.") || normalized.startsWith("::ffff:192.168.");
  }
  return true;
}

async function assertPublicMediaUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Remote media URL must use HTTPS without embedded credentials.");
  if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local")) throw new Error("Remote media URL cannot target a local host.");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("Remote media URL resolved to a private or reserved network.");
  return url;
}

export async function mediaBuffer(value: string, maxBytes = 500 * 1024 * 1024) {
  let url = await assertPublicMediaUrl(value);
  let response: Response | undefined;
  for (let redirects = 0; redirects <= 5; redirects++) {
    response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(5 * 60_000) });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location) throw new Error("Remote media redirect did not include a location.");
    url = await assertPublicMediaUrl(new URL(location, url).toString());
  }
  if (!response || [301, 302, 303, 307, 308].includes(response.status)) throw new Error("Remote media exceeded the redirect limit.");
  if (!response.ok) throw new Error(`Unable to retrieve rendered media (${response.status}).`);
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > maxBytes) throw new Error("Rendered media exceeds the provider upload limit.");
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > maxBytes) throw new Error("Rendered media exceeds the provider upload limit.");
  return buffer;
}
