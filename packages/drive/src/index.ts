import {
  assertDriveActionAllowed,
  assertDriveNoOverwrite,
  getAllowedDriveScopes,
  runOAuthLoopback,
  exchangeAuthorizationCode,
  refreshAccessToken,
} from "@mattermail/security";
import { DRIVE_FILE_SCOPE, PRODUCT } from "@mattermail/shared";
import { newId, sha256 } from "@mattermail/domain";

export interface DriveFileRecord {
  id: string;
  name: string;
  path: string;
  size: number;
  checksum: string;
  runId: string;
  webViewLink?: string;
  alreadyExisted?: boolean;
}

export interface DriveTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
}

export interface DriveClientOptions {
  mode?: "mock" | "live";
  tokens?: DriveTokenSet;
  clientId?: string;
  clientSecret?: string;
  /** Parent folder id for audit uploads in live mode (drive.file scope). */
  auditFolderId?: string;
}

/**
 * Google Drive client — audit uploads only.
 * delete/trash/overwrite of finalized files are forbidden.
 */
export class DriveClient {
  private files = new Map<string, DriveFileRecord>();
  private byRunId = new Map<string, DriveFileRecord[]>();
  mode: "mock" | "live";
  private tokens: DriveTokenSet | null;
  private clientId?: string;
  private clientSecret?: string;
  private auditFolderId?: string;

  constructor(opts: DriveClientOptions = {}) {
    this.mode = opts.mode ?? (opts.tokens ? "live" : "mock");
    this.tokens = opts.tokens ?? null;
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.auditFolderId = opts.auditFolderId;
  }

  getScopes() {
    return getAllowedDriveScopes();
  }

  assertScope() {
    if (![...getAllowedDriveScopes()].includes(DRIVE_FILE_SCOPE)) {
      throw new Error("Drive scope misconfigured");
    }
  }

  setTokens(tokens: DriveTokenSet) {
    this.tokens = tokens;
    this.mode = "live";
  }

  setAuditFolderId(folderId: string) {
    this.auditFolderId = folderId;
  }

  async authorize(opts: {
    clientId: string;
    clientSecret?: string;
    openExternal: (url: string) => Promise<void>;
  }): Promise<DriveTokenSet> {
    this.clientId = opts.clientId;
    this.clientSecret = opts.clientSecret;
    this.assertScope();
    const loopback = await runOAuthLoopback({
      authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      clientId: opts.clientId,
      scopes: [DRIVE_FILE_SCOPE],
      openExternal: opts.openExternal,
      extraAuthParams: {
        access_type: "offline",
        prompt: "consent",
        include_granted_scopes: "false",
      },
    });
    const token = await exchangeAuthorizationCode({
      tokenUrl: "https://oauth2.googleapis.com/token",
      clientId: opts.clientId,
      clientSecret: opts.clientSecret,
      code: loopback.code,
      redirectUri: loopback.redirectUri,
      codeVerifier: loopback.pkceVerifier,
    });
    this.tokens = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token,
      expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
      scope: token.scope ?? DRIVE_FILE_SCOPE,
    };
    this.mode = "live";
    return this.tokens;
  }

  private async ensureAccessToken(): Promise<string> {
    if (!this.tokens?.accessToken) throw new Error("Drive not connected");
    if (
      this.tokens.expiresAt &&
      Date.now() > this.tokens.expiresAt - 60_000 &&
      this.tokens.refreshToken &&
      this.clientId
    ) {
      const refreshed = await refreshAccessToken({
        tokenUrl: "https://oauth2.googleapis.com/token",
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
        scope: refreshed.scope ?? this.tokens.scope,
      };
    }
    return this.tokens.accessToken;
  }

  async createAuditFolderPath(runId: string, date = new Date()): Promise<string> {
    assertDriveActionAllowed("files.create");
    const year = date.getUTCFullYear();
    const month = date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    return `${PRODUCT.auditRootFolderName}/${year}/${mm}-${month}/${runId}`;
  }

  async uploadAuditFile(input: {
    runId: string;
    filename: string;
    content: Buffer | string;
  }): Promise<DriveFileRecord> {
    assertDriveActionAllowed("files.create");
    const existing = (this.byRunId.get(input.runId) ?? []).find((f) => f.name === input.filename);
    if (existing) {
      // Idempotent retry: return existing without overwrite
      return { ...existing, alreadyExisted: true };
    }

    const buf = typeof input.content === "string" ? Buffer.from(input.content) : input.content;
    const checksum = sha256(buf);
    const path = `${await this.createAuditFolderPath(input.runId)}/${input.filename}`;

    if (this.mode === "live" && this.tokens) {
      const access = await this.ensureAccessToken();
      const folderId = this.auditFolderId;
      if (!folderId) {
        throw new Error("Drive audit folder id not configured (Settings → Connectors)");
      }

      // Search for existing by name in folder (idempotent)
      const q = encodeURIComponent(
        `name='${input.filename.replace(/'/g, "\\'")}' and '${folderId}' in parents and trashed=false`,
      );
      const findRes = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,webViewLink)&pageSize=1`,
        { headers: { Authorization: `Bearer ${access}` } },
      );
      if (findRes.ok) {
        const found = (await findRes.json()) as {
          files?: Array<{ id: string; webViewLink?: string }>;
        };
        if (found.files?.[0]) {
          const rec: DriveFileRecord = {
            id: found.files[0].id,
            name: input.filename,
            path,
            size: buf.length,
            checksum,
            runId: input.runId,
            webViewLink: found.files[0].webViewLink,
            alreadyExisted: true,
          };
          this.remember(rec);
          return rec;
        }
      }

      const boundary = `mattermail_${Date.now()}`;
      const metadata = { name: input.filename, parents: [folderId] };
      const metaPart = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`;
      const fileHeader = `--${boundary}\r\nContent-Type: application/octet-stream\r\n\r\n`;
      const closing = `\r\n--${boundary}--`;
      const metaBytes = Buffer.from(metaPart + fileHeader);
      const closeBytes = Buffer.from(closing);
      const body = Buffer.concat([metaBytes, buf, closeBytes]);

      const uploadRes = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${access}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body,
        },
      );
      if (!uploadRes.ok) {
        throw new Error(`Drive upload failed: ${uploadRes.status} ${await uploadRes.text()}`);
      }
      const data = (await uploadRes.json()) as { id: string; webViewLink?: string };
      const record: DriveFileRecord = {
        id: data.id,
        name: input.filename,
        path,
        size: buf.length,
        checksum,
        runId: input.runId,
        webViewLink: data.webViewLink,
        alreadyExisted: false,
      };
      this.remember(record);
      return record;
    }

    const record: DriveFileRecord = {
      id: newId("drive"),
      name: input.filename,
      path,
      size: buf.length,
      checksum,
      runId: input.runId,
      alreadyExisted: false,
    };
    this.remember(record);
    return record;
  }

  private remember(record: DriveFileRecord) {
    this.files.set(record.id, record);
    const list = this.byRunId.get(record.runId) ?? [];
    if (!list.some((f) => f.id === record.id)) {
      list.push(record);
      this.byRunId.set(record.runId, list);
    }
  }

  async findByRunId(runId: string): Promise<DriveFileRecord[]> {
    assertDriveActionAllowed("files.list");
    return this.byRunId.get(runId) ?? [];
  }

  async reconcileManifest(
    runId: string,
    expectedNames: string[],
  ): Promise<{ missing: string[]; present: string[] }> {
    const files = await this.findByRunId(runId);
    const names = new Set(files.map((f) => f.name));
    return {
      missing: expectedNames.filter((n) => !names.has(n)),
      present: expectedNames.filter((n) => names.has(n)),
    };
  }

  /** Explicitly absent — delete must never be implemented. */
  delete = undefined;
  trash = undefined;
}

export function createMockDriveClient(): DriveClient {
  return new DriveClient({ mode: "mock" });
}

export function createDriveClient(opts?: DriveClientOptions): DriveClient {
  return new DriveClient(opts ?? { mode: "mock" });
}

/** @deprecated Prefer DriveClient.uploadAuditFile — kept for call-site clarity */
export function assertNoDriveOverwrite(existingId: string | null | undefined) {
  assertDriveNoOverwrite(existingId);
}
