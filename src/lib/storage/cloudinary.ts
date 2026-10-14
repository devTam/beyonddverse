import { randomUUID, timingSafeEqual } from "node:crypto";
import { v2 as cloudinary, type UploadApiOptions, type UploadApiResponse } from "cloudinary";
import { z } from "zod";
import type { AssetKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  cloudinaryResourceTypeFor,
  cloudinarySafeStem,
  type CloudinaryResourceType,
} from "@/lib/storage/cloudinary-utils";

const CloudinaryEnvironment = z.object({
  CLOUDINARY_CLOUD_NAME: z.string().min(1),
  CLOUDINARY_API_KEY: z.string().min(1),
  CLOUDINARY_API_SECRET: z.string().min(1),
  CLOUDINARY_FOLDER: z.string().min(1).default("beyond-the-verse"),
});

export type StoredMedia = {
  publicId: string;
  resourceType: CloudinaryResourceType;
  deliveryType: string;
  format?: string;
  version: number;
  bytes: number;
  width?: number;
  height?: number;
  durationMs?: number;
  checksum: string;
  secureUrl: string;
};

export type UploadMediaInput = {
  body: Buffer;
  kind: AssetKind;
  mimeType: string;
  filename: string;
  projectId?: string;
};

export type SignedUploadInput = Pick<UploadMediaInput, "kind" | "mimeType" | "filename" | "projectId">;

let configured = false;

function configureCloudinary() {
  if (configured) return;
  const env = CloudinaryEnvironment.parse(process.env);
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
    signature_algorithm: "sha256",
  });
  configured = true;
}

function uploadStream(body: Buffer, options: UploadApiOptions) {
  return new Promise<UploadApiResponse>((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
      if (error) reject(error);
      else if (!result) reject(new Error("Cloudinary returned no upload result."));
      else resolve(result);
    });
    stream.end(body);
  });
}

function toStoredMedia(result: UploadApiResponse): StoredMedia {
  return {
    publicId: result.public_id,
    resourceType: result.resource_type as CloudinaryResourceType,
    deliveryType: result.type,
    format: result.format,
    version: result.version,
    bytes: result.bytes,
    width: result.width,
    height: result.height,
    durationMs: result.duration ? Math.round(result.duration * 1000) : undefined,
    checksum: result.etag,
    secureUrl: result.secure_url,
  };
}

export async function uploadMedia(input: UploadMediaInput): Promise<StoredMedia> {
  configureCloudinary();
  const env = CloudinaryEnvironment.parse(process.env);
  const folder = [env.CLOUDINARY_FOLDER, input.projectId, input.kind.toLowerCase()].filter(Boolean).join("/");
  const result = await uploadStream(input.body, {
    resource_type: cloudinaryResourceTypeFor(input.mimeType),
    type: "authenticated",
    folder,
    public_id: `${cloudinarySafeStem(input.filename)}-${randomUUID()}`,
    overwrite: false,
    use_filename: false,
    unique_filename: false,
    context: { kind: input.kind, original_filename: input.filename },
  });
  return toStoredMedia(result);
}

export function createSignedUploadParameters(input: SignedUploadInput) {
  configureCloudinary();
  const env = CloudinaryEnvironment.parse(process.env);
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = [env.CLOUDINARY_FOLDER, input.projectId, input.kind.toLowerCase()].filter(Boolean).join("/");
  const publicId = `${cloudinarySafeStem(input.filename)}-${randomUUID()}`;
  const params = { folder, public_id: publicId, timestamp, type: "authenticated" as const };
  return {
    ...params,
    signature: cloudinary.utils.api_sign_request(params, env.CLOUDINARY_API_SECRET),
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    resourceType: cloudinaryResourceTypeFor(input.mimeType),
  };
}

export function verifyUploadResponse(input: { publicId: string; version: number; signature: string }) {
  configureCloudinary();
  const env = CloudinaryEnvironment.parse(process.env);
  const expected = cloudinary.utils.api_sign_request(
    { public_id: input.publicId, version: input.version },
    env.CLOUDINARY_API_SECRET,
  );
  const suppliedBuffer = Buffer.from(input.signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}

export async function uploadAndCreateAsset(input: UploadMediaInput) {
  const media = await uploadMedia(input);
  return prisma.asset.create({
    data: {
      kind: input.kind,
      storageKey: media.publicId,
      mimeType: input.mimeType,
      bytes: BigInt(media.bytes),
      checksum: media.checksum,
      width: media.width,
      height: media.height,
      durationMs: media.durationMs,
      providerMetadata: {
        provider: "cloudinary",
        resourceType: media.resourceType,
        deliveryType: media.deliveryType,
        format: media.format,
        version: media.version,
        secureUrl: media.secureUrl,
      } satisfies Prisma.InputJsonValue,
    },
  });
}

type DeliveryAsset = {
  storageKey: string;
  providerMetadata: Prisma.JsonValue | null;
};

export function createSignedDeliveryUrl(asset: DeliveryAsset) {
  configureCloudinary();
  const metadata = (asset.providerMetadata ?? {}) as Record<string, unknown>;
  return cloudinary.url(asset.storageKey, {
    secure: true,
    sign_url: true,
    resource_type: typeof metadata.resourceType === "string" ? metadata.resourceType : "image",
    type: typeof metadata.deliveryType === "string" ? metadata.deliveryType : "authenticated",
    version: typeof metadata.version === "number" ? metadata.version : undefined,
    format: typeof metadata.format === "string" ? metadata.format : undefined,
  });
}

export async function deleteMedia(asset: DeliveryAsset) {
  configureCloudinary();
  const metadata = (asset.providerMetadata ?? {}) as Record<string, unknown>;
  const result = await cloudinary.uploader.destroy(asset.storageKey, {
    resource_type: typeof metadata.resourceType === "string" ? metadata.resourceType : "image",
    type: typeof metadata.deliveryType === "string" ? metadata.deliveryType : "authenticated",
    invalidate: true,
  });
  if (result.result !== "ok" && result.result !== "not found") {
    throw new Error(`Cloudinary deletion failed: ${result.result}`);
  }
  return result.result;
}
