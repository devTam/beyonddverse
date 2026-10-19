// Shared by Next.js server actions and the standalone Node render worker.
import { UserInputError } from "../action-error";
import type { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { ACTIVE_PRESENTER_KEY, PresenterSnapshotSchema } from "../presenter-schema";
import { contentHash } from "../content/provider";

export async function activePresenterSnapshot() {
  const setting = await prisma.workspaceSetting.findUnique({ where: { key: ACTIVE_PRESENTER_KEY } });
  const profile = typeof setting?.value === "string" ? await prisma.presenterProfile.findUnique({ where: { id: setting.value } }) : null;
  if (!profile || profile.status !== "APPROVED") throw new UserInputError("Approve a presenter preview in Settings before production.");
  return PresenterSnapshotSchema.parse(profile);
}

export function narrationSettings(snapshot: Prisma.JsonValue | null, fallback: { narratorVoice: string; speechModel: string; speechSpeed: number; pronunciationDictionary: Record<string, string> }) {
  const presenter = snapshot ? PresenterSnapshotSchema.parse(snapshot) : null;
  return { voice: presenter?.voiceId ?? fallback.narratorVoice, model: presenter?.speechModel ?? fallback.speechModel, speed: presenter?.speechSpeed ?? fallback.speechSpeed, dictionary: presenter?.pronunciationDictionary ?? fallback.pronunciationDictionary };
}
export function narrationInputHash(narration: string, config: ReturnType<typeof narrationSettings>, regenerationId?: string) {
  return contentHash(JSON.stringify({ narration, ...config, ...(regenerationId ? { regenerationId } : {}) }));
}

export async function assertCurrentScript(scriptId: string) {
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId }, include: { contentPackage: { include: { explanation: true } } } });
  const [later, newerPackage, newerExplanation] = await Promise.all([
    prisma.script.findFirst({ where: { contentPackageId: script.contentPackageId, kind: script.kind, revision: { gt: script.revision } } }),
    prisma.contentPackage.findFirst({ where: { projectId: script.contentPackage.projectId, version: { gt: script.contentPackage.version } } }),
    prisma.explanation.findFirst({ where: { projectId: script.contentPackage.projectId, revision: { gt: script.contentPackage.explanation.revision } } }),
  ]);
  if (script.status !== "APPROVED" || later || newerPackage || newerExplanation) throw new Error("This script is unapproved or superseded. Review the latest explanation and script before production.");
  return script;
}
