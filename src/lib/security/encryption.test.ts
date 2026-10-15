import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "./encryption";

describe("credential encryption", () => {
  const previous = process.env.CREDENTIAL_ENCRYPTION_KEY;
  afterEach(() => { process.env.CREDENTIAL_ENCRYPTION_KEY = previous; });

  it("round trips without exposing plaintext", () => {
    process.env.CREDENTIAL_ENCRYPTION_KEY = "test-only-key-that-is-longer-than-thirty-two-characters";
    const encrypted = encryptSecret("refresh-token-value");
    expect(encrypted).not.toContain("refresh-token-value");
    expect(decryptSecret(encrypted)).toBe("refresh-token-value");
  });
});
