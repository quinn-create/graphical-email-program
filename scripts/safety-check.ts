/**
 * MatterMail Review safety-check
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  assertClioRequestAllowed,
  assertGmailReadonlyScopes,
  SecurityViolationError,
} from "@mattermail/security";
import { GMAIL_READONLY_SCOPE, FORBIDDEN_GMAIL_SCOPES } from "@mattermail/shared";

const root = join(import.meta.dirname, "..");
const failures: string[] = [];

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (["node_modules", "dist", "out", "release", ".git"].includes(name)) continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(ts|tsx|js|mjs|cjs|md|json)$/.test(name)) acc.push(p);
  }
  return acc;
}

const files = walk(root);

try {
  assertGmailReadonlyScopes([GMAIL_READONLY_SCOPE]);
} catch (e) {
  failures.push(`Gmail readonly assert failed: ${e}`);
}

for (const scope of FORBIDDEN_GMAIL_SCOPES) {
  try {
    assertGmailReadonlyScopes([GMAIL_READONLY_SCOPE, scope]);
    failures.push(`Expected rejection for ${scope}`);
  } catch (e) {
    if (!(e instanceof SecurityViolationError)) failures.push(`Wrong error for ${scope}`);
  }
}

try {
  assertClioRequestAllowed({ method: "DELETE", path: "/api/v4/matters/1" });
  failures.push("Clio DELETE was allowed");
} catch {
  /* expected */
}

try {
  assertClioRequestAllowed({ method: "PATCH", path: "/api/v4/communications/1" });
  failures.push("Clio PATCH was allowed");
} catch {
  /* expected */
}

const secretPatterns = [
  /sk-[A-Za-z0-9]{20,}/,
  /AIza[0-9A-Za-z\-_]{20,}/,
  /client_secret["']?\s*[:=]\s*["'][^"']+["']/,
];

const allowDocs = /mattermail-core|SECURITY|enums|gmail-scopes|safety-check|GMAIL_CONNECTOR|security\.test|IMPLEMENTATION|PRODUCT_SPEC|AI_PRIVACY|README/;

for (const file of files) {
  const rel = relative(root, file);
  if (rel.includes("safety-check") || rel.includes(".env.example")) continue;
  const text = readFileSync(file, "utf8");

  // Flag OAuth scope strings / API mutation — not https://mail.google.com view links
  if (
    (/googleapis\.com\/auth\/gmail\.(modify|send|compose)/.test(text) ||
      /https:\/\/mail\.google\.com\/$/.test(text) ||
      /scope.*mail\.google\.com/.test(text)) &&
    !allowDocs.test(rel)
  ) {
    if (!/never|forbidden|do not|MUST NOT|readonly only|FORBIDDEN|Forbidden/i.test(text)) {
      failures.push(`Possible broad Gmail scope reference in ${rel}`);
    }
  }

  if (/\bnodeIntegration\s*:\s*true\b/.test(text)) {
    failures.push(`nodeIntegration true in ${rel}`);
  }
  if (/\bcontextIsolation\s*:\s*false\b/.test(text)) {
    failures.push(`contextIsolation false in ${rel}`);
  }

  if (/files\.delete|emptyTrash|\.trash\(/.test(text) && rel.includes("packages/drive")) {
    failures.push(`Drive delete/trash API in ${rel}`);
  }

  for (const pat of secretPatterns) {
    if (pat.test(text) && !rel.endsWith(".example")) {
      failures.push(`Possible secret material in ${rel}`);
    }
  }
}

const mainPath = join(root, "apps/desktop/src/main/index.ts");
const main = readFileSync(mainPath, "utf8");
if (!/contextIsolation:\s*true/.test(main)) failures.push("main missing contextIsolation: true");
if (!/nodeIntegration:\s*false/.test(main)) failures.push("main missing nodeIntegration: false");

if (failures.length) {
  console.error("safety-check FAILED:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("safety-check passed");
