import {
  assertClioRequestAllowed,
  getClioAllowlistSummary,
  SecurityViolationError,
  runOAuthLoopback,
  exchangeAuthorizationCode,
  refreshAccessToken,
} from "@mattermail/security";
import { newId } from "@mattermail/domain";

export interface ClioMatterDto {
  id: string;
  displayNumber: string;
  description: string;
  status: string;
  clientName: string;
  court?: string;
  county?: string;
  caseNumber?: string;
  docketNumber?: string;
  warrantNumber?: string;
}

export interface ClioCommunicationCreate {
  subject: string;
  body: string;
  matterId: string;
  direction: string;
  date: string;
  fingerprint: string;
  senderEmail?: string;
  recipientEmails?: string[];
}

export interface ClioDocumentCreate {
  matterId: string;
  filename: string;
  contentBase64: string;
  sha256: string;
  fingerprint: string;
}

export interface ClioWriteReceipt {
  writeKind: "communication" | "document";
  clioId: string;
  fingerprint: string;
  verified: boolean;
}

export interface ClioTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
}

export interface ClioClientOptions {
  baseUrl?: string;
  demo?: boolean;
  matters?: ClioMatterDto[];
  tokens?: ClioTokenSet;
  clientId?: string;
  clientSecret?: string;
}

/**
 * Centralized Clio API client with runtime allowlist.
 * DELETE and PATCH are rejected even if called accidentally.
 */
export class ClioClient {
  private receipts = new Map<string, ClioWriteReceipt>();
  private matters: ClioMatterDto[] = [];
  private demo: boolean;
  private baseUrl: string;
  private tokens: ClioTokenSet | null;
  private clientId?: string;
  private clientSecret?: string;
  mode: "mock" | "live";

  constructor(opts: ClioClientOptions = {}) {
    this.demo = opts.demo ?? !opts.tokens;
    this.mode = this.demo ? "mock" : "live";
    this.matters = opts.matters ?? [];
    this.baseUrl = (opts.baseUrl ?? "https://app.clio.com").replace(/\/$/, "");
    this.tokens = opts.tokens ?? null;
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
  }

  getAllowlist() {
    return getClioAllowlistSummary();
  }

  setTokens(tokens: ClioTokenSet) {
    this.tokens = tokens;
    this.demo = false;
    this.mode = "live";
  }

  async authorize(opts: {
    clientId: string;
    clientSecret: string;
    openExternal: (url: string) => Promise<void>;
    baseUrl?: string;
  }): Promise<ClioTokenSet> {
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    if (opts.baseUrl) this.baseUrl = opts.baseUrl.replace(/\/$/, "");

    const loopback = await runOAuthLoopback({
      authorizeUrl: `${this.baseUrl}/oauth/authorize`,
      clientId: opts.clientId,
      scopes: [], // Clio app permissions are configured on the Clio app, not as Google-style scopes
      openExternal: opts.openExternal,
      usePkce: false,
    });

    const token = await exchangeAuthorizationCode({
      tokenUrl: `${this.baseUrl}/oauth/token`,
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
      code: loopback.code,
      redirectUri: loopback.redirectUri,
    });

    this.tokens = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
    };
    this.demo = false;
    this.mode = "live";
    return this.tokens;
  }

  private async ensureAccessToken(): Promise<string> {
    if (!this.tokens?.accessToken) throw new Error("Clio not connected");
    if (
      this.tokens.expiresAt &&
      Date.now() > this.tokens.expiresAt - 60_000 &&
      this.tokens.refreshToken &&
      this.clientId
    ) {
      const refreshed = await refreshAccessToken({
        tokenUrl: `${this.baseUrl}/oauth/token`,
        clientId: this.clientId,
        clientSecret: this.clientSecret,
        refreshToken: this.tokens.refreshToken,
      });
      this.tokens = {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token ?? this.tokens.refreshToken,
        expiresAt: refreshed.expires_in
          ? Date.now() + refreshed.expires_in * 1000
          : this.tokens.expiresAt,
      };
    }
    return this.tokens.accessToken;
  }

  async request(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ) {
    assertClioRequestAllowed({ method, path });

    if (this.demo || this.mode === "mock") {
      if (method === "GET" && path.startsWith("/api/v4/matters")) {
        return { data: this.matters };
      }
      if (method === "POST" && path === "/api/v4/communications") {
        return this.createCommunication(body as ClioCommunicationCreate);
      }
      if (method === "POST" && path === "/api/v4/documents") {
        return this.createDocument(body as ClioDocumentCreate);
      }
      throw new SecurityViolationError(
        `Unhandled allowlisted path: ${method} ${path}`,
        "CLIO_UNHANDLED",
      );
    }

    const access = await this.ensureAccessToken();
    const url = `${this.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
    const res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${access}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Clio API ${res.status}: ${text.slice(0, 400)}`);
    }
    if (res.status === 204) return {};
    return res.json();
  }

  async indexMatters(): Promise<ClioMatterDto[]> {
    if (this.demo || this.mode === "mock") {
      const res = await this.request("GET", "/api/v4/matters");
      return (res as { data: ClioMatterDto[] }).data;
    }

    const fields =
      "id,display_number,description,status,open_date,close_date,client{id,name},practice_area{name},responsible_attorney{name}";
    const all: ClioMatterDto[] = [];
    let urlPath = `/api/v4/matters?fields=${encodeURIComponent(fields)}&limit=200`;
    for (let page = 0; page < 50; page++) {
      assertClioRequestAllowed({ method: "GET", path: "/api/v4/matters" });
      const access = await this.ensureAccessToken();
      const res = await fetch(`${this.baseUrl}${urlPath}`, {
        headers: { Authorization: `Bearer ${access}` },
      });
      if (!res.ok) throw new Error(`Clio matters index failed: ${res.status}`);
      const json = (await res.json()) as {
        data: Array<Record<string, unknown>>;
        meta?: { paging?: { next?: string } };
      };
      for (const row of json.data ?? []) {
        const client = row.client as { id?: number; name?: string } | undefined;
        all.push({
          id: String(row.id),
          displayNumber: String(row.display_number ?? ""),
          description: String(row.description ?? ""),
          status: String(row.status ?? ""),
          clientName: client?.name ?? "",
        });
      }
      const next = json.meta?.paging?.next;
      if (!next) break;
      urlPath = next.replace(this.baseUrl, "");
    }
    this.matters = all;
    return all;
  }

  async createCommunication(input: ClioCommunicationCreate): Promise<ClioWriteReceipt> {
    assertClioRequestAllowed({ method: "POST", path: "/api/v4/communications" });
    const key = `communication:${input.fingerprint}`;
    const existing = this.receipts.get(key);
    if (existing) return existing;

    if (this.demo || this.mode === "mock") {
      const receipt: ClioWriteReceipt = {
        writeKind: "communication",
        clioId: `demo-comm-${newId().slice(0, 8)}`,
        fingerprint: input.fingerprint,
        verified: true,
      };
      this.receipts.set(key, receipt);
      return receipt;
    }

    const payload = {
      data: {
        type: "EmailCommunication",
        subject: input.subject,
        body: input.body,
        received_at: input.date,
        matter: { id: Number(input.matterId) || input.matterId },
      },
    };
    const created = (await this.request("POST", "/api/v4/communications", payload)) as {
      data?: { id?: string | number };
    };
    const clioId = String(created.data?.id ?? "");
    if (!clioId) throw new Error("Clio communication create returned no id");

    // Read-after-write verification
    await this.request("GET", `/api/v4/communications/${clioId}`);
    const receipt: ClioWriteReceipt = {
      writeKind: "communication",
      clioId,
      fingerprint: input.fingerprint,
      verified: true,
    };
    this.receipts.set(key, receipt);
    return receipt;
  }

  async createDocument(input: ClioDocumentCreate): Promise<ClioWriteReceipt> {
    assertClioRequestAllowed({ method: "POST", path: "/api/v4/documents" });
    const key = `document:${input.fingerprint}`;
    const existing = this.receipts.get(key);
    if (existing) return existing;

    if (this.demo || this.mode === "mock") {
      const receipt: ClioWriteReceipt = {
        writeKind: "document",
        clioId: `demo-doc-${newId().slice(0, 8)}`,
        fingerprint: input.fingerprint,
        verified: true,
      };
      this.receipts.set(key, receipt);
      return receipt;
    }

    const payload = {
      data: {
        name: input.filename,
        matter: { id: Number(input.matterId) || input.matterId },
      },
    };
    const created = (await this.request("POST", "/api/v4/documents", payload)) as {
      data?: { id?: string | number };
    };
    const clioId = String(created.data?.id ?? "");
    if (!clioId) throw new Error("Clio document create returned no id");
    await this.request("GET", `/api/v4/documents/${clioId}`);
    const receipt: ClioWriteReceipt = {
      writeKind: "document",
      clioId,
      fingerprint: input.fingerprint,
      verified: true,
    };
    this.receipts.set(key, receipt);
    return receipt;
  }

  getReceipt(
    fingerprint: string,
    writeKind: "communication" | "document",
  ): ClioWriteReceipt | undefined {
    return (
      this.receipts.get(`${writeKind}:${fingerprint}`) ??
      [...this.receipts.values()].find(
        (r) => r.fingerprint === fingerprint && r.writeKind === writeKind,
      )
    );
  }

  loadReceipts(receipts: ClioWriteReceipt[]) {
    for (const r of receipts) {
      this.receipts.set(`${r.writeKind}:${r.fingerprint}`, r);
    }
  }

  /** Test helper — exposes that delete is impossible. */
  async delete(_path: string): Promise<never> {
    assertClioRequestAllowed({ method: "DELETE", path: _path });
    throw new Error("unreachable");
  }
}

export function createMockClioClient(matters: ClioMatterDto[]): ClioClient {
  return new ClioClient({ demo: true, matters });
}
