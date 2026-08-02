import type { CaseRelatedness, Confidence, MatterScope } from "@mattermail/shared";
import { extractEntitiesLocally, type EntityExtraction } from "@mattermail/extraction";

export interface MatterIndexRow {
  clioMatterId: string;
  displayNumber?: string | null;
  description?: string | null;
  clientName?: string | null;
  status?: string | null;
  court?: string | null;
  county?: string | null;
  caseNumber?: string | null;
  docketNumber?: string | null;
  warrantNumber?: string | null;
  emails?: string[];
  phones?: string[];
}

export interface LearningRuleLike {
  ruleType: string;
  caseRelatedness: CaseRelatedness;
  matterScope: MatterScope;
  fixedMatterId?: string | null;
  matchedValue: string;
  active: boolean;
  userActivated: boolean;
}

export interface MatchEvidenceItem {
  evidenceType: string;
  evidenceValue: string;
  weight: "highest" | "strong" | "lower";
  supporting: boolean;
  explanation: string;
}

export interface RankedCandidate {
  clioMatterId: string;
  rank: number;
  confidence: Confidence;
  score: number;
  evidence: MatchEvidenceItem[];
}

export interface MatchResult {
  caseRelatedness: CaseRelatedness;
  matterScope: MatterScope;
  isCaseRelated: boolean;
  entities: EntityExtraction;
  candidates: RankedCandidate[];
  topConfidence: Confidence | "NONE";
  explanation: string;
  appliedRules: LearningRuleLike[];
}

const HIGHEST = 100;
const STRONG = 40;
const LOWER = 10;

export function matchMatter(input: {
  text: string;
  senderEmail?: string;
  threadId?: string;
  matters: MatterIndexRow[];
  rules?: LearningRuleLike[];
}): MatchResult {
  const entities = extractEntitiesLocally(input.text);
  const rules = (input.rules ?? []).filter((r) => r.active && r.userActivated);
  const appliedRules: LearningRuleLike[] = [];

  let caseRelatedness: CaseRelatedness = "UNKNOWN";
  let matterScope: MatterScope = "UNKNOWN";

  // Sender / domain classification rules (never auto-fix matter from ALWAYS+VARIABLE alone)
  if (input.senderEmail) {
    const senderRule = rules.find(
      (r) =>
        r.ruleType === "SENDER_CLASSIFICATION" &&
        r.matchedValue.toLowerCase() === input.senderEmail!.toLowerCase(),
    );
    if (senderRule) {
      appliedRules.push(senderRule);
      caseRelatedness = senderRule.caseRelatedness;
      matterScope = senderRule.matterScope;
    }
  }

  const scores = new Map<string, { score: number; evidence: MatchEvidenceItem[] }>();

  const bump = (
    matterId: string,
    ev: MatchEvidenceItem,
    points: number,
  ) => {
    const cur = scores.get(matterId) ?? { score: 0, evidence: [] };
    // Do not double-count same evidence type+value
    if (cur.evidence.some((e) => e.evidenceType === ev.evidenceType && e.evidenceValue === ev.evidenceValue)) {
      return;
    }
    cur.score += points;
    cur.evidence.push(ev);
    scores.set(matterId, cur);
  };

  for (const matter of input.matters) {
    for (const docket of entities.docketNumbers) {
      if (eq(matter.docketNumber, docket) || eq(matter.caseNumber, docket)) {
        bump(matter.clioMatterId, {
          evidenceType: "DOCKET_NUMBER",
          evidenceValue: docket,
          weight: "highest",
          supporting: true,
          explanation: `Exact docket/case number ${docket}`,
        }, HIGHEST);
      }
    }
    for (const warrant of entities.warrantNumbers) {
      if (eq(matter.warrantNumber, warrant)) {
        bump(matter.clioMatterId, {
          evidenceType: "WARRANT_NUMBER",
          evidenceValue: warrant,
          weight: "highest",
          supporting: true,
          explanation: `Exact warrant number ${warrant}`,
        }, HIGHEST);
      }
    }
    for (const cn of entities.caseNumbers) {
      if (eq(matter.caseNumber, cn) || eq(matter.docketNumber, cn) || eq(matter.displayNumber, cn)) {
        bump(matter.clioMatterId, {
          evidenceType: "CASE_NUMBER",
          evidenceValue: cn,
          weight: "highest",
          supporting: true,
          explanation: `Exact case/display number ${cn}`,
        }, HIGHEST);
      }
    }
    if (matter.displayNumber && input.text.includes(matter.displayNumber)) {
      bump(matter.clioMatterId, {
        evidenceType: "DISPLAY_NUMBER",
        evidenceValue: matter.displayNumber,
        weight: "highest",
        supporting: true,
        explanation: `Exact matter display number ${matter.displayNumber}`,
      }, HIGHEST);
    }
    for (const person of entities.people) {
      if (matter.clientName && person.toLowerCase() === matter.clientName.toLowerCase()) {
        const withCourt =
          entities.counties.some((c) => matter.county && c.toLowerCase().includes(matter.county.toLowerCase())) ||
          entities.courts.some((c) => matter.court && c.toLowerCase().includes(matter.court.toLowerCase()));
        bump(matter.clioMatterId, {
          evidenceType: "CLIENT_NAME",
          evidenceValue: person,
          weight: withCourt ? "strong" : "lower",
          supporting: true,
          explanation: withCourt
            ? `Full client name plus court/county context`
            : `Full client name alone (penalized)`,
        }, withCourt ? STRONG : LOWER);
      }
    }
    // Closed matter contextual penalty
    if (matter.status === "closed" && scores.has(matter.clioMatterId)) {
      const cur = scores.get(matter.clioMatterId)!;
      cur.score -= 5;
      cur.evidence.push({
        evidenceType: "STATUS",
        evidenceValue: "closed",
        weight: "lower",
        supporting: false,
        explanation: "Closed matter — slight contextual penalty",
      });
    }
  }

  // Thread / identifier rules with FIXED_MATTER
  for (const rule of rules) {
    if (rule.matterScope === "FIXED_MATTER" && rule.fixedMatterId) {
      const hay = `${input.threadId ?? ""} ${input.text}`.toLowerCase();
      if (hay.includes(rule.matchedValue.toLowerCase())) {
        appliedRules.push(rule);
        bump(rule.fixedMatterId, {
          evidenceType: rule.ruleType,
          evidenceValue: rule.matchedValue,
          weight: "highest",
          supporting: true,
          explanation: `Approved learning rule: ${rule.ruleType}`,
        }, HIGHEST);
      }
    }
  }

  // Advertising heuristic
  if (/unsubscribe|weekend deals|newsletter/i.test(input.text)) {
    caseRelatedness = "NEVER";
    matterScope = "NOT_APPLICABLE";
  } else if (scores.size > 0 && caseRelatedness === "UNKNOWN") {
    caseRelatedness = "ALWAYS";
    matterScope = "VARIABLE_MATTER";
  }

  const ranked: RankedCandidate[] = [...scores.entries()]
    .map(([clioMatterId, v]) => ({
      clioMatterId,
      rank: 0,
      score: v.score,
      confidence: toConfidence(v.score),
      evidence: v.evidence,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  ranked.forEach((c, i) => {
    c.rank = i + 1;
  });

  const isCaseRelated = caseRelatedness !== "NEVER";
  const topConfidence = ranked[0]?.confidence ?? "NONE";

  return {
    caseRelatedness,
    matterScope,
    isCaseRelated,
    entities,
    candidates: isCaseRelated ? ranked : [],
    topConfidence: isCaseRelated ? topConfidence : "NONE",
    explanation: buildExplanation(caseRelatedness, ranked),
    appliedRules,
  };
}

function eq(a?: string | null, b?: string | null): boolean {
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}

function toConfidence(score: number): Confidence {
  if (score >= HIGHEST) return "HIGH";
  if (score >= STRONG) return "MEDIUM";
  return "LOW";
}

function buildExplanation(cr: CaseRelatedness, ranked: RankedCandidate[]): string {
  if (cr === "NEVER") return "Classified not case-related (advertising/personal).";
  if (ranked.length === 0) return "Case-relatedness uncertain; no reliable matter match.";
  const top = ranked[0]!;
  return `Top candidate score ${top.score} (${top.confidence}) with ${top.evidence.length} evidence item(s).`;
}

/** Propose safe learning rules after approval — never activate without user. */
export function proposeSafeLearningRules(input: {
  senderEmail?: string;
  threadId?: string;
  docketNumbers: string[];
  matterId: string;
  disposition: string;
}): Array<{
  ruleType: string;
  caseRelatedness: CaseRelatedness;
  matterScope: MatterScope;
  fixedMatterId: string | null;
  matchedValue: string;
  reason: string;
  requiresUserConfirmation: true;
}> {
  const out: ReturnType<typeof proposeSafeLearningRules> = [];
  if (input.threadId) {
    out.push({
      ruleType: "THREAD",
      caseRelatedness: "ALWAYS",
      matterScope: "FIXED_MATTER",
      fixedMatterId: input.matterId,
      matchedValue: input.threadId,
      reason: "Remember this Gmail thread → matter",
      requiresUserConfirmation: true,
    });
  }
  for (const d of input.docketNumbers) {
    out.push({
      ruleType: "DOCKET_NUMBER",
      caseRelatedness: "ALWAYS",
      matterScope: "FIXED_MATTER",
      fixedMatterId: input.matterId,
      matchedValue: d,
      reason: `Remember docket ${d} → matter`,
      requiresUserConfirmation: true,
    });
  }
  if (input.senderEmail) {
    // Safe: ALWAYS + VARIABLE — never map all clerk mail to one matter
    out.push({
      ruleType: "SENDER_CLASSIFICATION",
      caseRelatedness: "ALWAYS",
      matterScope: "VARIABLE_MATTER",
      fixedMatterId: null,
      matchedValue: input.senderEmail,
      reason: "Sender always case-related; matter varies from content",
      requiresUserConfirmation: true,
    });
  }
  return out;
}
