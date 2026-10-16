import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { HeyGenAvatarProvider } from "./heygen";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
describe("HeyGen Avatar IV adapter", () => {
  it("submits the existing audio with an immutable avatar and idempotency key", async () => {
    vi.stubEnv("HEYGEN_API_KEY", "test-key");
    const request = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: { video_id: "saved-job" } })));
    vi.stubGlobal("fetch", request);
    const id = await new HeyGenAvatarProvider().submit({ avatarId: "same-presenter", audioUrl: "https://media.example/narration.mp3", aspectRatio: "16:9", motionPrompt: "Calm delivery", key: "scene-hash" });
    expect(id).toBe("saved-job");
    const [url, options] = request.mock.calls[0];
    expect(url).toBe("https://api.heygen.com/v3/videos");
    expect(options.headers["Idempotency-Key"]).toBe("scene-hash");
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ avatar_id: "same-presenter", audio_url: "https://media.example/narration.mp3", engine: { type: "avatar_iv" }, resolution: "1080p" });
    expect(body.script).toBeUndefined();
    expect(body.voice_id).toBeUndefined();
  });
  it("rejects missing credentials before submitting", async () => {
    vi.stubEnv("HEYGEN_API_KEY", "");
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    await expect(new HeyGenAvatarProvider().status("job")).rejects.toThrow("HEYGEN_API_KEY");
    expect(request).not.toHaveBeenCalled();
  });
  it("exposes failure status and rejects malformed provider results", async () => {
    vi.stubEnv("HEYGEN_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ data: { status: "failed", failure_message: "No credits" } }))).mockResolvedValueOnce(new Response(JSON.stringify({ data: {} }))));
    expect(await new HeyGenAvatarProvider().status("job")).toMatchObject({ status: "failed", error: "No credits" });
    await expect(new HeyGenAvatarProvider().status("job")).rejects.toThrow();
  });
});
