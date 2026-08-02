import { shell } from "electron";
import { SecretStore, type SecretStoreCrypto } from "@mattermail/security";
import {
  createLiveGmailConnector,
  createMockGmailConnector,
  type GmailConnector,
  type GmailTokenSet,
} from "@mattermail/gmail";
import { ClioClient, createMockClioClient, type ClioMatterDto, type ClioTokenSet } from "@mattermail/clio";
import { createDriveClient, createMockDriveClient, type DriveClient, type DriveTokenSet } from "@mattermail/drive";

export type ConnectorId = "gmail" | "clio" | "drive";

export type ConnectorStatus = {
  id: ConnectorId;
  label: string;
  connected: boolean;
  mode: "mock" | "live";
  accountLabel: string | null;
  detail: string;
};

type TokenBundle = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
  email?: string;
};

const TOKEN_KEYS = {
  gmail: "oauth.gmail.tokens",
  clio: "oauth.clio.tokens",
  drive: "oauth.drive.tokens",
} as const;

const CLIENT_KEYS = {
  googleClientId: "oauth.google.client_id",
  googleClientSecret: "oauth.google.client_secret",
  clioClientId: "oauth.clio.client_id",
  clioClientSecret: "oauth.clio.client_secret",
  driveAuditFolderId: "oauth.drive.audit_folder_id",
} as const;

export class ConnectorManager {
  private secrets: SecretStore;
  gmail: GmailConnector;
  clio: ClioClient;
  drive: DriveClient;
  gmailEmail: string | null = null;
  private demoMatters: ClioMatterDto[];

  constructor(
    secretsDir: string,
    crypto: SecretStoreCrypto | null,
    demoMatters: ClioMatterDto[],
  ) {
    this.secrets = new SecretStore(secretsDir, crypto);
    this.demoMatters = demoMatters;
    this.gmail = createMockGmailConnector([]);
    this.clio = createMockClioClient(demoMatters);
    this.drive = createMockDriveClient();
    this.hydrateFromSecrets();
  }

  private loadJson<T>(key: string): T | null {
    const raw = this.secrets.load(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private saveJson(key: string, value: unknown) {
    this.secrets.save(key, JSON.stringify(value));
  }

  hydrateFromSecrets() {
    const gmailTokens = this.loadJson<TokenBundle>(TOKEN_KEYS.gmail);
    if (gmailTokens?.accessToken) {
      this.gmail = createLiveGmailConnector({
        accessToken: gmailTokens.accessToken,
        refreshToken: gmailTokens.refreshToken,
        expiresAt: gmailTokens.expiresAt,
        scope: gmailTokens.scope,
      });
      this.gmailEmail = gmailTokens.email ?? null;
    }

    const clioTokens = this.loadJson<TokenBundle>(TOKEN_KEYS.clio);
    if (clioTokens?.accessToken) {
      this.clio = new ClioClient({
        demo: false,
        tokens: {
          accessToken: clioTokens.accessToken,
          refreshToken: clioTokens.refreshToken,
          expiresAt: clioTokens.expiresAt,
        },
        clientId: this.secrets.load(CLIENT_KEYS.clioClientId) ?? undefined,
        clientSecret: this.secrets.load(CLIENT_KEYS.clioClientSecret) ?? undefined,
        matters: this.demoMatters,
      });
    }

    const driveTokens = this.loadJson<TokenBundle>(TOKEN_KEYS.drive);
    if (driveTokens?.accessToken) {
      this.drive = createDriveClient({
        mode: "live",
        tokens: {
          accessToken: driveTokens.accessToken,
          refreshToken: driveTokens.refreshToken,
          expiresAt: driveTokens.expiresAt,
          scope: driveTokens.scope,
        },
        clientId: this.secrets.load(CLIENT_KEYS.googleClientId) ?? undefined,
        clientSecret: this.secrets.load(CLIENT_KEYS.googleClientSecret) ?? undefined,
        auditFolderId: this.secrets.load(CLIENT_KEYS.driveAuditFolderId) ?? undefined,
      });
    }
  }

  saveClientCredentials(input: {
    googleClientId?: string;
    googleClientSecret?: string;
    clioClientId?: string;
    clioClientSecret?: string;
    driveAuditFolderId?: string;
  }) {
    if (input.googleClientId !== undefined) {
      if (input.googleClientId) this.secrets.save(CLIENT_KEYS.googleClientId, input.googleClientId);
      else this.secrets.remove(CLIENT_KEYS.googleClientId);
    }
    if (input.googleClientSecret !== undefined) {
      if (input.googleClientSecret) this.secrets.save(CLIENT_KEYS.googleClientSecret, input.googleClientSecret);
      else this.secrets.remove(CLIENT_KEYS.googleClientSecret);
    }
    if (input.clioClientId !== undefined) {
      if (input.clioClientId) this.secrets.save(CLIENT_KEYS.clioClientId, input.clioClientId);
      else this.secrets.remove(CLIENT_KEYS.clioClientId);
    }
    if (input.clioClientSecret !== undefined) {
      if (input.clioClientSecret) this.secrets.save(CLIENT_KEYS.clioClientSecret, input.clioClientSecret);
      else this.secrets.remove(CLIENT_KEYS.clioClientSecret);
    }
    if (input.driveAuditFolderId !== undefined) {
      if (input.driveAuditFolderId) {
        this.secrets.save(CLIENT_KEYS.driveAuditFolderId, input.driveAuditFolderId);
        this.drive.setAuditFolderId(input.driveAuditFolderId);
      } else {
        this.secrets.remove(CLIENT_KEYS.driveAuditFolderId);
      }
    }
  }

  getClientCredentialHints() {
    const mask = (k: string) => {
      const v = this.secrets.load(k);
      return v ? `${v.slice(0, 4)}••••` : null;
    };
    return {
      googleClientId: mask(CLIENT_KEYS.googleClientId),
      googleClientSecret: this.secrets.has(CLIENT_KEYS.googleClientSecret) ? "••••saved" : null,
      clioClientId: mask(CLIENT_KEYS.clioClientId),
      clioClientSecret: this.secrets.has(CLIENT_KEYS.clioClientSecret) ? "••••saved" : null,
      driveAuditFolderId: this.secrets.load(CLIENT_KEYS.driveAuditFolderId),
    };
  }

  status(): ConnectorStatus[] {
    return [
      {
        id: "gmail",
        label: "Gmail",
        connected: this.gmail.mode === "live",
        mode: this.gmail.mode,
        accountLabel: this.gmailEmail,
        detail: this.gmail.mode === "live" ? "Read-only scope connected" : "Using Demo / Mock adapter",
      },
      {
        id: "clio",
        label: "Clio Manage",
        connected: this.clio.mode === "live",
        mode: this.clio.mode,
        accountLabel: this.clio.mode === "live" ? "Connected" : null,
        detail: this.clio.mode === "live" ? "Live index + staged writes" : "Using Demo / Mock adapter",
      },
      {
        id: "drive",
        label: "Google Drive",
        connected: this.drive.mode === "live",
        mode: this.drive.mode,
        accountLabel: this.drive.mode === "live" ? "Connected" : null,
        detail:
          this.drive.mode === "live"
            ? "Audit upload scope connected"
            : "Using Demo / Mock adapter",
      },
    ];
  }

  /** Live mode when any real connector is connected; otherwise demo. */
  isDemoMode(): boolean {
    return this.gmail.mode === "mock" && this.clio.mode === "mock" && this.drive.mode === "mock";
  }

  async connect(id: ConnectorId): Promise<ConnectorStatus> {
    const openExternal = async (url: string) => {
      await shell.openExternal(url);
    };

    if (id === "gmail") {
      const clientId = this.secrets.load(CLIENT_KEYS.googleClientId);
      if (!clientId) throw new Error("Save a Google OAuth Client ID in Settings first");
      const clientSecret = this.secrets.load(CLIENT_KEYS.googleClientSecret) ?? undefined;
      const live = createLiveGmailConnector();
      const tokens = await live.authorize({ clientId, clientSecret, openExternal });
      this.gmail = live;
      this.gmailEmail = tokens.email;
      this.saveJson(TOKEN_KEYS.gmail, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope,
        email: tokens.email,
      } satisfies TokenBundle);
      return this.status().find((s) => s.id === "gmail")!;
    }

    if (id === "clio") {
      const clientId = this.secrets.load(CLIENT_KEYS.clioClientId);
      const clientSecret = this.secrets.load(CLIENT_KEYS.clioClientSecret);
      if (!clientId || !clientSecret) {
        throw new Error("Save Clio Client ID and Client Secret in Settings first");
      }
      const client = new ClioClient({ demo: true, matters: this.demoMatters });
      const tokens = await client.authorize({ clientId, clientSecret, openExternal });
      this.clio = client;
      this.saveJson(TOKEN_KEYS.clio, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      } satisfies TokenBundle);
      return this.status().find((s) => s.id === "clio")!;
    }

    if (id === "drive") {
      const clientId = this.secrets.load(CLIENT_KEYS.googleClientId);
      if (!clientId) throw new Error("Save a Google OAuth Client ID in Settings first");
      const clientSecret = this.secrets.load(CLIENT_KEYS.googleClientSecret) ?? undefined;
      const folderId = this.secrets.load(CLIENT_KEYS.driveAuditFolderId) ?? undefined;
      const client = createDriveClient({
        mode: "mock",
        clientId,
        clientSecret,
        auditFolderId: folderId,
      });
      const tokens = await client.authorize({ clientId, clientSecret, openExternal });
      this.drive = client;
      this.saveJson(TOKEN_KEYS.drive, {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
        scope: tokens.scope,
      } satisfies TokenBundle);
      return this.status().find((s) => s.id === "drive")!;
    }

    throw new Error(`Unknown connector: ${id}`);
  }

  disconnect(id: ConnectorId): ConnectorStatus {
    if (id === "gmail") {
      this.secrets.remove(TOKEN_KEYS.gmail);
      this.gmail = createMockGmailConnector([]);
      this.gmailEmail = null;
    } else if (id === "clio") {
      this.secrets.remove(TOKEN_KEYS.clio);
      this.clio = createMockClioClient(this.demoMatters);
    } else if (id === "drive") {
      this.secrets.remove(TOKEN_KEYS.drive);
      this.drive = createMockDriveClient();
      const folderId = this.secrets.load(CLIENT_KEYS.driveAuditFolderId);
      if (folderId) this.drive.setAuditFolderId(folderId);
    }
    return this.status().find((s) => s.id === id)!;
  }

  /** Persist refreshed tokens after API use (best-effort). */
  persistGmailTokens(tokens: GmailTokenSet & { email?: string | null }) {
    this.saveJson(TOKEN_KEYS.gmail, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      scope: tokens.scope,
      email: tokens.email ?? this.gmailEmail ?? undefined,
    });
  }

  persistClioTokens(tokens: ClioTokenSet) {
    this.saveJson(TOKEN_KEYS.clio, {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
    });
  }

  persistDriveTokens(tokens: DriveTokenSet) {
    this.saveJson(TOKEN_KEYS.drive, tokens);
  }
}
