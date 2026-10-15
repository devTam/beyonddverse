import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";

const Envelope = z.object({ v: z.literal(1), iv: z.string(), tag: z.string(), data: z.string() });

function key() {
  const secret = process.env.CREDENTIAL_ENCRYPTION_KEY;
  if (!secret || secret.length < 32) throw new Error("CREDENTIAL_ENCRYPTION_KEY must contain at least 32 characters.");
  return createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return JSON.stringify({ v: 1, iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), data: data.toString("base64url") });
}

export function decryptSecret(value: string) {
  const envelope = Envelope.parse(JSON.parse(value));
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(envelope.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(envelope.data, "base64url")), decipher.final()]).toString("utf8");
}
