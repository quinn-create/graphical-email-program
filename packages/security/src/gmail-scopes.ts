import {
  DRIVE_FILE_SCOPE,
  FORBIDDEN_GMAIL_SCOPES,
  GMAIL_READONLY_SCOPE,
} from "@mattermail/shared";

export class SecurityViolationError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "SecurityViolationError";
  }
}

/** Validate Gmail OAuth scopes — readonly only. */
export function assertGmailReadonlyScopes(scopes: string[]): void {
  const normalized = scopes.map((s) => s.trim()).filter(Boolean);
  for (const scope of normalized) {
    if ((FORBIDDEN_GMAIL_SCOPES as readonly string[]).includes(scope)) {
      throw new SecurityViolationError(
        `Forbidden Gmail scope requested: ${scope}`,
        "GMAIL_FORBIDDEN_SCOPE",
      );
    }
  }
  if (!normalized.includes(GMAIL_READONLY_SCOPE)) {
    throw new SecurityViolationError(
      `Gmail must request exactly ${GMAIL_READONLY_SCOPE}`,
      "GMAIL_MISSING_READONLY",
    );
  }
  const extras = normalized.filter((s) => s !== GMAIL_READONLY_SCOPE);
  if (extras.length > 0) {
    throw new SecurityViolationError(
      `Gmail scopes beyond readonly are not allowed: ${extras.join(", ")}`,
      "GMAIL_EXTRA_SCOPE",
    );
  }
}

export function getAllowedGmailScopes(): readonly string[] {
  return [GMAIL_READONLY_SCOPE];
}

export function getAllowedDriveScopes(): readonly string[] {
  return [DRIVE_FILE_SCOPE];
}
