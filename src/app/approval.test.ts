import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ findUniqueOrThrow: vi.fn(), findFirst: vi.fn(), transaction: vi.fn(), verify: vi.fn(), presenter: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ requireUser: async () => ({ user: { id: "user" } }) }));
vi.mock("@/lib/prisma", () => ({ prisma: { script: { findUniqueOrThrow: mocks.findUniqueOrThrow, findFirst: mocks.findFirst }, $transaction: mocks.transaction } }));
vi.mock("@/lib/content/scripture", () => ({ verifySceneScripture: mocks.verify }));
vi.mock("@/lib/avatar/production", () => ({ availablePresenterSnapshot: mocks.presenter }));
import { approveScript } from "./actions";
import { UserInputError } from "@/lib/action-error";
const id = "22a0c5ee-203c-4a44-a3d0-14dbe5791a65";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.findUniqueOrThrow.mockResolvedValue({ id, contentPackageId: "package", revision: 1, kind: "LONG_FORM", productionVersion: 2, body: "I understand this passage.", scriptureTranslation: "WEB", contentPackage: { projectId: "project" }, scenes: [{ id: "scene", narration: "I understand this passage." }] });
  mocks.findFirst.mockResolvedValue(null);
  mocks.verify.mockResolvedValue([{ scriptureExcerpt: "Stored Scripture", scriptureCue: "this passage" }]);
});
function form() { const data = new FormData(); data.set("scriptId", id); return data; }
describe("approval validation feedback", () => {
  it("returns the Scripture correction as form feedback without approving anything", async () => {
    mocks.verify.mockRejectedValueOnce(new UserInputError("Scene 1 (Genesis 1:1–2): choose an exact narration phrase."));
    await expect(approveScript(form())).resolves.toEqual({ error: expect.stringContaining("Genesis 1:1–2") });
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.presenter).not.toHaveBeenCalled();
    expect(mocks.findUniqueOrThrow).toHaveBeenCalledWith(expect.objectContaining({ include: expect.objectContaining({ scenes: { orderBy: { position: "asc" } } }) }));
  });
  it("allows editorial approval without a presenter and does not attach an unapproved profile", async () => {
    mocks.presenter.mockResolvedValueOnce(null);
    const update = vi.fn();
    mocks.transaction.mockImplementationOnce((run) => run({ scriptScene: { update: vi.fn() }, script: { update }, contentPackage: { update: vi.fn() }, approvalEvent: { create: vi.fn() }, chapterProject: { update: vi.fn() } }));
    await expect(approveScript(form())).resolves.toBeUndefined();
    expect(update).toHaveBeenCalledWith({ where: { id }, data: { status: "APPROVED" } });
  });
  it("persists the exact normalized cue when approval succeeds", async () => {
    mocks.presenter.mockResolvedValueOnce({ id: "presenter" });
    const sceneUpdate = vi.fn();
    const tx = { scriptScene: { update: sceneUpdate }, script: { update: vi.fn() }, contentPackage: { update: vi.fn() }, approvalEvent: { create: vi.fn() }, chapterProject: { update: vi.fn() } };
    mocks.transaction.mockImplementationOnce((run) => run(tx));
    await approveScript(form());
    expect(sceneUpdate).toHaveBeenCalledWith({ where: { id: "scene" }, data: { scriptureExcerpt: "Stored Scripture", scriptureCue: "this passage" } });
    expect(tx.script.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "APPROVED" }) }));
  });
  it("does not expose unexpected database failures as validation feedback", async () => {
    mocks.findUniqueOrThrow.mockRejectedValueOnce(new Error("private database details"));
    await expect(approveScript(form())).rejects.toThrow("private database details");
  });
});
