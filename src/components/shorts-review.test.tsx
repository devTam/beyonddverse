import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/app/actions", () => ({
  generatePresenter: vi.fn(), reviewPresenterVideo: vi.fn(),
  approveScript: vi.fn(), generateNarration: vi.fn(), generateVisuals: vi.fn(),
  renderShortVideo: vi.fn(), updateSceneVisualApproval: vi.fn(),
  regenerateSceneVisual: vi.fn(), regenerateSceneNarration: vi.fn(),
}));

import { ShortsReview } from "./shorts-review";

const script = {
  id: "short-1", kind: "SHORT_1", title: "A short teaching", hook: "A hook", body: "Teaching body", status: "APPROVED",
  scenes: [{ id: "scene-1", position: 1, narration: "Spoken words", visualPrompt: "A visual", narrationUrl: "/api/assets/audio", visual: { id: "visual", url: "/api/assets/visual", status: "PENDING" } }],
};

describe("short content review", () => {
  it("shows generated media and review controls before visuals are approved", () => {
    const html = renderToStaticMarkup(<ShortsReview scripts={[script]} citationsValid/>);
    expect(html).toContain('id="script-short-1"');
    expect(html).toContain('<audio id="audio-scene-1" controls="" preload="metadata" src="/api/assets/audio"');
    expect(html).toContain('src="/api/assets/visual"');
    expect(html).toContain("Approve visual");
    expect(html).toContain("Reject visual");
    expect(html).not.toContain("Create visuals");
    expect(html).not.toContain("Render 9:16 video");
  });

  it("unlocks rendering only after narration and visual approval", () => {
    const approved = { ...script, scenes: script.scenes.map((scene) => ({ ...scene, visual: { ...scene.visual, status: "APPROVED" } })) };
    const html = renderToStaticMarkup(<ShortsReview scripts={[approved]} citationsValid/>);
    expect(html).toContain("Render 9:16 video");
    expect(html).not.toContain("Approve visual");
    const missingAudio = { ...approved, scenes: approved.scenes.map((scene) => ({ ...scene, narrationUrl: null })) };
    expect(renderToStaticMarkup(<ShortsReview scripts={[missingAudio]} citationsValid/>)).not.toContain("Render 9:16 video");
  });
  it("uses reviewed presenter clips for vertical productions", () => {
    const presenter = { ...script, productionVersion: 2, scenes: script.scenes.map((scene) => ({ ...scene, presentation: "presenter", visual: null, presenterVideo: { id: "host", url: "/presenter", status: "PENDING" } })) };
    const html = renderToStaticMarkup(<ShortsReview scripts={[presenter]} citationsValid/>);
    expect(html).toContain("Generate / resume presenter");
    expect(html).toContain("Approve presenter clip");
    expect(html).not.toContain("Create visuals");
    expect(html).not.toContain("Render 9:16 video");
  });

});
