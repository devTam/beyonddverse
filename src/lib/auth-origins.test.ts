import { describe, expect, it } from "vitest";
import { authOrigins } from "./auth-origins";

describe("authOrigins", () => {
  it("trusts canonical and exact Vercel deployment origins", () => {
    expect(authOrigins({ NODE_ENV: "production", BETTER_AUTH_URL: "https://beyonddverse.vercel.app/", VERCEL_URL: "beyonddverse-build.vercel.app" })).toEqual(["https://beyonddverse.vercel.app", "https://beyonddverse-build.vercel.app"]);
  });

  it("adds loopback origins only outside production", () => {
    expect(authOrigins({ NODE_ENV: "development" })).toEqual(["http://localhost:3000", "http://127.0.0.1:3000"]);
    expect(authOrigins({ NODE_ENV: "production" })).toEqual([]);
  });
});
