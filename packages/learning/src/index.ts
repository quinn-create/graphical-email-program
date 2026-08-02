import type { CaseRelatedness, MatterScope } from "@mattermail/shared";
import { newId } from "@mattermail/domain";

export interface LearningRuleRecord {
  id: string;
  ruleType: string;
  caseRelatedness: CaseRelatedness;
  matterScope: MatterScope;
  fixedMatterId: string | null;
  matchedValue: string;
  reason: string;
  sourceDecisionId?: string | null;
  active: boolean;
  successfulUses: number;
  correctedUses: number;
  proposedByAi: boolean;
  userActivated: boolean;
  createdAt: Date;
}

/**
 * AI may propose rules; only local app + user approval activates them.
 * Rejects unsafe "sender → fixed matter" when matter-variable is appropriate.
 */
export function activateRule(
  proposal: Omit<LearningRuleRecord, "id" | "createdAt" | "active" | "successfulUses" | "correctedUses" | "userActivated"> & {
    userConfirmed: boolean;
  },
): LearningRuleRecord {
  if (!proposal.userConfirmed) {
    throw new Error("Learning rules require explicit user confirmation");
  }
  if (
    proposal.ruleType === "SENDER_CLASSIFICATION" &&
    proposal.matterScope === "FIXED_MATTER" &&
    proposal.proposedByAi
  ) {
    throw new Error(
      "Unsafe AI suggestion rejected: sender→fixed matter. Prefer VARIABLE_MATTER sender rule plus narrow identifier rules.",
    );
  }
  return {
    id: newId("rule"),
    ruleType: proposal.ruleType,
    caseRelatedness: proposal.caseRelatedness,
    matterScope: proposal.matterScope,
    fixedMatterId: proposal.fixedMatterId,
    matchedValue: proposal.matchedValue,
    reason: proposal.reason,
    sourceDecisionId: proposal.sourceDecisionId,
    active: true,
    successfulUses: 0,
    correctedUses: 0,
    proposedByAi: proposal.proposedByAi,
    userActivated: true,
    createdAt: new Date(),
  };
}

export function accuracyIndicator(rule: LearningRuleRecord): string {
  const total = rule.successfulUses + rule.correctedUses;
  if (total === 0) return "untested";
  const ratio = rule.successfulUses / total;
  if (ratio >= 0.9) return "high";
  if (ratio >= 0.7) return "medium";
  return "low";
}
