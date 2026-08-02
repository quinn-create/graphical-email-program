type MatterLike = {
  clientName: string;
  displayNumber: string;
  court: string;
  county: string;
  status: string;
} | null;

type Props = {
  matter: MatterLike;
  confidence: string;
  evidence: string[];
  isAlternate: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  searchHits: Array<Record<string, unknown>>;
  onPickSearchHit: (matterLocalId: string) => void;
  remember: boolean;
  onRememberChange: (value: boolean) => void;
};

const EVIDENCE_LIMIT = 4;

export function MatterProposal({
  matter,
  confidence,
  evidence,
  isAlternate,
  search,
  onSearchChange,
  searchHits,
  onPickSearchHit,
  remember,
  onRememberChange,
}: Props) {
  const shown = evidence.slice(0, EVIDENCE_LIMIT);
  const overflow = Math.max(0, evidence.length - shown.length);
  const conf = confidence.toLowerCase();

  return (
    <div className="matter-panel">
      {matter ? (
        <div className={`proposal-lead ${isAlternate ? "alternate" : ""}`}>
          <p className="proposal-eyebrow">
            {isAlternate ? "Selected matter" : "Proposed matter"}
          </p>
          <div className="proposal-title-row">
            <h2 className="proposal-name">{matter.clientName}</h2>
            <span className={`tag proposal-confidence ${conf}`}>{confidence}</span>
          </div>
          <p className="proposal-number">{matter.displayNumber}</p>
          <p className="proposal-meta muted">
            {matter.court} · {matter.county} · {matter.status}
          </p>

          <div className="evidence-block">
            <h3 className="evidence-heading">Why</h3>
            {shown.length === 0 ? (
              <p className="muted">No evidence notes for this proposal.</p>
            ) : (
              <ul className="evidence-list">
                {shown.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
            {overflow > 0 && <p className="muted evidence-more">+{overflow} more</p>}
          </div>
        </div>
      ) : (
        <div className="proposal-empty">
          <p className="proposal-eyebrow">Proposed matter</p>
          <h2 className="proposal-name">No reliable match</h2>
          <p className="muted">
            Choose a matter below, or mark the item case-related — matter unknown.
          </p>
        </div>
      )}

      <div className="proposal-secondary">
        <label className="proposal-search-label">
          Matter search
          <input
            className="search-box"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Type at least 3 characters"
          />
        </label>
        {searchHits.length > 0 && (
          <ul className="search-results">
            {searchHits.map((h) => (
              <li key={String(h.matterId)}>
                <button type="button" onClick={() => onPickSearchHit(String(h.matterId))}>
                  <strong>{String(h.clientName)}</strong> · {String(h.displayNumber)}
                  <div className="muted">{String(h.matchWhy)}</div>
                </button>
              </li>
            ))}
          </ul>
        )}

        <label className="remember-row">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => onRememberChange(e.target.checked)}
          />
          Remember this decision
        </label>
      </div>
    </div>
  );
}
