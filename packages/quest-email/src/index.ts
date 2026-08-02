import {
  assertQuestOperationAllowed,
  QUEST_ALLOWED_OPERATIONS,
} from "@mattermail/security";

export interface QuestDetectionRule {
  sender?: string;
  senderDomain?: string;
  subjectKeywords?: string[];
  bodyKeywords?: string[];
  urlDomains?: string[];
}

export interface QuestDetectionResult {
  isQuest: boolean;
  matchedRule?: string;
  links: Array<{ url: string; domain: string }>;
  caseIdentifiers: string[];
  possibleNames: string[];
}

const DEFAULT_RULES: QuestDetectionRule[] = [
  {
    senderDomain: "quest.example.gov",
    subjectKeywords: ["quest"],
    bodyKeywords: ["quest"],
    urlDomains: ["quest.example.gov"],
  },
];

export function detectQuestEmail(
  input: {
    fromEmail: string;
    subject: string;
    body: string;
  },
  rules: QuestDetectionRule[] = DEFAULT_RULES,
): QuestDetectionResult {
  assertQuestOperationAllowed("detect");
  const links = extractLinks(input.body);
  for (const rule of rules) {
    const domain = input.fromEmail.split("@")[1]?.toLowerCase();
    if (rule.sender && rule.sender.toLowerCase() !== input.fromEmail.toLowerCase()) continue;
    if (rule.senderDomain && domain !== rule.senderDomain.toLowerCase()) {
      // still allow URL-domain match
      const urlHit = links.some((l) =>
        (rule.urlDomains ?? []).some((d) => l.domain.endsWith(d)),
      );
      if (!urlHit) continue;
    }
    const subjectHit = (rule.subjectKeywords ?? []).some((k) =>
      input.subject.toLowerCase().includes(k.toLowerCase()),
    );
    const bodyHit = (rule.bodyKeywords ?? []).some((k) =>
      input.body.toLowerCase().includes(k.toLowerCase()),
    );
    if (subjectHit || bodyHit || (rule.senderDomain && domain === rule.senderDomain.toLowerCase())) {
      return {
        isQuest: true,
        matchedRule: rule.senderDomain ?? rule.sender ?? "custom",
        links,
        caseIdentifiers: extractCaseIds(input.body),
        possibleNames: extractPossibleNames(input.body),
      };
    }
  }
  return {
    isQuest: false,
    links,
    caseIdentifiers: [],
    possibleNames: [],
  };
}

export function validateQuestUrl(
  url: string,
  opts: { allowInsecureHttp?: boolean; knownDomains?: string[] } = {},
): { ok: boolean; domain: string; warnings: string[] } {
  assertQuestOperationAllowed("openLinkInBrowser");
  const warnings: string[] = [];
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, domain: "", warnings: ["Invalid URL"] };
  }
  if (parsed.protocol !== "https:") {
    if (!opts.allowInsecureHttp) {
      return { ok: false, domain: parsed.hostname, warnings: ["URL must use HTTPS"] };
    }
    warnings.push("Insecure HTTP allowed by explicit user override");
  }
  const known = opts.knownDomains ?? ["quest.example.gov"];
  if (!known.some((d) => parsed.hostname === d || parsed.hostname.endsWith(`.${d}`))) {
    warnings.push(`Unknown domain: ${parsed.hostname}`);
  }
  return { ok: true, domain: parsed.hostname, warnings };
}

export function correlateDownloadedPdf(input: {
  filename: string;
  downloadTimeMs: number;
  emailCaseIds: string[];
  emailLinks: string[];
  candidates: Array<{ filename: string; mtimeMs: number; path: string }>;
}): { path: string; confidence: "HIGH" | "MEDIUM" | "LOW"; ambiguous: boolean } | null {
  assertQuestOperationAllowed("importPdf");
  const matches = input.candidates.filter((c) => {
    const nameHit =
      c.filename.toLowerCase() === input.filename.toLowerCase() ||
      input.emailCaseIds.some((id) => c.filename.includes(id));
    const timeHit = Math.abs(c.mtimeMs - input.downloadTimeMs) < 15 * 60 * 1000;
    return nameHit || timeHit;
  });
  if (matches.length === 0) return null;
  if (matches.length > 1) {
    return { path: matches[0]!.path, confidence: "LOW", ambiguous: true };
  }
  return { path: matches[0]!.path, confidence: "HIGH", ambiguous: false };
}

export function getAllowedQuestOperations() {
  return QUEST_ALLOWED_OPERATIONS;
}

function extractLinks(body: string): Array<{ url: string; domain: string }> {
  const urls = body.match(/https?:\/\/[^\s<>"]+/g) ?? [];
  return urls.map((url) => {
    try {
      const u = new URL(url);
      return { url, domain: u.hostname };
    } catch {
      return { url, domain: "" };
    }
  });
}

function extractCaseIds(body: string): string[] {
  return [...new Set(body.match(/\b(?:JV|CR|CV)-\d{2}-\d+\b/gi) ?? [])];
}

function extractPossibleNames(body: string): string[] {
  const names: string[] = [];
  if (/\bA\.M\./.test(body)) names.push("A.M.");
  const m = body.match(/for ([A-Z][a-z]+ [A-Z][a-z]+)/);
  if (m?.[1]) names.push(m[1]);
  return names;
}
