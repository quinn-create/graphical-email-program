import { useEffect, useId, useRef, useState } from "react";

export type ReviewBarAction =
  | "approve"
  | "choose"
  | "unknown"
  | "not_related"
  | "later"
  | "duplicate"
  | "split"
  | "analyze"
  | "undo";

type Props = {
  canApprove: boolean;
  hasAlternateMatter: boolean;
  canUndo: boolean;
  onAction: (action: ReviewBarAction, matterId?: string) => void;
  approveMatterId?: string | null;
  chooseMatterId?: string | null;
};

const OVERFLOW_ACTIONS: Array<{ action: ReviewBarAction; label: string }> = [
  { action: "later", label: "Review later" },
  { action: "duplicate", label: "Duplicate / already logged" },
  { action: "split", label: "Split email or attachments" },
  { action: "analyze", label: "Analyze with AI" },
  { action: "undo", label: "Undo last decision" },
];

export function ReviewActionBar({
  canApprove,
  hasAlternateMatter,
  canUndo,
  onAction,
  approveMatterId,
  chooseMatterId,
}: Props) {
  const [moreOpen, setMoreOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!moreOpen) return;

    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMoreOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  function run(action: ReviewBarAction, matterId?: string | null) {
    setMoreOpen(false);
    onAction(action, matterId ?? undefined);
  }

  return (
    <div className="action-bar" role="toolbar" aria-label="Review actions">
      <button
        type="button"
        className="btn btn-yes"
        onClick={() => run("approve", approveMatterId)}
        disabled={!canApprove}
      >
        Yes — use proposed matter
      </button>

      <div className="action-bar-secondary">
        <button
          type="button"
          className="btn"
          onClick={() => run("choose", chooseMatterId ?? approveMatterId)}
          disabled={!chooseMatterId && !approveMatterId}
        >
          {hasAlternateMatter ? "Use selected matter" : "Choose different matter"}
        </button>
        <button type="button" className="btn" onClick={() => run("unknown")}>
          Case-related — matter unknown
        </button>
        <button type="button" className="btn" onClick={() => run("not_related")}>
          Not case-related
        </button>

        <div className="action-bar-more" ref={wrapRef}>
          <button
            type="button"
            className={`btn action-bar-more-trigger ${moreOpen ? "open" : ""}`}
            aria-expanded={moreOpen}
            aria-controls={menuId}
            aria-haspopup="menu"
            onClick={() => setMoreOpen((open) => !open)}
          >
            More actions
            <span className="action-bar-caret" aria-hidden>
              {moreOpen ? "▴" : "▾"}
            </span>
          </button>

          {moreOpen && (
            <div className="action-bar-menu" id={menuId} role="menu">
              {OVERFLOW_ACTIONS.map((item) => (
                <button
                  key={item.action}
                  type="button"
                  role="menuitem"
                  className="btn action-bar-menu-item"
                  disabled={item.action === "undo" && !canUndo}
                  onClick={() => run(item.action)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
