import "server-only";

import { gateway, generateImage } from "ai";
import { z } from "zod";

const ImageEnvironment = z.object({ AI_IMAGE_MODEL: z.string().min(1) });

export type GeneratedVisual = { body: Buffer; mimeType: string; format: string; provider: string; model: string };

export type ImageOptions = { model?: string; aspectRatio?: `${number}:${number}` };

export interface ImageProvider {
  generate(prompt: string, options?: ImageOptions): Promise<GeneratedVisual>;
}

export class AiGatewayImageProvider implements ImageProvider {
  async generate(prompt: string, options?: ImageOptions) {
    const env = ImageEnvironment.parse(process.env);
    const model = options?.model ?? env.AI_IMAGE_MODEL;
    const aspectRatio = options?.aspectRatio ?? "16:9";
    const result = await generateImage({
      model: gateway.image(model),
      prompt: `${prompt}\n\nGenerate one cinematic ${aspectRatio} image. Do not embed text, logos, watermarks, or depictions of God.`,
      aspectRatio,
      maxRetries: 2,
    });
    const image = result.image;
    const format = image.mediaType.split("/")[1] || "png";
    return { body: Buffer.from(image.uint8Array), mimeType: image.mediaType, format, provider: "ai-gateway", model };
  }
}

export function getImageProvider(): ImageProvider {
  return new AiGatewayImageProvider();
}
