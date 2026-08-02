import { SecurityViolationError } from "./gmail-scopes.js";

/**
 * Quest module must never expose login, submit, or write operations.
 */
const FORBIDDEN_QUEST_OPS = [
  "login",
  "authenticate",
  "password",
  "submit",
  "file",
  "write",
  "update",
  "delete",
  "mfa",
  "captcha",
] as const;

export function assertQuestOperationAllowed(operation: string): void {
  const lower = operation.toLowerCase();
  for (const forbidden of FORBIDDEN_QUEST_OPS) {
    if (lower.includes(forbidden)) {
      throw new SecurityViolationError(
        `Quest operation forbidden: ${operation}`,
        "QUEST_OP_FORBIDDEN",
      );
    }
  }
}

export const QUEST_ALLOWED_OPERATIONS = [
  "detect",
  "openEmailInGmail",
  "openLinkInBrowser",
  "importPdf",
  "importRecentPdf",
  "chooseDownloadFolder",
  "analyzeOcr",
  "assignMatter",
] as const;
