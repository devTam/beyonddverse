import { afterEach, describe, expect, it, vi } from "vitest";
import { XOAuth, XPublisher } from "./x";

const originalClientId = process.env.X_CLIENT_ID;
const originalClientSecret = process.env.X_CLIENT_SECRET;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalClientId === undefined) delete process.env.X_CLIENT_ID;
  else process.env.X_CLIENT_ID = originalClientId;
  if (originalClientSecret === undefined) delete process.env.X_CLIENT_SECRET;
  else process.env.X_CLIENT_SECRET = originalClientSecret;
});

describe("X OAuth", () => {
  it("uses PKCE and least-privilege publishing scopes", () => {
    process.env.X_CLIENT_ID = "client-id";
    const url = new XOAuth().authorizationUrl("state", "https://example.com/api/oauth/x/callback", "challenge");
    expect(url.origin + url.pathname).toBe("https://x.com/i/oauth2/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("tweet.write");
    expect(url.searchParams.get("scope")).toContain("media.write");
    expect(url.searchParams.get("scope")).toContain("offline.access");
  });

  it("rejects an authorization request without PKCE", () => {
    process.env.X_CLIENT_ID = "client-id";
    expect(() => new XOAuth().authorizationUrl("state", "https://example.com/callback")).toThrow("requires PKCE");
  });
});

describe("X publishing validation", () => {
  it("accepts a valid thread", () => {
    expect(() => new XPublisher().validate({ url: "https://example.com/video.mp4", bytes: 10, mimeType: "video/mp4", title: "Title", description: "Fallback", posts: ["First post", "Second post"] })).not.toThrow();
  });

  it("rejects posts over 280 characters", () => {
    expect(() => new XPublisher().validate({ url: "https://example.com/video.mp4", bytes: 10, mimeType: "video/mp4", title: "Title", description: "Fallback", posts: ["x".repeat(281)] })).toThrow("1–280");
  });

  it("publishes an AI-disclosed reply thread in order", async () => {
    const requests: Array<Record<string, unknown>> = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push(payload);
      return new Response(JSON.stringify({ data: { id: String(requests.length), text: payload.text } }), { status: 200 });
    }));
    const result = await new XPublisher().publish({ url: "https://example.com/unused", bytes: 0, mimeType: "video/mp4", title: "Title", description: "Fallback", posts: ["First", "Second"] }, "token");
    expect(result.externalId).toBe("1");
    expect(requests[0]).toMatchObject({ text: "First", made_with_ai: true });
    expect(requests[1]).toMatchObject({ text: "Second", made_with_ai: true, reply: { in_reply_to_tweet_id: "1" } });
  });
});
