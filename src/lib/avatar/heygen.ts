import "server-only";
import { z } from "zod";

export interface AvatarProvider {
  registerPortrait(name: string, portraitUrl: string, key: string): Promise<string>;
  lookStatus(id: string): Promise<"processing" | "completed" | "failed">;
  submit(input: { avatarId: string; audioUrl: string; aspectRatio: "16:9" | "9:16"; motionPrompt: string; key: string }): Promise<string>;
  status(id: string): Promise<{ status: string; videoUrl?: string; duration?: number; error?: string }>;
}

/** HeyGen v3: explicit Avatar IV + externally synthesized audio, never a second voice. */
export class HeyGenAvatarProvider implements AvatarProvider {
  private async request(path: string, body?: unknown, key?: string): Promise<unknown> {
    if (!process.env.HEYGEN_API_KEY) throw new Error("HEYGEN_API_KEY is required for presenter generation.");
    const response = await fetch(`https://api.heygen.com/v3/${path}`, {
      method: body ? "POST" : "GET",
      headers: { "X-Api-Key": process.env.HEYGEN_API_KEY, "Content-Type": "application/json", ...(key ? { "Idempotency-Key": key } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok) throw new Error(`HeyGen returned HTTP ${response.status}. Check API credits, permissions, or provider status.`);
    return response.json();
  }
  async registerPortrait(name: string, portraitUrl: string, key: string) {
    const result = z.object({ data: z.object({ avatar_item: z.object({ id: z.string().min(1) }) }) }).parse(await this.request("avatars", { type: "photo", name, file: { type: "url", url: portraitUrl } }, key));
    return result.data.avatar_item.id;
  }
  async lookStatus(id: string) {
    const result = z.object({ data: z.object({ status: z.enum(["processing", "completed", "failed"]) }) }).parse(await this.request(`avatars/looks/${encodeURIComponent(id)}`));
    return result.data.status;
  }
  async submit(input: { avatarId: string; audioUrl: string; aspectRatio: "16:9" | "9:16"; motionPrompt: string; key: string }) {
    const result = z.object({ data: z.object({ video_id: z.string().min(1) }) }).parse(await this.request("videos", {
      type: "avatar", avatar_id: input.avatarId, audio_url: input.audioUrl,
      engine: { type: "avatar_iv" }, resolution: "1080p", aspect_ratio: input.aspectRatio,
      motion_prompt: input.motionPrompt, expressiveness: "low", title: "Beyond the Verse presenter", callback_id: input.key,
    }, input.key));
    return result.data.video_id;
  }
  async status(id: string) {
    const result = z.object({ data: z.object({ status: z.string(), video_url: z.string().url().nullish(), duration: z.number().nullish(), failure_message: z.string().nullish() }) }).parse(await this.request(`videos/${encodeURIComponent(id)}`));
    return { status: result.data.status, videoUrl: result.data.video_url ?? undefined, duration: result.data.duration ?? undefined, error: result.data.failure_message ?? undefined };
  }
}
