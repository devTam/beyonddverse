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

export interface SpeechProvider {
  synthesize(text: string): Promise<SpeechOutput>;
}

function pronunciationInstructions(serialized: string) {
  const dictionary = z.record(z.string(), z.string()).parse(JSON.parse(serialized));
  const entries = Object.entries(dictionary);
  if (!entries.length) return undefined;
  return `Use these pronunciations exactly: ${entries.map(([word, pronunciation]) => `${word}: ${pronunciation}`).join("; ")}.`;
}

export class AiGatewaySpeechProvider implements SpeechProvider {
  async synthesize(text: string) {
    const env = SpeechEnvironment.parse(process.env);
    const result = await generateSpeech({
      model: gateway.speech(env.AI_SPEECH_MODEL),
      text,
      voice: env.TTS_VOICE,
      speed: env.TTS_SPEED,
      outputFormat: "mp3",
      language: "en",
      instructions: pronunciationInstructions(env.PRONUNCIATION_DICTIONARY),
      maxRetries: 2,
      telemetry: { isEnabled: true, functionId: "scene-narration", recordInputs: false, recordOutputs: false },
    });
    return {
      audio: Buffer.from(result.audio.uint8Array),
      mimeType: result.audio.mediaType || "audio/mpeg",
      format: result.audio.format,
      provider: "ai-gateway",
      voiceId: env.TTS_VOICE,
    };
  }
}

export function getSpeechProvider(): SpeechProvider {
  return new AiGatewaySpeechProvider();
}
