import { test, expect } from "@playwright/test";

/**
 * E2E placeholder — full Electron Playwright harness attaches to the packaged app.
 * Core flows are covered by unit/integration tests and Demo mode manual verification.
 */
test.describe("MatterMail Review documentation smoke", () => {
  test("product name is configured", async () => {
    const { PRODUCT } = await import("@mattermail/shared");
    expect(PRODUCT.name).toBe("MatterMail Review");
  });
});
