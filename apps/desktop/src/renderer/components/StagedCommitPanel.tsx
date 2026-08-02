import { useEffect, useState } from "react";

type Preflight = {
  stagedIds: string[];
  itemCount: number;
  attachmentCount: number;
  duplicateFingerprints: string[];
  alreadyComplete: string[];
  failedRetryable: string[];
  issues: Array<{ severity: string; code: string; message: string; stagedId?: string }>;
  canCommit: boolean;
};

type StagedItem = Record<string, unknown>;

type Props = {
  staged: StagedItem[];
  onRefresh: () => Promise<void>;
  onStatus: (msg: string) => void;
};

export function StagedCommitPanel({ staged, onRefresh, onStatus }: Props) {
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);

  const pending = staged.filter((s) => String(s.state) !== "COMPLETE");

  useEffect(() => {
    void window.mattermail.commitPreflight(pending.map((s) => String(s.id))).then((p) => {
      setPreflight(p as Preflight);
    });
  }, [staged]);

  async function runCommit() {
    setCommitting(true);
    try {
      const ids = pending.map((s) => String(s.id));
      const result = (await window.mattermail.commit(ids)) as Record<string, unknown>;
      setLastResult(result);
      setShowConfirm(false);
      const status = String(result.status ?? "");
      const failures = (result.partialFailures as Array<{ stagedId: string; error: string }>) ?? [];
      if (status === "PARTIAL" || failures.length) {
        onStatus(
          `Commit ${status}: ${failures.length} item(s) need retry. Successful writes were kept.`,
        );
      } else if (result.ok === false) {
        onStatus(String(result.error ?? "Commit failed"));
      } else {
        onStatus(`Commit ${String(result.runId)} complete`);
      }
      await onRefresh();
    } finally {
      setCommitting(false);
    }
  }

  return (
    <div className="page">
      <h2>Staged commits</h2>
      <p className="muted">Nothing is written to Clio until you confirm. Failed items stay for retry.</p>

      {pending.length === 0 && <p>No staged items.</p>}

      {pending.map((s) => (
        <div key={String(s.id)} className={`status-card staged-item state-${String(s.state)}`}>
          <div className="staged-item-head">
            <strong>{String(s.subject)}</strong>
            <span className={`tag ${String(s.state) === "FAILED" ? "low" : "medium"}`}>
              {String(s.state)}
            </span>
          </div>
          <p>Matter: {String(s.matterId)}</p>
          {s.duplicateWarning ? (
            <p className="warn-line">Duplicate warning: {String(s.duplicateWarning)}</p>
          ) : null}
          {s.lastError ? <p className="warn-line">Last error: {String(s.lastError)}</p> : null}
          <p className="muted">Fingerprint: {String(s.fingerprint)}</p>
        </div>
      ))}

      {preflight && pending.length > 0 && (
        <section className="status-card preflight-card">
          <h3>Preflight</h3>
          <p>
            {preflight.itemCount} item(s) · {preflight.attachmentCount} attachment(s)
            {preflight.duplicateFingerprints.length
              ? ` · ${preflight.duplicateFingerprints.length} duplicate fingerprint(s)`
              : ""}
            {preflight.failedRetryable.length
              ? ` · ${preflight.failedRetryable.length} retrying`
              : ""}
          </p>
          {preflight.issues.length === 0 ? (
            <p className="muted">No issues detected.</p>
          ) : (
            <ul className="preflight-issues">
              {preflight.issues.map((issue, idx) => (
                <li key={`${issue.code}-${idx}`} className={`sev-${issue.severity}`}>
                  <strong>{issue.severity}</strong> — {issue.message}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {!showConfirm ? (
        <button
          className="btn btn-primary"
          disabled={pending.length === 0 || !preflight?.canCommit || committing}
          onClick={() => setShowConfirm(true)}
        >
          Review &amp; commit…
        </button>
      ) : (
        <div className="status-card confirm-commit">
          <h3>Confirm Clio write</h3>
          <p>
            This will create communications/documents in Clio for {pending.length} staged item(s).
            Idempotent fingerprints skip duplicates. Partial failures stay staged for retry.
          </p>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" disabled={committing} onClick={() => setShowConfirm(false)}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              disabled={committing || !preflight?.canCommit}
              onClick={() => void runCommit()}
            >
              {committing ? "Committing…" : "Confirm commit"}
            </button>
          </div>
        </div>
      )}

      {lastResult && (
        <pre className="muted" style={{ marginTop: 16, whiteSpace: "pre-wrap" }}>
          {JSON.stringify(
            {
              runId: lastResult.runId,
              status: lastResult.status,
              partialFailures: lastResult.partialFailures,
            },
            null,
            2,
          )}
        </pre>
      )}
    </div>
  );
}
