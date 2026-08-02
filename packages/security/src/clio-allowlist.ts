import { z } from "zod";
import { SecurityViolationError } from "./gmail-scopes.js";

/**
 * Clio runtime allowlist — version 1.
 * GET for authorized index reads; POST only for new communications and documents.
 * DELETE is always rejected. PATCH against existing records is rejected.
 */
export const ClioHttpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);
export type ClioHttpMethod = z.infer<typeof ClioHttpMethodSchema>;

export interface ClioAllowlistRequest {
  method: ClioHttpMethod;
  path: string;
}

/** Paths relative to Clio API base, without query string. */
const ALLOWED_GET_PREFIXES = [
  "/api/v4/matters",
  "/api/v4/contacts",
  "/api/v4/users",
  "/api/v4/custom_fields",
  "/api/v4/practice_areas",
  "/api/v4/communications",
  "/api/v4/documents",
  "/api/v4/document_categories",
  "/api/v4/document_versions",
] as const;

const ALLOWED_POST_EXACT = [
  "/api/v4/communications",
  "/api/v4/documents",
] as const;

const ALLOWED_POST_PREFIXES = [
  "/api/v4/documents/", // upload sequence (versions, multipart) after docs confirmation
] as const;

function normalizePath(path: string): string {
  const withoutQuery = path.split("?")[0] ?? path;
  if (!withoutQuery.startsWith("/")) {
    return `/${withoutQuery}`;
  }
  return withoutQuery.replace(/\/+$/, "") || "/";
}

export function assertClioRequestAllowed(req: ClioAllowlistRequest): void {
  const method = req.method.toUpperCase() as ClioHttpMethod;
  const path = normalizePath(req.path);

  if (method === "DELETE") {
    throw new SecurityViolationError(
      `Clio DELETE is forbidden: ${path}`,
      "CLIO_DELETE_FORBIDDEN",
    );
  }

  if (method === "PATCH") {
    throw new SecurityViolationError(
      `Clio PATCH is forbidden in v1: ${path}`,
      "CLIO_PATCH_FORBIDDEN",
    );
  }

  if (method === "PUT") {
    throw new SecurityViolationError(
      `Clio PUT is forbidden in v1: ${path}`,
      "CLIO_PUT_FORBIDDEN",
    );
  }

  if (method === "GET") {
    const ok = ALLOWED_GET_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    );
    if (!ok) {
      throw new SecurityViolationError(
        `Clio GET path not allowlisted: ${path}`,
        "CLIO_GET_NOT_ALLOWED",
      );
    }
    return;
  }

  if (method === "POST") {
    const exact = (ALLOWED_POST_EXACT as readonly string[]).includes(path);
    const prefix = ALLOWED_POST_PREFIXES.some((p) => path.startsWith(p));
    // Document upload sequence may POST to /api/v4/documents/:id/versions etc.
    if (exact || prefix) {
      // Still reject any path containing delete-like segments
      if (/delete|trash|destroy/i.test(path)) {
        throw new SecurityViolationError(
          `Clio POST path looks destructive: ${path}`,
          "CLIO_POST_DESTRUCTIVE",
        );
      }
      return;
    }
    throw new SecurityViolationError(
      `Clio POST path not allowlisted: ${path}`,
      "CLIO_POST_NOT_ALLOWED",
    );
  }

  throw new SecurityViolationError(
    `Clio method not allowlisted: ${method}`,
    "CLIO_METHOD_NOT_ALLOWED",
  );
}

export function getClioAllowlistSummary(): {
  allowedGetPrefixes: readonly string[];
  allowedPostExact: readonly string[];
  forbiddenMethods: readonly string[];
} {
  return {
    allowedGetPrefixes: ALLOWED_GET_PREFIXES,
    allowedPostExact: ALLOWED_POST_EXACT,
    forbiddenMethods: ["DELETE", "PATCH", "PUT"],
  };
}
