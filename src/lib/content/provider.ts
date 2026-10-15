import { createHash } from "node:crypto";
import { generateText, Output } from "ai";
import { GeneratedPackageSchema, type GeneratedPackage } from "./schema";

export interface ContentProvider {
  generate(input: { reference: string; scripture: string; explanation: string }, onUsage?: (usage: { provider: string; model: string; inputTokens: number; outputTokens: number }) => Promise<void>): Promise<GeneratedPackage>;
}

export class DevelopmentContentProvider implements ContentProvider {
  async generate(input: { reference: string; scripture: string; explanation: string }) {
    const emphasis = input.explanation.split(/[.!?]/).find((line) => line.trim().length > 30)?.trim() ??
      "Creation begins with God, moves by his word, and is declared good.";

    return GeneratedPackageSchema.parse({
      outline: [
        { heading: "Before the beginning", purpose: "Establish God as the source of creation." },
        { heading: "Forming and filling", purpose: "Trace the ordered movement of the six days." },
        { heading: "Image and vocation", purpose: "Explain humanity's dignity and responsibility." },
        { heading: "The goodness of creation", purpose: "Conclude with the chapter's repeated verdict." },
      ],
      script: {
        title: "Genesis 1: The God Who Brings Order",
        hook: "The Bible begins not with an argument about God, but with God already creating.",
        body: `${input.reference} presents creation as purposeful, ordered, and good. The chapter repeatedly connects God's speech with reality: God speaks, creation responds, and God evaluates what has been made. The creator's central emphasis is: ${emphasis}\n\nThe sequence moves from an unformed world toward a place filled with life. Light and darkness are distinguished. Waters are divided. Dry land appears. Then the spaces are filled—with lights, creatures, and finally human beings. This literary movement helps us read the chapter on its own terms before importing questions it was not written to answer.\n\nHuman beings are made in God's image. The text grounds human dignity in God's decision, not in power, productivity, nationality, or achievement. Dominion is therefore a delegated vocation under God's authority, never permission to exploit what God calls good.\n\nThe final refrain widens from “good” to “very good.” Genesis 1 invites wonder, humility, and responsible care. It tells us whose world this is, why human life matters, and why creation deserves attention rather than contempt.`,
        scenes: [
          { narration: "In the beginning, God created the heavens and the earth.", visualType: "scripture", visualPrompt: "Dark textured field opening into restrained warm light, no depiction of God", scriptureRef: "Genesis 1:1", durationMs: 9000 },
          { narration: "The chapter moves from a world unformed toward a home ordered and filled with life.", visualType: "illustration", visualPrompt: "Elegant sequence of sea, sky, land and vegetation, editorial collage", scriptureRef: "Genesis 1:2–13", durationMs: 13000 },
          { narration: "God speaks, creation responds, and each movement receives a moral evaluation: it is good.", visualType: "typography", visualPrompt: "Kinetic typography emphasizing spoke, was so, and good", scriptureRef: "Genesis 1:3–25", durationMs: 12000 },
          { narration: "Human worth begins in the image of God, before any achievement or status.", visualType: "illustration", visualPrompt: "Diverse human silhouettes in a luminous natural landscape, dignified editorial style", scriptureRef: "Genesis 1:26–27", durationMs: 14000 },
          { narration: "Dominion is a calling exercised beneath the authority of the Creator.", visualType: "scripture", visualPrompt: "Hands tending a garden with subtle verse reference card", scriptureRef: "Genesis 1:28", durationMs: 11000 },
          { narration: "The finished creation is not merely useful. God sees all of it, and calls it very good.", visualType: "typography", visualPrompt: "Wide earth horizon with understated words very good", scriptureRef: "Genesis 1:31", durationMs: 11000 },
        ],
      },
      shorts: [
        { title: "Why Genesis Starts With God", hook: "Genesis does not begin by proving God.", body: "It begins with God acting. Before the world has shape, the Creator is already present and purposeful." },
        { title: "The Pattern Hidden in Genesis 1", hook: "Genesis 1 moves in a pattern: form, then fullness.", body: "God orders spaces, then fills them. The rhythm presents creation as intentional rather than accidental." },
        { title: "What the Image of God Means", hook: "Your value starts before your résumé.", body: "Genesis grounds human dignity in God's image—not wealth, strength, nation, or productivity." },
      ],
      socialCopy: {
        youtube: { caption: "Walk through Genesis 1 and discover its movement from disorder to a world called very good.", hashtags: ["BibleStudy", "Genesis", "ChristianEducation"] },
        youtubeShorts: { caption: "Genesis 1 in under a minute: creation is purposeful, ordered, and good.", hashtags: ["Shorts", "BibleStudy", "Genesis1"] },
        instagram: { caption: "Your dignity is received before it is achieved. Genesis 1 grounds human worth in the image of God.", hashtags: ["Genesis1", "BibleTeaching", "Faith"] },
        facebook: { caption: "Explore Genesis 1 and the biblical foundation for human dignity, purpose, and care for creation.", hashtags: ["BibleStudy", "Genesis", "Faith"] },
        tiktok: { caption: "The pattern hidden in Genesis 1: forming, filling, and a world called good.", hashtags: ["BibleTok", "Genesis1", "ChristianEducation"] },
        x: { posts: ["Genesis 1 begins with God already acting—not with an argument for God.", "The chapter moves from a world unformed toward a home ordered and filled with life: spaces are formed, then filled.", "Human dignity is received before it is achieved. Genesis grounds it in the image of God, not power, productivity, or status."], hashtags: ["BibleStudy", "Genesis1"] },
      },
      metadata: {
        description: "A chapter-by-chapter teaching on Genesis 1, creation, human dignity, and the goodness of the world.",
        keywords: ["Genesis 1 explained", "creation", "image of God", "Bible study"],
        thumbnailConcept: "A restrained divide between darkness and warm dawn with the words BEFORE THE BEGINNING.",
      },
      citations: [
        { reference: "Genesis 1:1", supported: input.scripture.includes("beginning"), note: "Opening creation claim is present in the source text." },
        { reference: "Genesis 1:26–27", supported: input.scripture.includes("image"), note: "Image-of-God language is present in the source text." },
        { reference: "Genesis 1:31", supported: input.scripture.includes("very good"), note: "The concluding evaluation is present in the source text." },
      ],
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
        "The creator explanation is the primary interpretation. Preserve its meaning and voice.",
        "Never invent a quotation, verse, historical assertion, or theological certainty.",
        "Clearly distinguish Scripture, creator interpretation, historical context, and uncertain commentary.",
        "Every short must be independently useful. Long-form narration should target 8–12 minutes.",
        "Return only content supported by the supplied Scripture and creator explanation.",
      ].join(" "),
      prompt: `REFERENCE\n${input.reference}\n\nSCRIPTURE (authoritative source)\n${input.scripture}\n\nCREATOR EXPLANATION (primary interpretation)\n${input.explanation}`,
      experimental_telemetry: {
        isEnabled: true,
        functionId: "chapter-content-package",
        recordInputs: false,
        recordOutputs: false,
      },
    });
    await onUsage?.({ provider: "vercel-ai-gateway", model, inputTokens: result.usage.inputTokens ?? 0, outputTokens: result.usage.outputTokens ?? 0 });
    return GeneratedPackageSchema.parse(result.output);
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
