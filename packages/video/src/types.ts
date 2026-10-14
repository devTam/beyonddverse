import { z } from "zod";

export const VideoSceneSchema = z.object({
  id: z.string(),
  narration: z.string(),
  narrationUrl: z.string().url(),
  visualUrl: z.string().url(),
  scriptureRef: z.string().nullable(),
  durationInFrames: z.number().int().positive(),
});

export const VideoInputSchema = z.object({
  title: z.string(),
  hook: z.string(),
  brandName: z.string().default("Beyond the Verse"),
  scenes: z.array(VideoSceneSchema).min(1),
  fps: z.number().int().positive().default(30),
});

export type VideoInput = z.infer<typeof VideoInputSchema>;
