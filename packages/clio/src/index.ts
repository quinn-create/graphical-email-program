import {
  assertClioRequestAllowed,
  getClioAllowlistSummary,
  SecurityViolationError,
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

/**
 * Centralized Clio API client with runtime allowlist.
 * DELETE and PATCH are rejected even if called accidentally.
 */
export class ClioClient {
  private receipts = new Map<string, ClioWriteReceipt>();
  private matters: ClioMatterDto[] = [];
  private demo: boolean;

  constructor(opts: { baseUrl?: string; demo?: boolean; matters?: ClioMatterDto[] } = {}) {
    this.demo = opts.demo ?? true;
    this.matters = opts.matters ?? [];
    void opts.baseUrl;
  }

  getAllowlist() {
    return getClioAllowlistSummary();
  }

  async request(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown) {
    assertClioRequestAllowed({ method, path });
    if (method === "GET" && path.startsWith("/api/v4/matters")) {
      return { data: this.matters };
    }
    if (method === "POST" && path === "/api/v4/communications") {
      return this.createCommunication(body as ClioCommunicationCreate);
    }
    if (method === "POST" && path === "/api/v4/documents") {
      return this.createDocument(body as ClioDocumentCreate);
    }
    throw new SecurityViolationError(`Unhandled allowlisted path: ${method} ${path}`, "CLIO_UNHANDLED");
  }

  async indexMatters(): Promise<ClioMatterDto[]> {
    const res = await this.request("GET", "/api/v4/matters");
    return (res as { data: ClioMatterDto[] }).data;
  }

  async createCommunication(input: ClioCommunicationCreate): Promise<ClioWriteReceipt> {
    assertClioRequestAllowed({ method: "POST", path: "/api/v4/communications" });
    const key = `communication:${input.fingerprint}`;
    const existing = this.receipts.get(key);
    if (existing) {
      return existing; // idempotent — do not recreate
    }
    const receipt: ClioWriteReceipt = {
      writeKind: "communication",
      clioId: this.demo ? `demo-comm-${newId().slice(0, 8)}` : newId(),
      fingerprint: input.fingerprint,
      verified: true,
    };
    this.receipts.set(key, receipt);
    return receipt;
  }

  async createDocument(input: ClioDocumentCreate): Promise<ClioWriteReceipt> {
    assertClioRequestAllowed({ method: "POST", path: "/api/v4/documents" });
    const key = `document:${input.fingerprint}:${input.sha256}`;
    const existing = this.receipts.get(key);
    if (existing) {
      return existing;
    }
    const receipt: ClioWriteReceipt = {
      writeKind: "document",
      clioId: this.demo ? `demo-doc-${newId().slice(0, 8)}` : newId(),
      fingerprint: input.fingerprint,
      verified: true,
    };
    this.receipts.set(key, receipt);
    return receipt;
  }

  getReceipt(fingerprint: string, writeKind: "communication" | "document"): ClioWriteReceipt | undefined {
    return this.receipts.get(`${writeKind}:${fingerprint}`) ??
      [...this.receipts.values()].find((r) => r.fingerprint === fingerprint && r.writeKind === writeKind);
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
