import { describe, expect, it } from "vitest";
import { oneLineWhy, sortReviewQueue } from "./index.js";

describe("sortReviewQueue", () => {
  it("puts HIGH confidence unreviewed first", () => {
    const sorted = sortReviewQueue([
      { reviewStatus: "unreviewed", confidence: "LOW", date: "2026-01-01", id: "a" },
      { reviewStatus: "approved", confidence: "HIGH", date: "2026-01-02", id: "b" },
      { reviewStatus: "unreviewed", confidence: "HIGH", date: "2026-01-03", id: "c" },
      { reviewStatus: "unreviewed", confidence: "MEDIUM", date: "2026-01-04", id: "d" },
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["c", "d", "a", "b"]);
  });

  it("prefers Quest within same confidence", () => {
    const sorted = sortReviewQueue([
      { reviewStatus: "unreviewed", confidence: "HIGH", isQuest: false, id: "g" },
      { reviewStatus: "unreviewed", confidence: "HIGH", isQuest: true, id: "q" },
    ]);
    expect(sorted[0]?.id).toBe("q");
  });
});

describe("oneLineWhy", () => {
  it("summarizes evidence", () => {
    const line = oneLineWhy({
      caseRelatedness: "ALWAYS",
      topConfidence: "HIGH",
      candidates: [
        {
          clioMatterId: "1",
          rank: 1,
          confidence: "HIGH",
          score: 100,
          evidence: [
            {
              evidenceType: "DOCKET",
              evidenceValue: "JV-25-0088",
              weight: "highest",
              supporting: true,
              explanation: "Exact docket/case number JV-25-0088",
            },
          ],
        },
      ],
    });
    expect(line).toContain("JV-25-0088");
  });
});
