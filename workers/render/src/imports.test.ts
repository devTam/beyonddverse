import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";

// Do not mock server-only: this process must work outside Next.js/React Server Components.
describe("standalone render worker", () => {
  it("loads shared production code in an ordinary Node process", () => {
    const result = execFileSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", "await import('./src/lib/video/props.ts'); console.log('worker imports ready');"], { cwd: process.cwd(), env: { ...process.env, NODE_OPTIONS: "" }, encoding: "utf8", timeout: 15000 });
    expect(result).toContain("worker imports ready");
  });
});
