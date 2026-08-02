import { describe, expect, it } from "vitest";
import {
  assertClioRequestAllowed,
  assertDriveActionAllowed,
  assertExactModelRecorded,
  assertGmailReadonlyScopes,
  assertNoSilentFallback,
  assertQuestOperationAllowed,
  SecurityViolationError,
} from "./index.js";
import { GMAIL_READONLY_SCOPE } from "@mattermail/shared";

describe("Gmail scope guard", () => {
  it("allows readonly only", () => {
    expect(() => assertGmailReadonlyScopes([GMAIL_READONLY_SCOPE])).not.toThrow();
  });

  it("rejects modify scope", () => {
    expect(() =>
      assertGmailReadonlyScopes([
        GMAIL_READONLY_SCOPE,
        "https://www.googleapis.com/auth/gmail.modify",
      ]),
    ).toThrow(SecurityViolationError);
  });
});

describe("Clio allowlist", () => {
  it("allows GET matters", () => {
    expect(() =>
      assertClioRequestAllowed({ method: "GET", path: "/api/v4/matters" }),
    ).not.toThrow();
  });

  it("allows POST communications", () => {
    expect(() =>
      assertClioRequestAllowed({
        method: "POST",
        path: "/api/v4/communications",
      }),
    ).not.toThrow();
  });

  it("rejects DELETE", () => {
    expect(() =>
      assertClioRequestAllowed({ method: "DELETE", path: "/api/v4/matters/1" }),
    ).toThrow(/DELETE/);
  });

  it("rejects PATCH", () => {
    expect(() =>
      assertClioRequestAllowed({
        method: "PATCH",
        path: "/api/v4/communications/1",
      }),
    ).toThrow(/PATCH/);
  });
});

describe("Drive / Quest / AI guards", () => {
  it("rejects drive delete", () => {
    expect(() => assertDriveActionAllowed("files.delete")).toThrow();
  });

  it("rejects quest login", () => {
    expect(() => assertQuestOperationAllowed("login")).toThrow();
  });

  it("rejects silent fallback", () => {
    expect(() =>
      assertNoSilentFallback({
        fallbackEnabled: false,
        usedFallback: true,
        fallbackConfigured: false,
      }),
    ).toThrow();
  });

  it("requires requested model id", () => {
    expect(() => assertExactModelRecorded({ requestedModelId: "" })).toThrow();
  });
});
