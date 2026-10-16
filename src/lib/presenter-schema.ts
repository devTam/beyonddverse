import { z } from "zod";

export const PresenterSnapshotSchema = z.object({
  id: z.string().uuid(), revision: z.number().int().positive(), name: z.string(),
  portraitAssetId: z.string().uuid(), providerAvatarId: z.string().min(1),
  voiceId: z.string().min(1), speechModel: z.string().min(1), speechSpeed: z.number().min(0.5).max(2),
  pronunciationDictionary: z.record(z.string(), z.string()), appearance: z.string(),
});
export type PresenterSnapshot = z.infer<typeof PresenterSnapshotSchema>;
export const PRESENTER_PREVIEW_TEXT = "Welcome to Beyond the Verse. Your explanation is the heart of every lesson. Together, we will explore its meaning, with Scripture and thoughtful visuals supporting the teaching.";
export const ACTIVE_PRESENTER_KEY = "activePresenterProfileId";

export function presenterEstimate(scenes: Array<{ presentation: string; durationMs: number }>, rate: number) {
  const durationMs = scenes.filter((scene) => scene.presentation === "presenter").reduce((sum, scene) => sum + scene.durationMs, 0);
  return { durationMs, costUsd: durationMs / 60_000 * rate };
}
