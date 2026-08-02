import { useEffect, useMemo, useState, useTransition } from "react";
import { ReviewActionBar, type ReviewBarAction } from "./components/ReviewActionBar";

type Page = "home" | "review" | "staged" | "rules" | "settings" | "setup";

type ReviewItem = {
  id: string;
  subject: string;
  snippet: string;
  bodyText: string;
  fromEmail: string;
  fromName: string;
  date: string;
  isQuest: boolean;
  direction: string;
  attachments: Array<{ id: string; filename: string; ocrStatus: string; textContent: string }>;
  proposedMatterId: string | null;
  confidence: string;
  caseRelatedness: string;
  reviewStatus: string;
  evidence: string[];
  aiBadge: { provider: string; model: string };
  threadId: string;
};

type Matter = {
  id: string;
  clioMatterId: string;
  displayNumber: string;
  description: string;
  clientName: string;
  court: string;
  county: string;
  status: string;
};

const PROVIDERS = [
  "OpenAI API",
  "Anthropic Claude API",
  "Google Gemini API",
  "xAI API",
  "Mistral AI API",
  "OpenRouter API",
  "Azure OpenAI",
  "Custom OpenAI-compatible",
  "Ollama",
];

export function App() {
  const [page, setPage] = useState<Page>("setup");
  const [info, setInfo] = useState<{ product?: { name: string }; demoMode?: boolean } | null>(null);
  const [checkpoints, setCheckpoints] = useState<Record<string, unknown>>({});
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [matters, setMatters] = useState<Matter[]>([]);
  const [staged, setStaged] = useState<Array<Record<string, unknown>>>([]);
  const [rules, setRules] = useState<Array<Record<string, unknown>>>([]);
  const [aiConfig, setAiConfig] = useState<Record<string, unknown>>({});
  const [models, setModels] = useState<Array<{ id: string; displayName: string; supportsVision?: boolean }>>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewTab, setPreviewTab] = useState("Email");
  const [remember, setRemember] = useState(true);
  const [chosenMatterId, setChosenMatterId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [searchHits, setSearchHits] = useState<Array<Record<string, unknown>>>([]);
  const [setupStep, setSetupStep] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState(0);
  const [status, setStatus] = useState("");
  const [, startTransition] = useTransition();

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? items[0] ?? null,
    [items, selectedId],
  );

  const systemProposedMatter = useMemo(() => {
    if (!selected?.proposedMatterId) return null;
    return matters.find((m) => m.clioMatterId === selected.proposedMatterId) ?? null;
  }, [matters, selected]);

  const proposedMatter = useMemo(() => {
    const id = chosenMatterId ?? selected?.proposedMatterId;
    return matters.find((m) => m.clioMatterId === id) ?? null;
  }, [matters, selected, chosenMatterId]);

  useEffect(() => {
    void (async () => {
      const i = await window.mattermail.getInfo();
      setInfo(i as typeof info);
      const cp = await window.mattermail.getCheckpoints();
      setCheckpoints(cp);
      const cfg = await window.mattermail.getAiConfig();
      setAiConfig(cfg as Record<string, unknown>);
      const ms = await window.mattermail.listModels();
      setModels(ms as typeof models);
      if ((i as { setupComplete?: boolean }).setupComplete) {
        setPage("home");
        await refreshAll();
      }
    })();
  }, []);

  async function refreshAll() {
    const [list, mats, st, rl, cp] = await Promise.all([
      window.mattermail.listReview(),
      window.mattermail.listMatters(),
      window.mattermail.listStaged(),
      window.mattermail.listLearningRules(),
      window.mattermail.getCheckpoints(),
    ]);
    setItems(list as ReviewItem[]);
    setMatters(mats as Matter[]);
    setStaged(st as Array<Record<string, unknown>>);
    setRules(rl as Array<Record<string, unknown>>);
    setCheckpoints(cp);
    if (!selectedId && (list as ReviewItem[])[0]) {
      setSelectedId((list as ReviewItem[])[0]!.id);
    }
  }

  async function finishSetup() {
    await window.mattermail.completeSetup({
      ai: {
        profileName: PROVIDERS[selectedProvider],
        ocrModelId: models[0]?.id ?? "mock-vision-model",
        matchingModelId: models[0]?.id ?? "mock-vision-model",
        learningModelId: models[0]?.id ?? "mock-vision-model",
      },
    });
    await window.mattermail.scanGmail("72h");
    await refreshAll();
    setPage("home");
  }

  async function doAction(action: ReviewBarAction | string, matterId?: string) {
    if (!selected) return;
    const res = (await window.mattermail.reviewAction({
      itemId: selected.id,
      action,
      matterId,
      remember,
    })) as { ok: boolean; items?: ReviewItem[]; staged?: Array<Record<string, unknown>> };
    if (res.items) setItems(res.items);
    if (res.staged) setStaged(res.staged);
    const cp = await window.mattermail.getCheckpoints();
    setCheckpoints(cp);
    // Advance to next unreviewed
    if (["approve", "choose", "unknown", "not_related", "later", "duplicate"].includes(action)) {
      const next = (res.items ?? items).find(
        (i) => i.id !== selected.id && i.reviewStatus === "unreviewed",
      );
      if (next) {
        startTransition(() => {
          setSelectedId(next.id);
          setChosenMatterId(null);
        });
      }
    }
    setStatus(`${action} saved`);
  }

  useEffect(() => {
    if (search.trim().length < 3) {
      setSearchHits([]);
      return;
    }
    const t = setTimeout(() => {
      void window.mattermail.searchMatters(search).then((hits) => {
        setSearchHits(hits as Array<Record<string, unknown>>);
      });
    }, 80);
    return () => clearTimeout(t);
  }, [search]);

  if (page === "setup") {
    return (
      <div className="page">
        <div className="wizard">
          {setupStep === 0 && (
            <>
              <p className="demo-pill">Demo / Mock mode</p>
              <h1>
                <span style={{ color: "var(--teal)" }}>MatterMail</span> Review
              </h1>
              <p>
                Fast graphical review of Gmail messages with assignment to Clio Manage matters.
                Selected email and document content may leave this computer when cloud AI is
                enabled. You supply your own AI credentials. No AI output is final until you
                review it.
              </p>
              <p>
                Gmail is read-only. Clio writes are staged and confirmed. Quest has no login.
                Chat subscriptions and API billing are separate unless a provider says otherwise.
              </p>
              <button className="btn btn-primary" onClick={() => setSetupStep(1)}>
                Continue
              </button>
            </>
          )}
          {setupStep === 1 && (
            <>
              <h1>Connectors</h1>
              <p>In Demo mode, Gmail, Clio, and Drive use mock adapters with fictional data.</p>
              <ul>
                <li>Gmail — read-only scope only</li>
                <li>Clio Manage — index + staged creates</li>
                <li>Google Drive — audit uploads only</li>
                <li>Quest — no credentials (email/link/PDF only)</li>
              </ul>
              <div className="actions" style={{ display: "flex", gap: 8 }}>
                <button className="btn" onClick={() => setSetupStep(0)}>
                  Back
                </button>
                <button className="btn btn-primary" onClick={() => setSetupStep(2)}>
                  Continue
                </button>
              </div>
            </>
          )}
          {setupStep === 2 && (
            <>
              <h1>AI provider</h1>
              <p>
                Bring your own provider. The app does not include a shared AI key. You may disable
                cloud AI later.
              </p>
              <div className="provider-grid">
                {PROVIDERS.map((p, idx) => (
                  <button
                    key={p}
                    className={`provider-card ${selectedProvider === idx ? "selected" : ""}`}
                    onClick={() => setSelectedProvider(idx)}
                  >
                    <strong>{p}</strong>
                    <div className="muted">Setup card</div>
                  </button>
                ))}
              </div>
              <label className="muted">
                Exact model
                <select
                  className="search-box"
                  style={{ marginTop: 6 }}
                  value={String(aiConfig.matchingModelId ?? models[0]?.id ?? "")}
                  onChange={(e) =>
                    void window.mattermail.setAiConfig({ matchingModelId: e.target.value, ocrModelId: e.target.value, learningModelId: e.target.value }).then(setAiConfig)
                  }
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.displayName} ({m.id})
                    </option>
                  ))}
                </select>
              </label>
              <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
                <button className="btn" onClick={() => setSetupStep(1)}>
                  Back
                </button>
                <button
                  className="btn"
                  onClick={() =>
                    void window.mattermail
                      .testCapabilities(String(aiConfig.matchingModelId ?? models[0]?.id))
                      .then((r) => setStatus(JSON.stringify(r)))
                  }
                >
                  Run capability test
                </button>
                <button className="btn btn-primary" onClick={() => void finishSetup()}>
                  Finish setup
                </button>
              </div>
              {status && <p className="muted">{status}</p>}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="brand">
            Matter<span>Mail</span> Review
          </div>
          {info?.demoMode && <span className="demo-pill">Demo / Mock mode</span>}
        </div>
        <nav className="nav">
          {(
            [
              ["home", "Home"],
              ["review", "Rapid Review"],
              ["staged", "Staged"],
              ["rules", "Rules"],
              ["settings", "Settings"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              className={page === id ? "active" : ""}
              onClick={() => setPage(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <button className="ai-badge" onClick={() => setPage("settings")} title="Open AI settings">
          <strong>{String(aiConfig.providerType ?? "MOCK")}</strong>
          <small>OCR: {String(aiConfig.ocrModelId)}</small>
          <small>MATCHING: {String(aiConfig.matchingModelId)}</small>
          <small>LEARNING: {String(aiConfig.learningModelId)}</small>
        </button>
      </header>

      {page === "home" && (
        <div className="page">
          <div className="home-grid">
            <section className="status-card">
              <h2>Gmail</h2>
              <p>Last scan: {String(checkpoints.lastGmailDownload ?? "—")}</p>
              <p>Unreviewed: {items.filter((i) => i.reviewStatus === "unreviewed").length}</p>
              <div className="actions">
                {["24h", "72h", "7d", "custom", "since-last"].map((w) => (
                  <button
                    key={w}
                    className="btn"
                    onClick={() => void window.mattermail.scanGmail(w).then(() => refreshAll())}
                  >
                    {w}
                  </button>
                ))}
              </div>
            </section>
            <section className="status-card">
              <h2>Quest emails</h2>
              <p>Last scanned: {String(checkpoints.lastQuestEmailScan ?? "—")}</p>
              <p>Waiting: {items.filter((i) => i.isQuest).length}</p>
              <div className="actions">
                <button className="btn btn-primary" onClick={() => setPage("review")}>
                  Open queue
                </button>
              </div>
            </section>
            <section className="status-card">
              <h2>Clio index</h2>
              <p>Last refresh: {String(checkpoints.lastClioIndexRefresh ?? "—")}</p>
              <p>Matters: {matters.length}</p>
              <div className="actions">
                <button
                  className="btn"
                  onClick={() => void window.mattermail.refreshClioIndex().then(() => refreshAll())}
                >
                  Refresh
                </button>
              </div>
            </section>
            <section className="status-card">
              <h2>AI</h2>
              <p>{String(aiConfig.profileName ?? "Demo Mock Provider")}</p>
              <p className="muted">{String(aiConfig.matchingModelId)}</p>
              <div className="actions">
                <button className="btn" onClick={() => setPage("settings")}>
                  Open Settings
                </button>
              </div>
            </section>
            <section className="status-card">
              <h2>Review</h2>
              <p>Waiting: {items.filter((i) => i.reviewStatus === "unreviewed").length}</p>
              <p>Matter unknown: {items.filter((i) => i.reviewStatus === "matter_unknown").length}</p>
              <div className="actions">
                <button className="btn btn-primary" onClick={() => setPage("review")}>
                  Begin Rapid Review
                </button>
              </div>
            </section>
            <section className="status-card">
              <h2>Staged</h2>
              <p>Approved not committed: {Number(checkpoints.approvedNotCommitted ?? staged.length)}</p>
              <div className="actions">
                <button className="btn btn-primary" onClick={() => setPage("staged")}>
                  Review and Commit
                </button>
              </div>
            </section>
            <section className="status-card">
              <h2>Audit</h2>
              <p>Last Drive upload: {String(checkpoints.lastDriveAuditUpload ?? "—")}</p>
              <p>Last Clio commit: {String(checkpoints.lastClioCommit ?? "—")}</p>
            </section>
          </div>
        </div>
      )}

      {page === "review" && selected && (
        <>
          <div className="page" style={{ paddingBottom: 0 }}>
            <div className="review-layout">
              <div className="panel">
                <header>Queue</header>
                <div className="queue-list">
                  {items.map((item) => (
                    <button
                      key={item.id}
                      className={`queue-row ${selected.id === item.id ? "active" : ""}`}
                      onClick={() => {
                        setSelectedId(item.id);
                        setChosenMatterId(null);
                      }}
                    >
                      <div className="subject">{item.subject}</div>
                      <div className="meta">
                        {item.fromName} · {item.isQuest ? "Quest" : "Gmail"} ·{" "}
                        <span className={`tag ${item.confidence.toLowerCase()}`}>
                          {item.confidence}
                        </span>{" "}
                        · {item.reviewStatus}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="panel">
                <header>Source preview</header>
                <div className="tabs">
                  {["Email", "Thread", "Attachment", "Extracted Text", "OCR Text", "AI Analysis", "Metadata"].map(
                    (t) => (
                      <button
                        key={t}
                        className={previewTab === t ? "active" : ""}
                        onClick={() => setPreviewTab(t)}
                      >
                        {t}
                      </button>
                    ),
                  )}
                </div>
                <div className="preview">
                  {previewTab === "Email" && (
                    <>
                      <strong>{selected.subject}</strong>
                      <div className="muted">
                        {selected.fromName} &lt;{selected.fromEmail}&gt;
                      </div>
                      <p>{selected.bodyText}</p>
                    </>
                  )}
                  {previewTab === "Attachment" &&
                    (selected.attachments.length === 0 ? (
                      <p className="muted">No attachments</p>
                    ) : (
                      selected.attachments.map((a) => (
                        <div key={a.id} className="matter-card">
                          <strong>{a.filename}</strong>
                          <div className="muted">OCR: {a.ocrStatus}</div>
                          <pre style={{ whiteSpace: "pre-wrap" }}>{a.textContent}</pre>
                        </div>
                      ))
                    ))}
                  {previewTab === "Extracted Text" && (
                    <pre>{selected.attachments.map((a) => a.textContent).join("\n\n") || selected.bodyText}</pre>
                  )}
                  {previewTab === "AI Analysis" && (
                    <p>
                      Provider {selected.aiBadge.provider} / model {selected.aiBadge.model}
                      {"\n"}Evidence: {selected.evidence.join("; ") || "—"}
                    </p>
                  )}
                  {previewTab === "Metadata" && (
                    <pre>
                      {JSON.stringify(
                        {
                          id: selected.id,
                          threadId: selected.threadId,
                          caseRelatedness: selected.caseRelatedness,
                          direction: selected.direction,
                        },
                        null,
                        2,
                      )}
                    </pre>
                  )}
                  {(previewTab === "Thread" || previewTab === "OCR Text") && (
                    <p className="muted">Available after full sync / OCR run.</p>
                  )}
                  <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                    <button
                      className="btn"
                      onClick={() =>
                        void window.mattermail.openExternal(
                          `https://mail.google.com/mail/u/0/#inbox/${selected.id}`,
                        )
                      }
                    >
                      Open in Gmail
                    </button>
                    {selected.isQuest && (
                      <button
                        className="btn"
                        onClick={() =>
                          void window.mattermail.openQuestLink(
                            "https://quest.example.gov/cases/JV-25-0088/documents/abc",
                          )
                        }
                      >
                        Open Quest link
                      </button>
                    )}
                    <button className="btn" onClick={() => void doAction("analyze")}>
                      Analyze with AI
                    </button>
                  </div>
                </div>
              </div>

              <div className="panel">
                <header>Matter & proposal</header>
                <div className="matter-panel">
                  {proposedMatter ? (
                    <div className="matter-card selected">
                      <strong>{proposedMatter.clientName}</strong>
                      <div>{proposedMatter.displayNumber}</div>
                      <div className="muted">
                        {proposedMatter.court} · {proposedMatter.county} · {proposedMatter.status}
                      </div>
                      <div className={`tag ${selected.confidence.toLowerCase()}`}>
                        {selected.confidence}
                      </div>
                      <ul>
                        {selected.evidence.map((e) => (
                          <li key={e}>{e}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <p className="muted">No reliable matter proposal</p>
                  )}

                  <label>
                    Matter search
                    <input
                      className="search-box"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Type at least 3 characters"
                    />
                  </label>
                  {searchHits.length > 0 && (
                    <ul className="search-results">
                      {searchHits.map((h) => (
                        <li key={String(h.matterId)}>
                          <button
                            onClick={() => {
                              const m = matters.find((x) => x.id === h.matterId);
                              if (m) setChosenMatterId(m.clioMatterId);
                              setSearch("");
                              setSearchHits([]);
                            }}
                          >
                            <strong>{String(h.clientName)}</strong> · {String(h.displayNumber)}
                            <div className="muted">{String(h.matchWhy)}</div>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <input
                      type="checkbox"
                      checked={remember}
                      onChange={(e) => setRemember(e.target.checked)}
                    />
                    Remember this decision
                  </label>
                </div>
              </div>
            </div>
          </div>
          <ReviewActionBar
            canApprove={Boolean(systemProposedMatter)}
            hasAlternateMatter={Boolean(
              chosenMatterId && chosenMatterId !== selected.proposedMatterId,
            )}
            canUndo
            approveMatterId={systemProposedMatter?.clioMatterId}
            chooseMatterId={chosenMatterId ?? systemProposedMatter?.clioMatterId}
            onAction={(action, matterId) => void doAction(action, matterId)}
          />
        </>
      )}

      {page === "staged" && (
        <div className="page">
          <h2>Staged commits</h2>
          <p className="muted">Nothing is written to Clio until you confirm.</p>
          {staged.length === 0 && <p>No staged items.</p>}
          {staged.map((s) => (
            <div key={String(s.id)} className="status-card" style={{ marginBottom: 12 }}>
              <strong>{String(s.subject)}</strong>
              <p>Matter: {String(s.matterId)}</p>
              <p>State: {String(s.state)}</p>
              <p className="muted">Fingerprint: {String(s.fingerprint)}</p>
            </div>
          ))}
          <button
            className="btn btn-primary"
            disabled={staged.length === 0}
            onClick={() =>
              void window.mattermail
                .commit(staged.map((s) => String(s.id)))
                .then(async (r) => {
                  setStatus(JSON.stringify(r));
                  await refreshAll();
                })
            }
          >
            Commit selected
          </button>
          {status && <pre className="muted">{status}</pre>}
        </div>
      )}

      {page === "rules" && (
        <div className="page">
          <h2>Matching rules</h2>
          <p className="muted">Only user-activated rules influence matching. AI proposals require confirmation.</p>
          {rules.length === 0 && <p>No rules yet. Approve an item with Remember checked.</p>}
          {rules.map((r) => (
            <div key={String(r.id)} className="status-card" style={{ marginBottom: 10 }}>
              <strong>
                {String(r.ruleType)} → {String(r.matchedValue)}
              </strong>
              <p>
                {String(r.caseRelatedness)} / {String(r.matterScope)}
                {r.fixedMatterId ? ` / matter ${String(r.fixedMatterId)}` : ""}
              </p>
              <p className="muted">{String(r.reason)}</p>
            </div>
          ))}
        </div>
      )}

      {page === "settings" && (
        <div className="page">
          <h2>Settings</h2>
          <section className="status-card">
            <h2>AI models</h2>
            <p>Exact model IDs are always displayed and audited.</p>
            <label>
              OCR model
              <select
                className="search-box"
                value={String(aiConfig.ocrModelId ?? "")}
                onChange={(e) =>
                  void window.mattermail.setAiConfig({ ocrModelId: e.target.value }).then(setAiConfig)
                }
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id} {m.supportsVision ? "(vision)" : "(text)"}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ display: "block", marginTop: 8 }}>
              Matching model
              <select
                className="search-box"
                value={String(aiConfig.matchingModelId ?? "")}
                onChange={(e) =>
                  void window.mattermail
                    .setAiConfig({ matchingModelId: e.target.value })
                    .then(setAiConfig)
                }
              >
                {models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.id}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn"
              style={{ marginTop: 12 }}
              onClick={() =>
                void window.mattermail.safetySelfCheck().then((r) => setStatus(JSON.stringify(r, null, 2)))
              }
            >
              Run safety self-check
            </button>
            {status && <pre>{status}</pre>}
          </section>
        </div>
      )}
    </div>
  );
}
