type Props = {
  unreviewedCount: number;
  stagedCount: number;
  matterUnknownCount: number;
  questWaitingCount: number;
  matterCount: number;
  checkpoints: Record<string, unknown>;
  aiConfig: Record<string, unknown>;
  onBeginReview: () => void;
  onOpenStaged: () => void;
  onOpenSettings: () => void;
  onScan: (window: string) => void;
  onRefreshClio: () => void;
};

function fmt(value: unknown): string {
  if (!value) return "—";
  const s = String(value);
  // Prefer short local-looking stamp when ISO
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    try {
      return new Date(s).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return s;
    }
  }
  return s;
}

export function HomePage({
  unreviewedCount,
  stagedCount,
  matterUnknownCount,
  questWaitingCount,
  matterCount,
  checkpoints,
  aiConfig,
  onBeginReview,
  onOpenStaged,
  onOpenSettings,
  onScan,
  onRefreshClio,
}: Props) {
  const waitingLabel =
    unreviewedCount === 1 ? "1 email waiting" : `${unreviewedCount} emails waiting`;

  return (
    <div className="page home-page">
      <section className="home-hero">
        <p className="home-hero-eyebrow">Ready to review</p>
        <h1 className="home-hero-brand">
          Matter<span>Mail</span> Review
        </h1>
        <p className="home-hero-lead">{waitingLabel}</p>
        {matterUnknownCount > 0 && (
          <p className="home-hero-sub muted">
            {matterUnknownCount} marked case-related — matter unknown
          </p>
        )}
        <div className="home-hero-actions">
          <button type="button" className="btn btn-primary home-hero-cta" onClick={onBeginReview}>
            Begin Rapid Review
          </button>
          {stagedCount > 0 ? (
            <button type="button" className="btn" onClick={onOpenStaged}>
              Review &amp; Commit ({stagedCount})
            </button>
          ) : (
            <button type="button" className="btn" disabled title="Nothing staged yet">
              Review &amp; Commit
            </button>
          )}
        </div>
      </section>

      <section className="home-strip" aria-label="Status">
        <div className="home-strip-cell">
          <h2>Gmail</h2>
          <p className="home-strip-value">{fmt(checkpoints.lastGmailDownload)}</p>
          <p className="muted">Last successful scan</p>
          <div className="home-strip-actions">
            {["24h", "72h", "7d", "custom", "since-last"].map((w) => (
              <button key={w} type="button" className="btn btn-compact" onClick={() => onScan(w)}>
                {w}
              </button>
            ))}
          </div>
        </div>

        <div className="home-strip-cell">
          <h2>Clio</h2>
          <p className="home-strip-value">{matterCount} matters</p>
          <p className="muted">Indexed {fmt(checkpoints.lastClioIndexRefresh)}</p>
          <div className="home-strip-actions">
            <button type="button" className="btn btn-compact" onClick={onRefreshClio}>
              Refresh
            </button>
          </div>
        </div>

        <div className="home-strip-cell">
          <h2>AI</h2>
          <p className="home-strip-value">{String(aiConfig.providerType ?? "MOCK")}</p>
          <p className="muted home-strip-model">{String(aiConfig.matchingModelId ?? "—")}</p>
          <div className="home-strip-actions">
            <button type="button" className="btn btn-compact" onClick={onOpenSettings}>
              Settings
            </button>
          </div>
        </div>

        <div className="home-strip-cell">
          <h2>Staged</h2>
          <p className="home-strip-value">{stagedCount}</p>
          <p className="muted">Approved, not committed</p>
          <div className="home-strip-actions">
            <button
              type="button"
              className="btn btn-compact"
              onClick={onOpenStaged}
              disabled={stagedCount === 0}
            >
              Open
            </button>
          </div>
        </div>
      </section>

      <footer className="home-footnotes muted">
        <span>
          Quest: {questWaitingCount} waiting · last scan{" "}
          {fmt(checkpoints.lastQuestEmailScan)}
        </span>
        <span className="home-footnotes-sep" aria-hidden>
          ·
        </span>
        <span>
          Audit: last Drive upload {fmt(checkpoints.lastDriveAuditUpload)} · last Clio commit{" "}
          {fmt(checkpoints.lastClioCommit)}
        </span>
      </footer>
    </div>
  );
}
