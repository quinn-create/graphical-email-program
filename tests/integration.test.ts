import { describe, expect, it } from "vitest";
import { extractEntitiesLocally, extractTextLocally, hashBuffer } from "@mattermail/extraction";
import { matchMatter, proposeSafeLearningRules } from "@mattermail/matching";
import { activateRule } from "@mattermail/learning";
import { createMockClioClient } from "@mattermail/clio";
import { createMockDriveClient } from "@mattermail/drive";
import { detectQuestEmail, validateQuestUrl } from "@mattermail/quest-email";
import { generateAuditReports } from "@mattermail/reporting";
import { createMockAdapter, defaultModelsFor } from "@mattermail/ai-core";
import { intendedWriteFingerprint } from "@mattermail/domain";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const matters = [
  {
    clioMatterId: "demo-matter-1001",
    displayNumber: "2026-CR-0142",
    clientName: "Jonathan Roberts",
    docketNumber: "26-GS-12345",
    caseNumber: "26-GS-12345",
    warrantNumber: "W-2026-8891",
    court: "General Sessions",
    county: "Davidson",
    status: "open",
  },
  {
    clioMatterId: "demo-matter-1002",
    displayNumber: "2026-CR-0201",
    clientName: "Jonathan Roberson",
    docketNumber: "26-GS-12999",
    caseNumber: "26-GS-12999",
    status: "open",
  },
];

describe("extraction", () => {
  it("hashes content", () => {
    expect(hashBuffer(Buffer.from("abc"))).toHaveLength(64);
  });

  it("extracts docket from text", () => {
    const e = extractEntitiesLocally("Docket 26-GS-12345 for Jonathan Roberts");
    expect(e.docketNumbers).toContain("26-GS-12345");
  });

  it("extracts plain text files", () => {
    const r = extractTextLocally(
      "note.txt",
      "Hello warrant world that is long enough to count as meaningful text content here.",
    );
    expect(r.method).toBe("local");
  });
});

describe("matching scenarios", () => {
  it("A: clerk many cases — docket wins, sender does not fix matter", () => {
    const result = matchMatter({
      text: "Warrant for Jonathan Roberts Docket 26-GS-12345 Davidson County",
      senderEmail: "clerk@courts.example.gov",
      matters,
      rules: [
        {
          ruleType: "SENDER_CLASSIFICATION",
          caseRelatedness: "ALWAYS",
          matterScope: "VARIABLE_MATTER",
          fixedMatterId: null,
          matchedValue: "clerk@courts.example.gov",
          active: true,
          userActivated: true,
        },
      ],
    });
    expect(result.isCaseRelated).toBe(true);
    expect(result.candidates[0]?.clioMatterId).toBe("demo-matter-1001");
    expect(result.matterScope).toBe("VARIABLE_MATTER");
  });

  it("C: advertising never case-related", () => {
    const result = matchMatter({
      text: "Weekend deals from RetailMart! Unsubscribe anytime.",
      senderEmail: "deals@retailmart.example.com",
      matters,
    });
    expect(result.caseRelatedness).toBe("NEVER");
    expect(result.candidates).toHaveLength(0);
  });

  it("proposes safe sender variable rule", () => {
    const rules = proposeSafeLearningRules({
      senderEmail: "clerk@courts.example.gov",
      threadId: "thread-1",
      docketNumbers: ["26-GS-12345"],
      matterId: "demo-matter-1001",
      disposition: "approve",
    });
    const sender = rules.find((r) => r.ruleType === "SENDER_CLASSIFICATION");
    expect(sender?.matterScope).toBe("VARIABLE_MATTER");
    expect(sender?.fixedMatterId).toBeNull();
  });
});

describe("learning safety", () => {
  it("rejects unsafe AI sender→fixed matter", () => {
    expect(() =>
      activateRule({
        ruleType: "SENDER_CLASSIFICATION",
        caseRelatedness: "ALWAYS",
        matterScope: "FIXED_MATTER",
        fixedMatterId: "demo-matter-1001",
        matchedValue: "clerk@courts.example.gov",
        reason: "bad",
        proposedByAi: true,
        userConfirmed: true,
      }),
    ).toThrow(/Unsafe/);
  });
});

describe("clio idempotency", () => {
  it("does not recreate communication on retry", async () => {
    const client = createMockClioClient(
      matters.map((m) => ({
        id: m.clioMatterId,
        displayNumber: m.displayNumber!,
        description: "",
        status: "open",
        clientName: m.clientName!,
      })),
    );
    const fp = intendedWriteFingerprint({
      sourceType: "gmail",
      sourceId: "msg-1",
      targetMatterId: "demo-matter-1001",
      direction: "received",
      timestampIso: "2026-08-02T00:00:00.000Z",
      attachmentHashes: ["abc"],
    });
    const a = await client.createCommunication({
      subject: "t",
      body: "b",
      matterId: "demo-matter-1001",
      direction: "email",
      date: "2026-08-02",
      fingerprint: fp,
    });
    const b = await client.createCommunication({
      subject: "t",
      body: "b",
      matterId: "demo-matter-1001",
      direction: "email",
      date: "2026-08-02",
      fingerprint: fp,
    });
    expect(a.clioId).toBe(b.clioId);
  });

  it("rejects DELETE", async () => {
    const client = createMockClioClient([]);
    await expect(client.delete("/api/v4/matters/1")).rejects.toThrow();
  });
});

describe("drive", () => {
  it("uploads immutable audit file and has no delete", async () => {
    const drive = createMockDriveClient();
    expect(drive.delete).toBeUndefined();
    const f = await drive.uploadAuditFile({
      runId: "COMMIT-CLIO-2026-08-02-001",
      filename: "COMMIT-CLIO-2026-08-02-001_Manifest.json",
      content: "{}",
    });
    expect(f.id).toBeTruthy();
    // Idempotent retry returns the existing file — never overwrites content
    const again = await drive.uploadAuditFile({
      runId: "COMMIT-CLIO-2026-08-02-001",
      filename: "COMMIT-CLIO-2026-08-02-001_Manifest.json",
      content: "{changed}",
    });
    expect(again.id).toBe(f.id);
    expect(again.alreadyExisted).toBe(true);
    expect(again.checksum).toBe(f.checksum);
  });
});

describe("quest", () => {
  it("detects quest email", () => {
    const d = detectQuestEmail({
      fromEmail: "noreply@quest.example.gov",
      subject: "Quest notification",
      body: "Open https://quest.example.gov/cases/JV-25-0088",
    });
    expect(d.isQuest).toBe(true);
  });

  it("requires https", () => {
    expect(validateQuestUrl("http://quest.example.gov/x").ok).toBe(false);
  });
});

describe("ai mock", () => {
  it("records requested and actual model", async () => {
    const adapter = createMockAdapter("OPENROUTER", defaultModelsFor("OPENROUTER"));
    const out = await adapter.analyzeText({
      sourceItemId: "s1",
      text: "Jonathan Roberts docket 26-GS-12345",
      candidateMatterSummaries: matters.map((m) => ({
        clioMatterId: m.clioMatterId,
        displayNumber: m.displayNumber,
        clientName: m.clientName,
      })),
      requestedModelId: "openrouter/auto",
      providerProfileId: "p1",
      providerType: "OPENROUTER",
      task: "MATCHING",
    });
    expect(out.requestedModelId).toBe("openrouter/auto");
    expect(out.actualModelId).toBe("openrouter/auto");
    expect(out.result.analysis.requested_model_id).toBe("openrouter/auto");
  });

  it("blocks OCR-unsuitable model via capability flags", async () => {
    const adapter = createMockAdapter("OLLAMA", defaultModelsFor("OLLAMA"));
    const caps = await adapter.testModelCapabilities("llama3.2");
    expect(caps.ocr).toBe(false);
  });
});

describe("reporting", () => {
  it("writes pdf xlsx json even for zero items", () => {
    const dir = mkdtempSync(join(tmpdir(), "mm-audit-"));
    const art = generateAuditReports(dir, {
      runId: "SCAN-GMAIL-2026-08-02-001",
      kind: "scan",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      items: [],
    });
    expect(art.jsonPath).toContain("Manifest.json");
    expect(art.pdfPath).toContain("Audit.pdf");
    expect(art.xlsxPath).toContain("Audit.xlsx");
  });
});
