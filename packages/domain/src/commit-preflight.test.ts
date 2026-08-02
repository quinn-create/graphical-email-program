import { describe, expect, it } from "vitest";
import { buildCommitPreflight, type StagedCommitItem } from "./commit-preflight.js";

describe("commit preflight", () => {
  const base: StagedCommitItem = {
    id: "s1",
    sourceItemId: "i1",
    matterId: "m1",
    disposition: "APPROVED_PROPOSED",
    state: "STAGED",
    fingerprint: "fp1",
    subject: "Hello",
    body: "Body",
    attachments: [],
  };

  it("blocks empty selection", () => {
    const pf = buildCommitPreflight([], { receiptExists: () => false });
    expect(pf.canCommit).toBe(false);
    expect(pf.issues.some((i) => i.code === "EMPTY")).toBe(true);
  });

  it("warns on existing receipt", () => {
    const pf = buildCommitPreflight([base], {
      receiptExists: (fp, kind) => fp === "fp1" && kind === "communication",
    });
    expect(pf.canCommit).toBe(true);
    expect(pf.duplicateFingerprints).toContain("fp1");
    expect(pf.issues.some((i) => i.code === "DUPLICATE_RECEIPT")).toBe(true);
  });

  it("flags retryable failures", () => {
    const pf = buildCommitPreflight([{ ...base, state: "FAILED", lastError: "timeout" }], {
      receiptExists: () => false,
    });
    expect(pf.failedRetryable).toContain("s1");
    expect(pf.canCommit).toBe(true);
  });
});
