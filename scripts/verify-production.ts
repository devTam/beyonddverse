/** Run only against a disposable seeded local database. No provider calls or uploads. */
import { loadEnvConfig } from "@next/env";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma";
import { DevelopmentContentProvider } from "../src/lib/content/provider";
import { resolveScripture, verifySceneScripture } from "../src/lib/content/scripture";
import { buildProductionProps } from "../src/lib/video/props";
import { narrationInputHash, narrationSettings } from "../src/lib/avatar/production";
import { PresenterSnapshotSchema } from "../src/lib/presenter-schema";

loadEnvConfig(process.cwd());
async function main() {
  if (!process.env.BTV_DISPOSABLE_DATABASE || !["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Set BTV_DISPOSABLE_DATABASE=1 and use a disposable local database.");
  const project = await prisma.chapterProject.findFirstOrThrow();
  const assetData = { bytes: 10n, checksum: "verification", status: "APPROVED" as const, projectId: project.id, providerMetadata: { resourceType: "video", deliveryType: "authenticated", version: 1, format: "mp4" } };
  const portrait = await prisma.asset.create({ data: { ...assetData, storageKey: `verification/portrait-${Date.now()}`, kind: "IMAGE", mimeType: "image/png" } });
  const latestProfile = await prisma.presenterProfile.findFirst({ orderBy: { revision: "desc" } });
  const profile = await prisma.presenterProfile.create({ data: { revision: (latestProfile?.revision ?? 0) + 1, name: "Verification host", portraitAssetId: portrait.id, providerAvatarId: "fixture-avatar", voiceId: "fixture-voice", speechModel: "fixture/speech", speechSpeed: 1, pronunciationDictionary: {}, appearance: "Fixed fictional presenter", status: "APPROVED", approvedAt: new Date() } });
  const presenter = PresenterSnapshotSchema.parse(profile);
  const explanationText = "I understand human dignity as received before it is achieved. This changes how we treat one another.\n\nGenesis 1:27 grounds this dignity in God's image. Every person deserves care and respect.\n\nOur daily actions should express this understanding. We can begin with the people nearest to us.";
  const generated = await new DevelopmentContentProvider().generate({ reference: "Genesis 1", scripture: "", explanation: explanationText });
  const verified = await verifySceneScripture(generated.script.scenes, "WEB");
  const explanation = await prisma.explanation.create({ data: { projectId: project.id, revision: (await prisma.explanation.count({ where: { projectId: project.id } })) + 1, sourceType: "TEXT", originalText: explanationText, editableText: explanationText } });
  const latestPackage = await prisma.contentPackage.findFirst({ where: { projectId: project.id }, orderBy: { version: "desc" } });
  const content = await prisma.contentPackage.create({ data: { projectId: project.id, explanationId: explanation.id, version: (latestPackage?.version ?? 0) + 1, outline: generated.outline, socialCopy: generated.socialCopy, metadata: generated.metadata } });
  const script = await prisma.script.create({ data: { contentPackageId: content.id, kind: "LONG_FORM", revision: 1, title: generated.script.title, hook: generated.script.hook, body: generated.script.body, status: "APPROVED", productionVersion: 2, presenterSnapshot: presenter, scriptureTranslation: "WEB", scenes: { create: verified.map((scene, i) => ({ ...scene, position: i + 1, durationMs: 12000 })) } }, include: { scenes: { orderBy: { position: "asc" } } } });
  for (const scene of script.scenes) {
    const audio = await prisma.asset.create({ data: { ...assetData, storageKey: `verification/audio-${scene.id}`, kind: "NARRATION", mimeType: "audio/mpeg", durationMs: 12000 } });
    const words = scene.narration.split(/\s+/);
    const timings = words.map((word, i) => ({ word, startMs: i / words.length * 11500, endMs: (i + 1) / words.length * 11500 }));
    const sourceHash = narrationInputHash(scene.narration, narrationSettings(presenter, { narratorVoice: "other", speechModel: "other", speechSpeed: 2, pronunciationDictionary: {} }));
    const narration = await prisma.narration.create({ data: { sceneId: scene.id, assetId: audio.id, provider: "fixture", voiceId: presenter.voiceId, inputHash: sourceHash, sourceHash, timings } });
    if (scene.presentation === "presenter") {
      const video = await prisma.asset.create({ data: { ...assetData, storageKey: `verification/video-${scene.id}`, kind: "VIDEO", mimeType: "video/mp4", durationMs: 12000 } });
      await prisma.avatarGeneration.create({ data: { profileId: profile.id, projectId: project.id, sceneId: scene.id, narrationId: narration.id, audioAssetId: audio.id, assetId: video.id, inputHash: `verification-${scene.id}`, status: "SUCCEEDED", durationMs: 12000, ratePerMinute: 2.31 } });
    } else {
      const visual = await prisma.asset.create({ data: { ...assetData, storageKey: `verification/image-${scene.id}`, kind: "IMAGE", mimeType: "image/png" } });
      await prisma.assetUsage.create({ data: { sceneId: scene.id, assetId: visual.id, role: "PRIMARY_VISUAL" } });
    }
  }
  const props = await buildProductionProps(script.id);
  assert.equal(props.scenes.map((scene) => scene.narration).join("\n\n"), explanationText);
  assert.equal(props.presenterProfileId, profile.id);
  assert.equal(props.scenes[1].scriptureCards?.[0].text, await resolveScripture("Genesis 1:27", "WEB"));
  assert.ok(props.scenes[0].presenterVideoUrl);
  assert.ok(props.scenes[1].visualUrl);
  const narration = await prisma.narration.findFirstOrThrow({ where: { sceneId: script.scenes[0].id } });
  await prisma.narration.update({ where: { id: narration.id }, data: { sourceHash: "stale" } });
  await assert.rejects(buildProductionProps(script.id), /stale/);
  await prisma.narration.update({ where: { id: narration.id }, data: { sourceHash: narration.sourceHash } });
  await prisma.script.create({ data: { contentPackageId: content.id, parentId: script.id, kind: "LONG_FORM", revision: 2, title: "Edited lesson", hook: "Edited hook", body: "Edited teaching", productionVersion: 2 } });
  await assert.rejects(buildProductionProps(script.id), /superseded/);
  console.log("Production integration passed: complete explanation, shared presenter identity, verified Scripture, stale narration rejected, superseded revision rejected.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
