"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getContentProvider } from "@/lib/content/provider";
import { prisma } from "@/lib/prisma";

const ExplanationInput = z.object({
  projectId: z.string().uuid(),
  explanation: z.string().trim().min(80, "Add at least 80 characters so the creator's interpretation remains primary."),
});

export async function saveExplanation(formData: FormData) {
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
      },
    }),
    prisma.chapterProject.update({ where: { id: input.projectId }, data: { status: "WRITING", currentStage: 2 } }),
  ]);
  revalidatePath("/studio/genesis-1");
}

export async function generateContent(formData: FormData) {
  const projectId = z.string().uuid().parse(formData.get("projectId"));
  const project = await prisma.chapterProject.findUniqueOrThrow({
    where: { id: projectId },
    include: { chapter: { include: { book: true, verses: { orderBy: { number: "asc" } } } }, explanations: { orderBy: { revision: "desc" }, take: 1 } },
  });
  const explanation = project.explanations[0];
  if (!explanation) throw new Error("Save an explanation before generating content.");

  const idempotencyKey = `content:${projectId}:${explanation.id}`;
  const existing = await prisma.workflowRun.findUnique({ where: { idempotencyKey } });
  if (existing?.status === "SUCCEEDED") return;

  const run = existing ?? await prisma.workflowRun.create({
    data: {
      projectId,
      type: "CONTENT_PACKAGE",
      status: "RUNNING",
      idempotencyKey,
      input: { explanationId: explanation.id },
      startedAt: new Date(),
      steps: { create: [
        { position: 1, name: "Prepare Scripture context", status: "RUNNING", attempts: 1 },
        { position: 2, name: "Generate structured package" },
        { position: 3, name: "Validate Scripture citations" },
      ] },
    },
  });

  try {
    const scripture = project.chapter.verses.map((verse) => `${verse.number}. ${verse.text}`).join("\n");
    const generated = await getContentProvider().generate({
      reference: `${project.chapter.book.name} ${project.chapter.number}`,
      scripture,
      explanation: explanation.editableText,
    });
    const latest = await prisma.contentPackage.findFirst({ where: { projectId }, orderBy: { version: "desc" } });
    await prisma.$transaction(async (tx) => {
      await tx.workflowStep.updateMany({ where: { runId: run.id }, data: { status: "SUCCEEDED", completedAt: new Date() } });
      await tx.contentPackage.create({
        data: {
          projectId,
          explanationId: explanation.id,
          version: (latest?.version ?? 0) + 1,
          status: "PENDING",
          outline: generated.outline,
          socialCopy: generated.socialCopy,
          metadata: generated.metadata,
          validationReport: { citations: generated.citations, valid: generated.citations.every((item) => item.supported) },
          scripts: {
            create: [
              {
                kind: "LONG_FORM",
                revision: 1,
                title: generated.script.title,
                hook: generated.script.hook,
                body: generated.script.body,
                status: "PENDING",
                scenes: { create: generated.script.scenes.map((scene, index) => ({ ...scene, position: index + 1 })) },
              },
              ...generated.shorts.map((short, index) => ({ kind: `SHORT_${index + 1}`, revision: 1, ...short, status: "DRAFT" as const })),
            ],
          },
        },
      });
      await tx.workflowRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED", completedAt: new Date(), output: { generated: true } } });
      await tx.chapterProject.update({ where: { id: projectId }, data: { status: "SCRIPT_REVIEW", currentStage: 3 } });
    });
  } catch (error) {
    await prisma.workflowRun.update({ where: { id: run.id }, data: { status: "FAILED", completedAt: new Date(), error: error instanceof Error ? error.message : "Unknown generation failure" } });
    throw error;
  }
  revalidatePath("/");
  redirect("/studio/genesis-1?generated=1");
}

export async function approveScript(formData: FormData) {
  const scriptId = z.string().uuid().parse(formData.get("scriptId"));
  const script = await prisma.script.findUniqueOrThrow({ where: { id: scriptId }, include: { contentPackage: true } });
  await prisma.$transaction([
    prisma.script.update({ where: { id: scriptId }, data: { status: "APPROVED" } }),
    prisma.approvalEvent.create({ data: { scriptId, action: "APPROVED", note: "Approved for media production" } }),
    prisma.chapterProject.update({ where: { id: script.contentPackage.projectId }, data: { status: "MEDIA_PRODUCTION", currentStage: 4 } }),
  ]);
  revalidatePath("/");
  revalidatePath("/studio/genesis-1");
}
