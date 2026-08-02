export type StagedCommitItem = {
  id: string;
  sourceItemId: string;
  matterId: string;
  disposition: string;
  state: string;
  fingerprint: string;
  subject: string;
  body: string;
  attachments: Array<{ filename: string; sha256: string; textContent: string }>;
  lastError?: string | null;
  duplicateWarning?: string | null;
};

export type PreflightIssue = {
  severity: "info" | "warn" | "block";
  code: string;
  message: string;
  stagedId?: string;
};

export type CommitPreflight = {
  stagedIds: string[];
  itemCount: number;
  attachmentCount: number;
  duplicateFingerprints: string[];
  alreadyComplete: string[];
  failedRetryable: string[];
  issues: PreflightIssue[];
  canCommit: boolean;
};

export function buildCommitPreflight(
  staged: StagedCommitItem[],
  opts: {
    receiptExists: (fingerprint: string, kind: "communication" | "document") => boolean;
    knownDuplicateFingerprints?: Set<string>;
  },
): CommitPreflight {
  const issues: PreflightIssue[] = [];
  const duplicateFingerprints: string[] = [];
  const alreadyComplete: string[] = [];
  const failedRetryable: string[] = [];
  let attachmentCount = 0;

  if (staged.length === 0) {
    issues.push({
      severity: "block",
      code: "EMPTY",
      message: "Nothing staged to commit",
    });
  }

  for (const item of staged) {
    attachmentCount += item.attachments?.length ?? 0;

    if (!item.matterId) {
      issues.push({
        severity: "block",
        code: "MISSING_MATTER",
        message: `“${item.subject}” has no matter id`,
        stagedId: item.id,
      });
    }

    if (item.state === "COMPLETE") {
      alreadyComplete.push(item.id);
      issues.push({
        severity: "info",
        code: "ALREADY_COMPLETE",
        message: `“${item.subject}” already committed — will skip`,
        stagedId: item.id,
      });
    }

    if (item.state === "FAILED" || item.state === "PARTIAL") {
      failedRetryable.push(item.id);
      issues.push({
        severity: "warn",
        code: "RETRY",
        message: `“${item.subject}” will retry from last failure${item.lastError ? `: ${item.lastError}` : ""}`,
        stagedId: item.id,
      });
    }

    const fp = item.fingerprint;
    if (opts.receiptExists(fp, "communication")) {
      duplicateFingerprints.push(fp);
      issues.push({
        severity: "warn",
        code: "DUPLICATE_RECEIPT",
        message: `Communication for “${item.subject}” already has a Clio receipt — idempotent skip`,
        stagedId: item.id,
      });
    } else if (opts.knownDuplicateFingerprints?.has(fp)) {
      duplicateFingerprints.push(fp);
      issues.push({
        severity: "warn",
        code: "DUPLICATE_FINGERPRINT",
        message: `Fingerprint for “${item.subject}” was seen before — review before commit`,
        stagedId: item.id,
      });
    }

    for (const att of item.attachments ?? []) {
      const docFp = `${fp}:${att.sha256}`;
      if (opts.receiptExists(docFp, "document")) {
        issues.push({
          severity: "info",
          code: "DOC_RECEIPT",
          message: `Document ${att.filename} already receipted`,
          stagedId: item.id,
        });
      }
    }
  }

  const canCommit = staged.length > 0 && !issues.some((i) => i.severity === "block");

  return {
    stagedIds: staged.map((s) => s.id),
    itemCount: staged.length,
    attachmentCount,
    duplicateFingerprints,
    alreadyComplete,
    failedRetryable,
    issues,
    canCommit,
  };
}
