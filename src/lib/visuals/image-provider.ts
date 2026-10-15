import "server-only";

import { gateway, generateText } from "ai";
import { z } from "zod";

const ImageEnvironment = z.object({ AI_IMAGE_MODEL: z.string().min(1) });

export type GeneratedVisual = { body: Buffer; mimeType: string; format: string; provider: string; model: string };

export interface ImageProvider {
  generate(prompt: string): Promise<GeneratedVisual>;
}

export class AiGatewayImageProvider implements ImageProvider {
  async generate(prompt: string) {
    const env = ImageEnvironment.parse(process.env);
    const result = await generateText({
      model: gateway(env.AI_IMAGE_MODEL),
      prompt: `${prompt}\n\nGenerate one cinematic 16:9 image. Do not embed text, logos, watermarks, or depictions of God.`,
      maxRetries: 2,
      experimental_telemetry: { isEnabled: true, functionId: "scene-visual", recordInputs: false, recordOutputs: false },
    });
    const image = result.files.find((file) => file.mediaType.startsWith("image/"));
    if (!image) throw new Error("The image provider returned no image.");
    const format = image.mediaType.split("/")[1] || "png";
    return { body: Buffer.from(image.uint8Array), mimeType: image.mediaType, format, provider: "ai-gateway", model: env.AI_IMAGE_MODEL };
  }
}

export function getImageProvider(): ImageProvider {
  return new AiGatewayImageProvider();
}
