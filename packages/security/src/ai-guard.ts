import { SecurityViolationError } from "./gmail-scopes.js";

/** Ensure AI payloads never include OAuth tokens or credential material. */
const SECRET_PATTERNS = [
  /ya29\.[A-Za-z0-9_-]+/g, // Google access token-ish
  /sk-[A-Za-z0-9]{20,}/g,
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /client_secret/gi,
  /refresh_token/gi,
  /access_token/gi,
];

export function assertNoSecretsInAiPayload(payload: unknown): void {
  const text = JSON.stringify(payload);
  for (const pattern of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(text)) {
      throw new SecurityViolationError(
        "AI payload must not contain credentials or OAuth tokens",
        "AI_SECRET_LEAK",
      );
    }
  }
}

export function assertNoSilentFallback(opts: {
  fallbackEnabled: boolean;
  usedFallback: boolean;
  fallbackConfigured: boolean;
}): void {
  if (opts.usedFallback && !opts.fallbackEnabled) {
    throw new SecurityViolationError(
      "Silent AI model fallback is forbidden",
      "AI_SILENT_FALLBACK",
    );
  }
  if (opts.usedFallback && !opts.fallbackConfigured) {
    throw new SecurityViolationError(
      "Fallback used without configured ordered fallback list",
      "AI_FALLBACK_NOT_CONFIGURED",
    );
  }
}

export function assertExactModelRecorded(opts: {
  requestedModelId: string | null | undefined;
  actualModelId?: string | null;
}): void {
  if (!opts.requestedModelId || opts.requestedModelId.trim() === "") {
    throw new SecurityViolationError(
      "Requested exact model ID must be recorded for every AI request",
      "AI_MODEL_NOT_RECORDED",
    );
  }
}
