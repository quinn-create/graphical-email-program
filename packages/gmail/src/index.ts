import {
  assertGmailReadonlyScopes,
  getAllowedGmailScopes,
  SecurityViolationError,
} from "@mattermail/security";
import { GMAIL_READONLY_SCOPE } from "@mattermail/shared";

export interface GmailMessageSummary {
  id: string;
  threadId: string;
  subject: string;
  snippet: string;
  internalDate: number;
  direction: "sent" | "received";
  from: string;
  labelIds: string[];
}

export interface GmailConnector {
  getScopes(): readonly string[];
  authorizeUrl(state: string): string;
  listMessages(opts: {
    afterMs?: number;
    beforeMs?: number;
    includeSpamTrash?: boolean;
  }): Promise<GmailMessageSummary[]>;
  getMessage(id: string): Promise<GmailMessageSummary & { bodyText: string }>;
  openInGmailUrl(messageId: string): string;
}

/** Mutation method names that must never exist on the adapter. */
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

export function createMockGmailConnector(messages: GmailMessageSummary[] = []): GmailConnector {
  assertGmailReadonlyScopes([...getAllowedGmailScopes()]);
  return {
    getScopes() {
      return getAllowedGmailScopes();
    },
    authorizeUrl(state: string) {
      return `https://accounts.google.com/o/oauth2/v2/auth?scope=${encodeURIComponent(GMAIL_READONLY_SCOPE)}&state=${encodeURIComponent(state)}&response_type=code&access_type=offline`;
    },
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
      return { ...m, bodyText: m.snippet };
    },
    openInGmailUrl(messageId: string) {
      return `https://mail.google.com/mail/u/0/#inbox/${messageId}`;
    },
  };
}

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

export function createLiveGmailConnectorSkeleton(opts: {
  clientId: string;
  clientSecret?: string;
}): GmailConnector {
  // Validates scopes at construction; live HTTP uses readonly only.
  assertGmailReadonlyScopes([GMAIL_READONLY_SCOPE]);
  void opts;
  return createMockGmailConnector([]);
}
