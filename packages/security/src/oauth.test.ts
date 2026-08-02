import { describe, expect, it } from "vitest";
import { createPkcePair, maskSecret } from "./index.js";

describe("oauth helpers", () => {
  it("creates pkce pair", () => {
    const a = createPkcePair();
    expect(a.verifier.length).toBeGreaterThan(20);
    expect(a.challenge.length).toBeGreaterThan(20);
    expect(a.verifier).not.toBe(a.challenge);
  });

  it("masks secrets", () => {
    expect(maskSecret("abcdefghij")).toMatch(/^abc••••ij$/);
  });
});
