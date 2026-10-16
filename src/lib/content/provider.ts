import { createHash } from "node:crypto";
import { generateText, Output } from "ai";
import { estimatedDurationMs, lessonTranscript, narrationChunks, scenesFromText } from "./lesson";
import { FIRST_PERSON_NARRATION_RULES, assertFirstPersonNarration, assertNoCreatorAttribution, firstPersonDevelopmentExplanation } from "./narration-voice";
import { GeneratedPackageSchema, type GeneratedPackage } from "./schema";

export interface ContentProvider {
  generate(input: { reference: string; scripture: string; explanation: string }, onUsage?: (usage: { provider: string; model: string; inputTokens: number; outputTokens: number }) => Promise<void>): Promise<GeneratedPackage>;
}

export class DevelopmentContentProvider implements ContentProvider {
  async generate(input: { reference: string; scripture: string; explanation: string }) {
    if (!input.explanation.trim()) throw new Error("Add your explanation before generating a lesson.");
    const scenes = scenesFromText(firstPersonDevelopmentExplanation(input.explanation));
    const body = lessonTranscript(scenes);
    const title = `${input.reference}: ${input.explanation.trim().split(/\s+/).slice(0, 8).join(" ").replace(/[.!?,;:]+$/, "")}`;
    const excerpts = narrationChunks(input.explanation, 45);
    const shorts = Array.from({ length: 3 }, (_, i) => {
      const excerpt = firstPersonDevelopmentExplanation(excerpts[i % excerpts.length]);
      const parts = excerpt.split(/(?<=[.!?])\s+/);
      return { title: `${input.reference} — reflection ${i + 1}`, hook: parts.length > 1 ? parts[0] : "", body: parts.length > 1 ? parts.slice(1).join(" ") : excerpt };
    });
    const copy = { caption: title, hashtags: ["BeyondTheVerse", "BibleTeaching"] };
    return GeneratedPackageSchema.parse({
      outline: scenes.map((scene, i) => ({ heading: `Teaching ${i + 1}`, purpose: scene.narration })),
      script: { title, hook: scenes[0].narration, body, scenes },
      shorts,
      socialCopy: { youtube: copy, youtubeShorts: copy, instagram: copy, facebook: copy, tiktok: copy, x: { posts: [input.explanation.slice(0, 280)], hashtags: copy.hashtags } },
      metadata: { description: body, keywords: [input.reference], thumbnailConcept: scenes[0].visualPrompt },
      citations: [],
    });
  }
}

export class AiGatewayContentProvider implements ContentProvider {
  async generate(input: { reference: string; scripture: string; explanation: string }, onUsage?: (usage: { provider: string; model: string; inputTokens: number; outputTokens: number }) => Promise<void>) {
    const { getProductionSettings } = await import("../settings");
    const { textModel: model } = await getProductionSettings();

    const result = await generateText({
      model,
      temperature: 0,
      output: Output.object({ schema: GeneratedPackageSchema }),
      system: [
        "You are an expert Bible education editor working under strict source controls.",
        "My supplied explanation is the primary teaching material. Preserve my meaning and voice.",
        FIRST_PERSON_NARRATION_RULES,
        "Never invent a quotation, verse, historical assertion, or theological certainty.",
        "Distinguish Scripture from my interpretation, historical context, and uncertainty without introducing third-person attribution to me.",
        "Faithfully polish my entire supplied explanation into a spoken lesson. Do not expand it with new claims or force an 8–12 minute duration.",
        "Scenes are the sole spoken script. Put EVERY teaching paragraph into scenes in order, including any spoken opening and conclusion. body MUST equal all scene narrations joined with two newlines; hook is editorial metadata, not additional unspoken teaching.",
        "Use scenes of roughly 40–90 words. Use presenter for the opening, transitions, and conclusion; use cutaway for supporting illustrations, maps, and timelines.",
        "Use at most one referenced passage per scene; split a scene when it references multiple passages. Only set scriptureRef when the explanation actually references that passage. scriptureCue must be an exact phrase in that scene narration at which to show it. Never generate Scripture excerpts; these are resolved from the stored translation.",
        "Every short must be independently useful and drawn from the explanation.",
        "Return only content supported by the supplied Scripture and my explanation.",
      ].join(" "),
      prompt: `REFERENCE\n${input.reference}\n\nSCRIPTURE (authoritative source)\n${input.scripture}\n\nMY EXPLANATION (speak this as my own first-person teaching)\n${input.explanation}`,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "chapter-content-package",
        recordInputs: false,
        recordOutputs: false,
      },
    });
    await onUsage?.({ provider: "vercel-ai-gateway", model, inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 });
    const generated = GeneratedPackageSchema.parse(result.output);
    assertFirstPersonNarration(lessonTranscript(generated.script.scenes));
    assertNoCreatorAttribution(generated.script.hook);
    for (const short of generated.shorts) assertFirstPersonNarration(`${short.hook} ${short.body}`);
    const scenes = generated.script.scenes.map((scene, i, all) => ({ ...scene, presentation: i === 0 || i === all.length - 1 ? "presenter" as const : scene.presentation, durationMs: estimatedDurationMs(scene.narration) }));
    return { ...generated, script: { ...generated.script, scenes, body: lessonTranscript(scenes) } };
  }
}

export function getContentProvider(): ContentProvider {
  if (process.env.CONTENT_PROVIDER === "development") {
    return new DevelopmentContentProvider();
  }
  if (process.env.CONTENT_PROVIDER === "ai-gateway") return new AiGatewayContentProvider();
  if (!process.env.CONTENT_PROVIDER) {
    throw new Error("CONTENT_PROVIDER is required. Use ai-gateway in deployed environments or development locally.");
  }
  throw new Error(`Content provider “${process.env.CONTENT_PROVIDER}” is not configured.`);
}

export function contentHash(value: string) {
  return createHash("sha256").update(value).digest("hex");
}
