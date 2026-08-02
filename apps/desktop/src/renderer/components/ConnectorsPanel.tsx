import { useMemo, useState } from "react";

type ConnectorStatus = {
  id: string;
  label: string;
  connected: boolean;
  mode: "mock" | "live";
  accountLabel: string | null;
  detail: string;
};

type CredHints = {
  googleClientId?: string | null;
  googleClientSecret?: string | null;
  clioClientId?: string | null;
  clioClientSecret?: string | null;
  driveAuditFolderId?: string | null;
};

type Props = {
  demoMode: boolean;
  connectors: ConnectorStatus[];
  credentials: CredHints;
  onRefresh: () => Promise<void>;
  onStatus: (msg: string) => void;
};

export function ConnectorsPanel({
  demoMode,
  connectors,
  credentials,
  onRefresh,
  onStatus,
}: Props) {
  const [googleClientId, setGoogleClientId] = useState("");
  const [googleClientSecret, setGoogleClientSecret] = useState("");
  const [clioClientId, setClioClientId] = useState("");
  const [clioClientSecret, setClioClientSecret] = useState("");
  const [driveFolderId, setDriveFolderId] = useState(credentials.driveAuditFolderId ?? "");
  const [busy, setBusy] = useState<string | null>(null);

  const byId = useMemo(() => {
    const map = new Map(connectors.map((c) => [c.id, c]));
    return map;
  }, [connectors]);

  async function saveCreds() {
    setBusy("save");
    try {
      const payload: Record<string, string> = {};
      if (googleClientId.trim()) payload.googleClientId = googleClientId.trim();
      if (googleClientSecret.trim()) payload.googleClientSecret = googleClientSecret.trim();
      if (clioClientId.trim()) payload.clioClientId = clioClientId.trim();
      if (clioClientSecret.trim()) payload.clioClientSecret = clioClientSecret.trim();
      if (driveFolderId.trim()) payload.driveAuditFolderId = driveFolderId.trim();
      await window.mattermail.saveConnectorCredentials(payload);
      setGoogleClientSecret("");
      setClioClientSecret("");
      onStatus("Connector credentials saved (encrypted via safeStorage)");
      await onRefresh();
    } finally {
      setBusy(null);
    }
  }

  async function connect(id: "gmail" | "clio" | "drive") {
    setBusy(id);
    try {
      const res = (await window.mattermail.connectConnector(id)) as {
        ok: boolean;
        error?: string;
      };
      if (!res.ok) onStatus(res.error ?? "Connect failed");
      else onStatus(`${id} connected — complete sign-in in the browser if prompted`);
      await onRefresh();
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(id: "gmail" | "clio" | "drive") {
    setBusy(`disc-${id}`);
    try {
      await window.mattermail.disconnectConnector(id);
      onStatus(`${id} disconnected — Demo adapter restored`);
      await onRefresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="status-card connectors-panel">
      <h2>Connectors</h2>
      <p className="muted">
        Demo / Mock stays on until you connect. OAuth opens your system browser (loopback + PKCE for
        Google). Secrets never go in SQLite.
      </p>
      <p className={`connector-mode-pill ${demoMode ? "demo" : "live"}`}>
        {demoMode ? "Demo / Mock mode" : "Live connectors active"}
      </p>

      <div className="connector-grid">
        {(["gmail", "clio", "drive"] as const).map((id) => {
          const c = byId.get(id);
          return (
            <div key={id} className={`connector-card ${c?.connected ? "connected" : ""}`}>
              <div className="connector-card-head">
                <strong>{c?.label ?? id}</strong>
                <span className={`tag ${c?.connected ? "high" : "low"}`}>
                  {c?.mode === "live" ? "Live" : "Mock"}
                </span>
              </div>
              <p className="muted">{c?.detail}</p>
              {c?.accountLabel && <p className="connector-account">{c.accountLabel}</p>}
              <div className="connector-actions">
                {c?.connected ? (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy !== null}
                    onClick={() => void disconnect(id)}
                  >
                    Disconnect
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy !== null}
                    onClick={() => void connect(id)}
                  >
                    {busy === id ? "Waiting…" : "Connect"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <h3 style={{ marginTop: 20 }}>OAuth app credentials</h3>
      <div className="cred-form">
        <label>
          Google Client ID
          <input
            className="search-box"
            placeholder={credentials.googleClientId ?? "••••"}
            value={googleClientId}
            onChange={(e) => setGoogleClientId(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          Google Client Secret (optional for public clients)
          <input
            className="search-box"
            type="password"
            placeholder={credentials.googleClientSecret ?? ""}
            value={googleClientSecret}
            onChange={(e) => setGoogleClientSecret(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          Clio Client ID
          <input
            className="search-box"
            placeholder={credentials.clioClientId ?? "••••"}
            value={clioClientId}
            onChange={(e) => setClioClientId(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          Clio Client Secret
          <input
            className="search-box"
            type="password"
            placeholder={credentials.clioClientSecret ?? ""}
            value={clioClientSecret}
            onChange={(e) => setClioClientSecret(e.target.value)}
            autoComplete="off"
          />
        </label>
        <label>
          Drive audit folder ID
          <input
            className="search-box"
            placeholder="Folder created by this app (drive.file)"
            value={driveFolderId}
            onChange={(e) => setDriveFolderId(e.target.value)}
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy !== null}
          onClick={() => void saveCreds()}
        >
          {busy === "save" ? "Saving…" : "Save credentials"}
        </button>
      </div>
    </section>
  );
}
