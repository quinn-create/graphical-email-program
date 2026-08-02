import {
  assertGmailReadonlyScopes,
  getAllowedGmailScopes,
  SecurityViolationError,
  runOAuthLoopback,
  exchangeAuthorizationCode,
  refreshAccessToken,
} from "@mattermail/security";
import { GMAIL_READONLY_SCOPE } from "@mattermail/shared";

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  subject: string;
  snippet: string;
  bodyText?: string;
  internalDate: number;
  direction: "sent" | "received";
  from: string;
  labelIds: string[];
}

export interface GmailTokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  scope?: string;
}

export interface GmailConnector {
  readonly mode: "mock" | "live";
  getScopes(): readonly string[];
  getAccountEmail(): Promise<string | null>;
  authorize(opts: {
    clientId: string;
    clientSecret?: string;
    openExternal: (url: string) => Promise<void>;
  }): Promise<GmailTokenSet & { email: string | null }>;
  setTokens(tokens: GmailTokenSet): void;
  listMessages(opts: {
    afterMs?: number;
    beforeMs?: number;
    includeSpamTrash?: boolean;
  }): Promise<GmailMessageSummary[]>;
  getMessage(id: string): Promise<GmailMessageSummary & { bodyText: string }>;
  openInGmailUrl(messageId: string): string;
}

export const GMAIL_FORBIDDEN_METHODS = [
  "delete",
  "trash",
  "modify",
  "send",
  "createDraft",
  "addLabels",
  "removeLabels",
  "markRead",
  "markUnread",
  "archive",
] as const;

export function assertNoGmailMutations(adapter: object): void {
  for (const method of GMAIL_FORBIDDEN_METHODS) {
    if (method in adapter && typeof (adapter as Record<string, unknown>)[method] === "function") {
      throw new SecurityViolationError(
        `Gmail adapter exposes forbidden mutation method: ${method}`,
        "GMAIL_MUTATION_METHOD",
      );
    }
  }
}

export function createMockGmailConnector(
  messages: GmailMessageSummary[] = [],
  accountEmail = "demo@mattermail.local",
): GmailConnector {
  assertGmailReadonlyScopes([...getAllowedGmailScopes()]);
  return {
    mode: "mock",
    getScopes() {
      return getAllowedGmailScopes();
    },
    async getAccountEmail() {
      return accountEmail;
    },
    async authorize() {
      return {
        accessToken: "mock-access",
        refreshToken: "mock-refresh",
        email: accountEmail,
        scope: GMAIL_READONLY_SCOPE,
      };
    },
    setTokens() {},
    async listMessages(opts) {
      return messages.filter((m) => {
        if (opts.afterMs && m.internalDate < opts.afterMs) return false;
        if (opts.beforeMs && m.internalDate > opts.beforeMs) return false;
        if (!opts.includeSpamTrash) {
          if (m.labelIds.includes("SPAM") || m.labelIds.includes("TRASH")) return false;
        }
        return true;
      });
    },
    async getMessage(id: string) {
      const m = messages.find((x) => x.id === id);
      if (!m) throw new Error(`Message not found: ${id}`);
      return { ...m, bodyText: m.bodyText ?? m.snippet };
    },
    openInGmailUrl(messageId: string) {
      return `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
    },
  };
}

export function createLiveGmailConnector(initial?: GmailTokenSet): GmailConnector {
  assertGmailReadonlyScopes([GMAIL_READONLY_SCOPE]);
  let tokens: GmailTokenSet | null = initial ?? null;
  let clientId = "";
  let clientSecret: string | undefined;

  async function ensureAccessToken(): Promise<string> {
    if (!tokens?.accessToken) throw new Error("Gmail not connected");
    if (tokens.expiresAt && Date.now() > tokens.expiresAt - 60_000 && tokens.refreshToken) {
      const refreshed = await refreshAccessToken({
        tokenUrl: "https://oauth2.googleapis.com/token",
        clientId,
        clientSecret,
        refreshToken: tokens.refreshToken,
      });
      tokens = {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token ?? tokens.refreshToken,
        expiresAt: refreshed.expires_in
          ? Date.now() + refreshed.expires_in * 1000
          : tokens.expiresAt,
        scope: refreshed.scope ?? tokens.scope,
      };
      if (tokens.scope) assertGmailReadonlyScopes(tokens.scope.split(/\s+/));
    }
    return tokens.accessToken;
  }

  async function gmailGet<T>(path: string, query?: Record<string, string>): Promise<T> {
    const access = await ensureAccessToken();
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/${path}`);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${access}` } });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Gmail API ${res.status}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as T;
  }

  const connector: GmailConnector = {
    mode: "live",
    getScopes() {
      return getAllowedGmailScopes();
    },
    async getAccountEmail() {
      const profile = await gmailGet<{ emailAddress?: string }>("users/me/profile");
      return profile.emailAddress ?? null;
    },
    async authorize(opts) {
      clientId = opts.clientId;
      clientSecret = opts.clientSecret;
      assertGmailReadonlyScopes([GMAIL_READONLY_SCOPE]);
      const loopback = await runOAuthLoopback({
        authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        clientId: opts.clientId,
        scopes: [GMAIL_READONLY_SCOPE],
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
      if (token.scope) assertGmailReadonlyScopes(token.scope.split(/\s+/));
      else assertGmailReadonlyScopes([GMAIL_READONLY_SCOPE]);
      tokens = {
        accessToken: token.access_token,
        refreshToken: token.refresh_token,
        expiresAt: token.expires_in ? Date.now() + token.expires_in * 1000 : undefined,
        scope: token.scope ?? GMAIL_READONLY_SCOPE,
      };
      const email = await connector.getAccountEmail();
      return { ...tokens, email };
    },
    setTokens(next) {
      tokens = next;
      if (next.scope) assertGmailReadonlyScopes(next.scope.split(/\s+/));
    },
    async listMessages(opts) {
      const afterEpoch = opts.afterMs ? Math.floor(opts.afterMs / 1000) : undefined;
      const beforeEpoch = opts.beforeMs ? Math.floor(opts.beforeMs / 1000) : undefined;
      const queryParts = opts.includeSpamTrash ? [] : ["-in:spam", "-in:trash"];
      if (afterEpoch) queryParts.push(`after:${afterEpoch}`);
      if (beforeEpoch) queryParts.push(`before:${beforeEpoch}`);
      const list = await gmailGet<{ messages?: Array<{ id: string }> }>("users/me/messages", {
        q: queryParts.join(" "),
        maxResults: "50",
      });
      const out: GmailMessageSummary[] = [];
      for (const m of list.messages ?? []) {
        out.push(await connector.getMessage(m.id));
      }
      return out;
    },
    async getMessage(id: string) {
      const msg = await gmailGet<{
        id: string;
        threadId: string;
        snippet?: string;
        internalDate?: string;
        labelIds?: string[];
        payload?: {
          headers?: Array<{ name: string; value: string }>;
          body?: { data?: string };
          parts?: Array<{ mimeType?: string; body?: { data?: string } }>;
        };
      }>(`users/me/messages/${id}`, { format: "full" });
      const headers = msg.payload?.headers ?? [];
      const subject =
        headers.find((h) => h.name.toLowerCase() === "subject")?.value ?? "(no subject)";
      const from = headers.find((h) => h.name.toLowerCase() === "from")?.value ?? "";
      const labelIds = msg.labelIds ?? [];
      return {
        id: msg.id,
        threadId: msg.threadId,
        subject,
        snippet: msg.snippet ?? "",
        bodyText: extractBodyText(msg.payload) || msg.snippet || "",
        internalDate: Number(msg.internalDate ?? Date.now()),
        direction: labelIds.includes("SENT") ? "sent" : "received",
        from,
        labelIds,
      };
    },
    openInGmailUrl(messageId: string) {
      return `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
    },
  };

  return connector;
}

function extractBodyText(payload:
  | {
      body?: { data?: string };
      parts?: Array<{ mimeType?: string; body?: { data?: string } }>;
    }
  | undefined): string {
  if (!payload) return "";
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  for (const part of payload.parts ?? []) {
    if (part.mimeType === "text/plain" && part.body?.data) {
      return decodeBase64Url(part.body.data);
    }
  }
  for (const part of payload.parts ?? []) {
    if (part.mimeType === "text/html" && part.body?.data) {
      return decodeBase64Url(part.body.data).replace(/<[^>]+>/g, " ");
    }
  }
  return "";
}

function decodeBase64Url(data: string): string {
  const padded = data.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64").toString("utf8");
}

export function createGmailConnector(opts?: {
  mode?: "mock" | "live";
  messages?: GmailMessageSummary[];
  tokens?: GmailTokenSet;
}): GmailConnector {
  if (opts?.mode === "live" || opts?.tokens) return createLiveGmailConnector(opts.tokens);
  return createMockGmailConnector(opts?.messages ?? []);
}
