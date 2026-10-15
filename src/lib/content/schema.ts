import { z } from "zod";

export const GeneratedPackageSchema = z.object({
  outline: z.array(z.object({ heading: z.string().min(1), purpose: z.string().min(1) })).min(3),
  script: z.object({
    title: z.string().min(1),
    hook: z.string().min(1),
    body: z.string().min(200),
    scenes: z.array(
      z.object({
        narration: z.string().min(1),
        visualType: z.enum(["scripture", "illustration", "typography", "map", "timeline"]),
        visualPrompt: z.string().min(1),
        scriptureRef: z.string().nullable(),
        durationMs: z.number().int().positive(),
      }),
    ).min(3),
  }),
  shorts: z.array(z.object({ title: z.string(), hook: z.string(), body: z.string() })).length(3),
  socialCopy: z.object({
    youtube: z.object({ caption: z.string(), hashtags: z.array(z.string()) }),
    youtubeShorts: z.object({ caption: z.string(), hashtags: z.array(z.string()) }),
    instagram: z.object({ caption: z.string(), hashtags: z.array(z.string()) }),
    facebook: z.object({ caption: z.string(), hashtags: z.array(z.string()) }),
    tiktok: z.object({ caption: z.string(), hashtags: z.array(z.string()) }),
    x: z.object({ posts: z.array(z.string().min(1).max(280)).min(1).max(25), hashtags: z.array(z.string()) }),
  }),
  metadata: z.object({
    description: z.string(),
    keywords: z.array(z.string()),
    thumbnailConcept: z.string(),
  }),
  citations: z.array(z.object({ reference: z.string(), supported: z.boolean(), note: z.string() })),
});

export type GeneratedPackage = z.infer<typeof GeneratedPackageSchema>;
