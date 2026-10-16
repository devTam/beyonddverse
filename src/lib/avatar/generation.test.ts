import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({
  find: vi.fn(), update: vi.fn(), claim: vi.fn(), cost: vi.fn(), asset: vi.fn(), upload: vi.fn(), budget: vi.fn(),
}));
vi.mock("../prisma", () => {
  const tx = { avatarGeneration: { findUniqueOrThrow: mocks.find, update: mocks.update, updateMany: mocks.claim }, generationCost: { create: mocks.cost }, asset: { findUniqueOrThrow: mocks.asset } };
  return { prisma: { ...tx, $transaction: (callback: (value: typeof tx) => unknown) => callback(tx) } };
});
vi.mock("../storage/cloudinary", () => ({ createSignedDeliveryUrl: () => "https://media.example/narration.mp3", uploadAndCreateAsset: mocks.upload }));
vi.mock("../costs", () => ({ assertWithinBudget: mocks.budget }));
import { completeAvatarJob } from "./generation";

const provider = { submit: vi.fn(), status: vi.fn(), registerPortrait: vi.fn(), lookStatus: vi.fn() };
let job: { id: string; inputHash: string; projectId: string; audioAssetId: string; assetId: string | null; externalJobId: string | null; status: string; error: string | null; submissionStartedAt: Date | null; durationMs: number; ratePerMinute: number };
const options = { avatarId: "presenter", aspectRatio: "16:9" as const, motionPrompt: "Calm", pause: vi.fn(), provider };
beforeEach(() => {
  vi.clearAllMocks();
  job = { id: "job", inputHash: "stable-hash", projectId: "project", audioAssetId: "audio", assetId: null, externalJobId: null, status: "QUEUED", error: null, submissionStartedAt: null, durationMs: 10000, ratePerMinute: 2.31 };
  mocks.find.mockImplementation(async () => ({ ...job }));
  mocks.update.mockImplementation(async ({ data }) => { job = { ...job, ...data }; return { ...job }; });
  mocks.claim.mockResolvedValue({ count: 1 }); mocks.asset.mockResolvedValue({ id: "audio" }); mocks.upload.mockResolvedValue({ id: "video" });
  provider.submit.mockResolvedValue("external-1"); provider.status.mockResolvedValue({ status: "completed", videoUrl: "https://media.heygen.ai/video.mp4", duration: 10 });
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]))));
});
afterEach(() => vi.unstubAllGlobals());
describe("durable presenter generation", () => {
  it("saves the provider ID and charges once before retrieving the finished media", async () => {
    const result = await completeAvatarJob("job", options);
    expect(provider.submit).toHaveBeenCalledWith(expect.objectContaining({ key: "stable-hash", audioUrl: "https://media.example/narration.mp3" }));
    expect(result.status).toBe("SUCCEEDED"); expect(result.assetId).toBe("video");
    expect(job.externalJobId).toBe("external-1"); expect(mocks.cost).toHaveBeenCalledTimes(1);
  });
  it("resumes a saved external job without another paid submission", async () => {
    job.externalJobId = "external-1"; job.status = "WAITING";
    mocks.claim.mockResolvedValue({ count: 0 });
    await completeAvatarJob("job", options);
    expect(provider.submit).not.toHaveBeenCalled(); expect(provider.status).toHaveBeenCalledWith("external-1"); expect(mocks.cost).not.toHaveBeenCalled();
  });
  it("reuses the provider ID after a failed download", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValueOnce(new Error("Network interrupted")).mockResolvedValueOnce(new Response(new Uint8Array([1]))));
    await expect(completeAvatarJob("job", options)).rejects.toThrow("Network interrupted");
    expect(job.externalJobId).toBe("external-1");
    await completeAvatarJob("job", options);
    expect(provider.submit).toHaveBeenCalledTimes(1);
  });
  it("does not mark failed or mismatched videos successful", async () => {
    provider.status.mockResolvedValue({ status: "failed", error: "Provider rejected" });
    await expect(completeAvatarJob("job", options)).rejects.toThrow("Provider rejected");
    expect(job.status).toBe("FAILED"); expect(mocks.upload).not.toHaveBeenCalled();
  });
  it("requires reconciliation when an uncertain submission outlives provider idempotency", async () => {
    job.submissionStartedAt = new Date(Date.now() - 25 * 3600000);
    await expect(completeAvatarJob("job", options)).rejects.toThrow("reconciliation");
    expect(provider.submit).not.toHaveBeenCalled();
  });
});
