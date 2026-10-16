import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getProductionSettings } from "@/lib/settings";

export async function assertWithinBudget(projectId: string, estimatedUsd = 0) {
  const { monthlyBudgetUsd: monthlyBudget, generationLimit } = await getProductionSettings();
  const start = new Date();
  start.setUTCDate(1); start.setUTCHours(0, 0, 0, 0);
  const spent = await prisma.generationCost.aggregate({ where: { createdAt: { gte: start } }, _sum: { amountMicros: true } });
  if ((spent._sum.amountMicros ?? 0n) + BigInt(Math.round(estimatedUsd * 1_000_000)) >= BigInt(Math.round(monthlyBudget * 1_000_000))) throw new Error("The monthly generation budget has been reached.");
  const operations = await prisma.generationCost.count({ where: { createdAt: { gte: start } } });
  if (operations >= generationLimit) throw new Error("The monthly generation operation limit has been reached.");
  const project = await prisma.chapterProject.findUnique({ where: { id: projectId }, select: { id: true } });
  if (!project) throw new Error("The generation project does not exist.");
}

export async function recordGenerationCost(input: { projectId: string; provider: string; operation: string; amountMicros: number; units: Prisma.InputJsonValue; model?: string; estimated?: boolean }) {
  if (!Number.isFinite(input.amountMicros) || input.amountMicros < 0) throw new Error("Provider pricing produced an invalid cost.");
  return prisma.generationCost.create({ data: { projectId: input.projectId, provider: input.provider, operation: input.operation, amountMicros: BigInt(Math.round(input.amountMicros)), units: input.units, model: input.model, estimated: input.estimated ?? false } });
}

export function tokenCostMicros(inputTokens: number, outputTokens: number) {
  const inputRate = configuredRate("AI_INPUT_COST_PER_MILLION_TOKENS");
  const outputRate = configuredRate("AI_OUTPUT_COST_PER_MILLION_TOKENS");
  return Math.round(inputTokens * inputRate + outputTokens * outputRate);
}

export function configuredRate(name: string) {
  const rate = Number(process.env[name]);
  if (!Number.isFinite(rate) || rate < 0) throw new Error(`${name} must be configured with the current provider price.`);
  return rate;
}
