import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/actions", () => ({
  generatePresenter: vi.fn(), selectSceneVisual: vi.fn(), reviewPresenterVideo: vi.fn(), regenerateScenePresenter: vi.fn(),
  approveScript: vi.fn(), generateContentThumbnail: vi.fn(), generateNarration: vi.fn(),
  generateVisuals: vi.fn(), regenerateSceneNarration: vi.fn(), regenerateSceneVisual: vi.fn(),
  regenerateSection: vi.fn(), rejectScript: vi.fn(), renderLongVideo: vi.fn(),
  reopenScript: vi.fn(), saveScriptRevision: vi.fn(), updateSceneVisualApproval: vi.fn(),
}));
vi.mock("@/components/status-pill", () => ({ StatusPill: () => null }));

import { SubmitButton } from "./action-form";
import { ScriptReview } from "./script-review";
import { regenerateSceneNarration, regenerateSceneVisual, updateSceneVisualApproval } from "@/app/actions";

function buttons(node: ReactNode): Array<Record<string, unknown>> {
  if (Array.isArray(node)) return node.flatMap(buttons);
  if (!isValidElement<{ children?: ReactNode }>(node)) return [];
  return [
    ...(node.type === SubmitButton ? [node.props as Record<string, unknown>] : []),
    ...buttons(node.props.children),
  ];
}

describe("scene review actions", () => {
  it("passes scene decisions without relying on button names overwritten by React", async () => {
    const sceneId = "d6e1682c-d791-4c31-9907-6b4d107ba812";
    const tree = ScriptReview({
      script: {
        id: "script", title: "Title", hook: "Hook", body: "Body", status: "APPROVED", revision: 1,
        scenes: [{ id: sceneId, position: 1, narration: "Narration", visualPrompt: "Visual", scriptureRef: null, durationMs: 5000, narrationUrl: "/audio", visual: { id: "asset", url: "/visual", status: "PENDING" } }],
      },
      revisions: [{ id: "script", revision: 1, status: "APPROVED", createdAt: new Date() }],
      validation: { valid: true }, narrationReady: true, visualsReady: false,
    });
    const actions = buttons(tree).filter((button) => typeof button.formAction === "function");
    expect(actions).toHaveLength(4);
    for (const button of actions) {
      expect(button.name).toBeUndefined();
      await (button.formAction as (data: FormData) => Promise<void>)(new FormData());
    }
    expect(updateSceneVisualApproval).toHaveBeenCalledWith(sceneId, "APPROVED", expect.any(FormData));
    expect(updateSceneVisualApproval).toHaveBeenCalledWith(sceneId, "REJECTED", expect.any(FormData));
    expect(regenerateSceneNarration).toHaveBeenCalledWith(sceneId, expect.any(FormData));
    expect(regenerateSceneVisual).toHaveBeenCalledWith(sceneId, expect.any(FormData));
  });
  it("reviews presenter media and derives the complete transcript from scenes", () => {
    const tree = ScriptReview({
      script: { id: "script", title: "An original lesson", hook: "Editorial metadata", body: "Every teaching paragraph is narrated.", status: "APPROVED", revision: 1, productionVersion: 2,
        scenes: [{ id: "scene", position: 1, narration: "Every teaching paragraph is narrated.", visualPrompt: "A calm host", scriptureRef: null, durationMs: 12000, presentation: "presenter", narrationUrl: "/audio", visual: null, presenterVideo: { id: "video", url: "/presenter", status: "PENDING" } }] },
      revisions: [{ id: "script", revision: 1, status: "APPROVED", createdAt: new Date() }], validation: { valid: true }, narrationReady: true, visualsReady: true,
    });
    const html = renderToStaticMarkup(tree);
    expect(html).toContain("Approve presenter clip");
    expect(html).toContain("Generate / resume presenter");
    expect(html).toContain('src="/presenter"');
    expect(html).toContain("derived from scenes");
    expect(html).toContain('name="transcript"');
    expect(html).toContain("Save edited narration");
    expect(html).toContain("Genesis 1:1–5");
    expect(html).not.toContain('name="body"');
    expect(html).not.toContain("Render video →");
  });

});
