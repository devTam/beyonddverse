import "server-only";

import { gateway, generateSpeech } from "ai";
import { z } from "zod";

const SpeechEnvironment = z.object({
  AI_SPEECH_MODEL: z.string().min(1),
  TTS_VOICE: z.string().min(1),
  TTS_SPEED: z.coerce.number().min(0.5).max(2).default(1),
  PRONUNCIATION_DICTIONARY: z.string().default("{}"),
});

export type SpeechOutput = { audio: Buffer; mimeType: string; format: string; provider: string; voiceId: string };

export type SpeechOptions = { model?: string; voice?: string; speed?: number; pronunciationDictionary?: Record<string, string> };
export interface SpeechProvider {
  synthesize(text: string, options?: SpeechOptions): Promise<SpeechOutput>;
}

function pronunciationInstructions(serialized: string) {
  const dictionary = z.record(z.string(), z.string()).parse(JSON.parse(serialized));
  const entries = Object.entries(dictionary);
  if (!entries.length) return undefined;
  return `Use these pronunciations exactly: ${entries.map(([word, pronunciation]) => `${word}: ${pronunciation}`).join("; ")}.`;
}

export class AiGatewaySpeechProvider implements SpeechProvider {
  async synthesize(text: string, options?: SpeechOptions) {
    const env = SpeechEnvironment.parse(process.env);
    const model = options?.model ?? env.AI_SPEECH_MODEL;
    const voice = options?.voice ?? env.TTS_VOICE;
    const speed = options?.speed ?? env.TTS_SPEED;
    const dictionary = options?.pronunciationDictionary ? JSON.stringify(options.pronunciationDictionary) : env.PRONUNCIATION_DICTIONARY;
    const result = await generateSpeech({
      model: gateway.speech(model),
      text,
      voice,
      speed,
      outputFormat: "mp3",
      language: "en",
      instructions: pronunciationInstructions(dictionary),
      maxRetries: 2,
      telemetry: { isEnabled: true, functionId: "scene-narration", recordInputs: false, recordOutputs: false },
    });
    return {
      audio: Buffer.from(result.audio.uint8Array),
      mimeType: result.audio.mediaType || "audio/mpeg",
      format: result.audio.format,
      provider: "ai-gateway",
      voiceId: voice,
    };
  }
}

export function getSpeechProvider(): SpeechProvider {
  return new AiGatewaySpeechProvider();
}
