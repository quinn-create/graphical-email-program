type Props = {
  subject: string;
  fromName: string;
  isQuest: boolean;
  confidence: string;
  reviewStatus: string;
  whyLine?: string;
  active: boolean;
  onSelect: () => void;
};

function statusLabel(status: string): string {
  switch (status) {
    case "unreviewed":
      return "Waiting";
    case "approved":
      return "Approved";
    case "matter_unknown":
      return "Matter unknown";
    case "not_case_related":
      return "Not case-related";
    case "later":
      return "Later";
    case "duplicate":
      return "Duplicate";
    case "split_pending":
      return "Split";
    default:
      return status;
  }
}

function confidenceClass(confidence: string): string {
  const c = confidence.toLowerCase();
  if (c === "high") return "high";
  if (c === "medium") return "medium";
  if (c === "low" || c === "none") return "low";
  return "unknown";
}

export function QueueRow({
  subject,
  fromName,
  isQuest,
  confidence,
  reviewStatus,
  whyLine,
  active,
  onSelect,
}: Props) {
  const conf = confidenceClass(confidence);

  return (
    <button
      type="button"
      className={`queue-row confidence-${conf} ${active ? "active" : ""}`}
      onClick={onSelect}
    >
      <span className="queue-rail" aria-hidden />
      <span className="queue-row-body">
        <span className="queue-row-top">
          <span className="subject">{subject}</span>
          <span className={`queue-confidence tag ${conf}`}>{confidence}</span>
        </span>
        {whyLine ? <span className="queue-why">{whyLine}</span> : null}
        <span className="meta">
          <span className="queue-sender">{fromName}</span>
          <span className="queue-dot" aria-hidden>
            ·
          </span>
          <span className="queue-status">{statusLabel(reviewStatus)}</span>
          <span className="queue-source">{isQuest ? "Quest" : "Gmail"}</span>
        </span>
      </span>
    </button>
  );
}
