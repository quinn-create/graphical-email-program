import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export function hashBuffer(buf: Buffer): string {
  return createHash("sha256").update(buf).digest("hex");
}

export function hashFile(path: string): string {
  return hashBuffer(readFileSync(path));
}

export interface ExtractionResult {
  method: "local" | "none";
  text: string;
  pageTexts: Array<{ pageNumber: number; text: string; hasMeaningfulText: boolean }>;
  warnings: string[];
}

const MEANINGFUL_MIN_CHARS = 40;

export function hasMeaningfulText(text: string): boolean {
  const cleaned = text.replace(/\s+/g, " ").trim();
  return cleaned.length >= MEANINGFUL_MIN_CHARS;
}

/** Local text extraction for common formats. PDF binary parsing is best-effort. */
export function extractTextLocally(
  filename: string,
  content: Buffer | string,
): ExtractionResult {
  const name = filename.toLowerCase();
  const buf = typeof content === "string" ? Buffer.from(content) : content;
  const warnings: string[] = [];

  if (name.endsWith(".txt") || name.endsWith(".csv") || name.endsWith(".md")) {
    const text = buf.toString("utf8");
    return {
      method: "local",
      text,
      pageTexts: [{ pageNumber: 1, text, hasMeaningfulText: hasMeaningfulText(text) }],
      warnings,
    };
  }

  if (name.endsWith(".html") || name.endsWith(".htm") || name.endsWith(".eml")) {
    const raw = buf.toString("utf8");
    const text = raw
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return {
      method: "local",
      text,
      pageTexts: [{ pageNumber: 1, text, hasMeaningfulText: hasMeaningfulText(text) }],
      warnings,
    };
  }

  if (name.endsWith(".docx")) {
    // DOCX is a zip; without unzip dep in minimal path, extract readable UTF-8 strings
    const text = extractUtf8Strings(buf);
    warnings.push("DOCX extracted via string scan; prefer dedicated parser when packaging");
    return {
      method: "local",
      text,
      pageTexts: [{ pageNumber: 1, text, hasMeaningfulText: hasMeaningfulText(text) }],
      warnings,
    };
  }

  if (name.endsWith(".pdf")) {
    const text = extractPdfTextRough(buf);
    const meaningful = hasMeaningfulText(text);
    if (!meaningful) {
      warnings.push("PDF appears image-only or poorly extractable — OCR may be required");
    }
    return {
      method: meaningful ? "local" : "none",
      text,
      pageTexts: splitPdfPages(text),
      warnings,
    };
  }

  // Fallback: treat as text
  const text = buf.toString("utf8");
  return {
    method: "local",
    text,
    pageTexts: [{ pageNumber: 1, text, hasMeaningfulText: hasMeaningfulText(text) }],
    warnings: ["Unknown format — treated as text"],
  };
}

function extractUtf8Strings(buf: Buffer): string {
  const parts: string[] = [];
  let current = "";
  for (const byte of buf) {
    if (byte >= 32 && byte < 127) {
      current += String.fromCharCode(byte);
    } else if (current.length >= 4) {
      parts.push(current);
      current = "";
    } else {
      current = "";
    }
  }
  if (current.length >= 4) parts.push(current);
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function extractPdfTextRough(buf: Buffer): string {
  // Extract text between Tj / TJ operators and parentheses streams — fictional/demo PDFs may be plain text
  const asString = buf.toString("latin1");
  if (!asString.includes("%PDF")) {
    // Not a real PDF header — treat entire buffer as text (demo fixtures)
    return buf.toString("utf8");
  }
  const matches = [...asString.matchAll(/\(([^\\()]{2,})\)\s*Tj/g)].map((m) => m[1] ?? "");
  if (matches.length > 0) return matches.join(" ");
  return extractUtf8Strings(buf);
}

function splitPdfPages(text: string): ExtractionResult["pageTexts"] {
  const pages = text.split(/Page\s+\d+\s+of\s+\d+/i);
  if (pages.length <= 1) {
    return [{ pageNumber: 1, text, hasMeaningfulText: hasMeaningfulText(text) }];
  }
  return pages
    .map((p, i) => ({
      pageNumber: i + 1,
      text: p.trim(),
      hasMeaningfulText: hasMeaningfulText(p),
    }))
    .filter((p) => p.text.length > 0);
}

export interface EntityExtraction {
  people: string[];
  organizations: string[];
  emailAddresses: string[];
  phoneNumbers: string[];
  caseNumbers: string[];
  docketNumbers: string[];
  warrantNumbers: string[];
  counties: string[];
  courts: string[];
  dates: string[];
  charges: string[];
  captions: string[];
  attorneyNames: string[];
}

export function extractEntitiesLocally(text: string): EntityExtraction {
  const emailAddresses = unique(text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []);
  const phoneNumbers = unique(
    text.match(/\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g) ?? [],
  );
  const docketNumbers = unique(text.match(/\b\d{2}-GS-\d+\b/gi) ?? []);
  const caseNumbers = unique([
    ...docketNumbers,
    ...(text.match(/\b(?:JV|CR|CV)-\d{2}-\d+\b/gi) ?? []),
    ...(text.match(/\b\d{2}-[A-Z]{2}-\d+\b/g) ?? []),
  ]);
  const warrantNumbers = unique(text.match(/\bW-\d{4}-\d+\b/g) ?? []);
  const counties = unique(
    text.match(/\b(Davidson|Shelby|Knox|Hamilton|Williamson)\s+County\b/gi) ?? [],
  );
  const courts = unique(
    text.match(/\b(General Sessions|Juvenile Court|Circuit Court|Criminal Court)\b/gi) ?? [],
  );
  const dates = unique(
    text.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\b/gi) ?? [],
  );
  const people: string[] = [];
  const nameMatches = text.matchAll(/\b([A-Z][a-z]+\s+[A-Z][a-z]+)\b/g);
  for (const m of nameMatches) {
    if (m[1] && !/County|Court|State|Sessions/.test(m[1])) people.push(m[1]);
  }
  if (/\bA\.M\./.test(text)) people.push("A.M.");

  return {
    people: unique(people).slice(0, 20),
    organizations: [],
    emailAddresses,
    phoneNumbers,
    caseNumbers,
    docketNumbers,
    warrantNumbers,
    counties,
    courts,
    dates,
    charges: [],
    captions: [],
    attorneyNames: [],
  };
}

function unique(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()).filter(Boolean))];
}
