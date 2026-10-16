import { z } from "zod";

export const VideoSceneSchema = z.object({
  id: z.string(),
  narration: z.string(),
  narrationUrl: z.string().url(),
  visualUrl: z.string().url().optional(),
  visualMediaType: z.enum(["image", "video"]).default("image").optional(),
  visualDurationInFrames: z.number().int().positive().optional(),
  presentation: z.enum(["presenter", "cutaway"]).optional(),
  presenterVideoUrl: z.string().url().optional(),
  scriptureCards: z.array(z.object({ reference: z.string(), text: z.string(), translation: z.string(), startMs: z.number(), endMs: z.number() })).optional(),
  scriptureRef: z.string().nullable(),
  durationInFrames: z.number().int().positive(),
  timings: z.array(z.object({ word: z.string(), startMs: z.number(), endMs: z.number() })).optional(),
});

export const VideoInputSchema = z.object({
  productionVersion: z.number().int().optional(),
  scriptRevision: z.number().int().optional(),
  presenterProfileId: z.string().optional(),
  title: z.string(),
  hook: z.string(),
  brandName: z.string().default("Beyond the Verse"),
  brandAssetUrl: z.string().url().optional(),
  headingFont: z.string().default("Georgia"),
  bodyFont: z.string().default("Inter"),
  primaryColor: z.string().regex(/^#[0-9a-f]{6}$/i).default("#16231c"),
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/i).default("#d6a04d"),
  backgroundMusicUrl: z.string().url().optional(),
  scenes: z.array(VideoSceneSchema).min(1),
  fps: z.number().int().positive().default(30),
});

export type VideoInput = z.infer<typeof VideoInputSchema>;
