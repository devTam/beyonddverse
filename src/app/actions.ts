"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { tasks } from "@trigger.dev/sdk";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import type { contentPipeline } from "../../trigger/content-pipeline";

const ExplanationInput = z.object({
  projectId: z.string().uuid(),
  explanation: z.string().trim().min(80, "Add at least 80 characters so the creator's interpretation remains primary."),
});

export async function saveExplanation(formData: FormData) {
  const session = await requireUser(await headers());
  const input = ExplanationInput.parse(Object.fromEntries(formData));
  const latest = await prisma.explanation.findFirst({ where: { projectId: input.projectId }, orderBy: { revision: "desc" } });
  await prisma.$transaction([
    prisma.explanation.create({
      data: {
        projectId: input.projectId,
        revision: (latest?.revision ?? 0) + 1,
        sourceType: "TEXT",
        originalText: input.explanation,
        editableText: input.explanation,
        authorId: session.user.id,
      },
    }),
    prisma.chapterProject.update({ where: { id: input.projectId }, data: { status: "WRITING", currentStage: 2 } }),
  ]);
  revalidatePath("/studio/genesis-1");
}

export async function generateContent(formData: FormData) {
  await requireUser(await headers());
  const projectId = z.string().uuid().parse(formData.get("projectId"));
  if (!process.env.TRIGGER_SECRET_KEY) throw new Error("TRIGGER_SECRET_KEY is required to start content generation.");
  const explanation = await prisma.explanation.findFirst({ where: { projectId }, orderBy: { revision: "desc" } });
  if (!explanation) throw new Error("Save an explanation before generating content.");

  const baseKey = `content:${projectId}:${explanation.id}`;
  const existing = await prisma.workflowRun.findFirst({ where: { idempotencyKey: { startsWith: baseKey } }, orderBy: { startedAt: "desc" } });
  if (existing && ["QUEUED", "RUNNING", "WAITING", "SUCCEEDED"].includes(existing.status)) {
    redirect(`/studio/genesis-1?workflow=${existing.id}`);
  }
  const idempotencyKey = existing ? `${baseKey}:retry:${Date.now()}` : baseKey;
  const run = await prisma.workflowRun.create({
    data: {
      projectId,
      type: "CONTENT_PACKAGE",
      status: "QUEUED",
      idempotencyKey,
      input: { explanationId: explanation.id },
      steps: { create: [
        { position: 1, name: "Prepare Scripture context" },
        { position: 2, name: "Generate structured package" },
        { position: 3, name: "Validate Scripture citations" },
        { position: 4, name: "Persist versioned artifacts" },
      ] },
    },
  });
  try {
    const handle = await tasks.trigger<typeof contentPipeline>(
      "chapter-content-pipeline",
      { workflowRunId: run.id, projectId, explanationId: explanation.id },
      { idempotencyKey, idempotencyKeyTTL: "30d", tags: [`project:${projectId}`, `workflow:${run.id}`] },
    );
    await prisma.workflowRun.update({ where: { id: run.id }, data: { output: { triggerRunId: handle.id } } });
  } catch (error) {
    await prisma.workflowRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), error: error instanceof Error ? error.message : "Unknown generation failure" } });
    throw error;
  }
  redirect(`/studio/genesis-1?workflow=${run.id}`);
}

export async function approveScript(formData: FormData) {
  const session = await requireUser(await headers());
  const scriptId = z.string().uuid().parse(formData.get("scriptId"));
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId }, include: { contentPackage: true } });
  await prisma.$transaction([
    prisma.script.update({ where: { id: scriptId }, data: { status: "APPROVED" } }),
    prisma.approvalEvent.create({ data: { scriptId, actorId: session.user.id, action: "APPROVED", note: "Approved for media production" } }),
    prisma.chapterProject.update({ where: { id: script.contentPackage.projectId }, data: { status: "MEDIA_PRODUCTION", currentStage: 4 } }),
  ]);
  revalidatePath("/");
  revalidatePath("/studio/genesis-1");
}
