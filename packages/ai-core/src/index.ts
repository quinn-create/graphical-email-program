import { z } from "zod";
import type { AiStructuredResult, ProviderType } from "@mattermail/shared";
import { AiStructuredResultSchema } from "@mattermail/shared";
import {
  assertExactModelRecorded,
  assertNoSecretsInAiPayload,
  assertNoSilentFallback,
} from "@mattermail/security";

export const ADAPTER_VERSION = "1.0.0";
export const PROMPT_VERSION = "1.0.0";

export interface AiModelInfo {
  id: string;
  displayName: string;
  aliases?: string[];
  deploymentName?: string | null;
  modalities: {
    input: string[];
    output: string[];
  };
  contextWindow?: number | null;
  maxOutput?: number | null;
  supportsVision?: boolean;
  supportsPdfDirect?: boolean;
  supportsStructuredOutput?: boolean;
  supportsJsonSchema?: boolean;
  lifecycleStatus?: "stable" | "preview" | "experimental" | "deprecated" | "unknown";
  pricing?: Record<string, unknown>;
  raw?: unknown;
}

export interface AiUsage {
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  imageUnits: number | null;
  providerReportedCost: number | null;
  estimatedCost: number | null;
  currency: "USD";
}

export interface AiNormalizedError {
  code: string;
  message: string;
  retryable: boolean;
  raw?: unknown;
}

export interface AnalyzeTextInput {
  sourceItemId: string;
  text: string;
  candidateMatterSummaries: Array<{
    clioMatterId: string;
    displayNumber?: string | null;
    clientName?: string | null;
    description?: string | null;
  }>;
  learningRulesSummary?: string[];
  requestedModelId: string;
  providerProfileId: string;
  providerType: ProviderType;
  task: "OCR" | "MATCHING" | "LEARNING";
  allowFallback?: boolean;
  fallbackModelIds?: string[];
}

export interface AnalyzeDocumentInput extends AnalyzeTextInput {
  pages?: Array<{ pageNumber: number; imageBase64?: string; text?: string }>;
  pdfBase64?: string;
  attachmentId?: string;
}

export interface AiAnalyzeOutput {
  result: AiStructuredResult;
  requestedModelId: string;
  actualModelId: string | null;
  usage: AiUsage;
  rawProtectedReference?: string;
}

export interface AiProviderAdapter {
  readonly providerType: ProviderType;
  readonly adapterVersion: string;
  testConnection(): Promise<{ ok: boolean; message: string }>;
  listModels(): Promise<AiModelInfo[]>;
  getModelDetails(modelId: string): Promise<AiModelInfo | null>;
  testModelCapabilities(modelId: string): Promise<{
    text: boolean;
    image: boolean;
    pdf: boolean;
    structuredOutput: boolean;
    ocr: boolean;
    matching: boolean;
    warnings: string[];
  }>;
  analyzeDocument(input: AnalyzeDocumentInput): Promise<AiAnalyzeOutput>;
  analyzeText(input: AnalyzeTextInput): Promise<AiAnalyzeOutput>;
  normalizeUsage(raw: unknown): AiUsage;
  normalizeError(err: unknown): AiNormalizedError;
  getRequestedModelId(input: { requestedModelId: string }): string;
  getActualModelIdFromResponse(raw: unknown): string | null;
}

export function validateAiResult(
  raw: unknown,
  allowedMatterIds: Set<string>,
): { ok: true; data: AiStructuredResult } | { ok: false; error: string; raw: unknown } {
  const parsed = AiStructuredResultSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.message, raw };
  }
  for (const c of parsed.data.matter_result.candidates) {
    if (!allowedMatterIds.has(c.clio_matter_id)) {
      return {
        ok: false,
        error: `AI invented or returned non-candidate matter id: ${c.clio_matter_id}`,
        raw,
      };
    }
  }
  return { ok: true, data: parsed.data };
}

export function guardAiRequest(input: {
  payload: unknown;
  requestedModelId: string;
  usedFallback: boolean;
  fallbackEnabled: boolean;
  fallbackConfigured: boolean;
}): void {
  assertNoSecretsInAiPayload(input.payload);
  assertExactModelRecorded({ requestedModelId: input.requestedModelId });
  assertNoSilentFallback({
    fallbackEnabled: input.fallbackEnabled,
    usedFallback: input.usedFallback,
    fallbackConfigured: input.fallbackConfigured,
  });
}

export function buildCacheKey(parts: {
  contentHash: string;
  attachmentSha256?: string;
  candidateSetHash: string;
  learningRuleVersion: string;
  providerProfileId: string;
  requestedModelId: string;
  promptVersion: string;
  schemaVersion: string;
  adapterVersion: string;
  pageRenderVersion: string;
}): string {
  return [
    parts.contentHash,
    parts.attachmentSha256 ?? "",
    parts.candidateSetHash,
    parts.learningRuleVersion,
    parts.providerProfileId,
    parts.requestedModelId,
    parts.promptVersion,
    parts.schemaVersion,
    parts.adapterVersion,
    parts.pageRenderVersion,
  ].join("::");
}

export const CapabilityBadges = [
  "TEXT",
  "IMAGE",
  "PDF_DIRECT",
  "PDF_VIA_PAGE_IMAGES",
  "STRUCTURED_OUTPUT",
  "JSON_SCHEMA",
  "OCR_TEST_PASSED",
  "OCR_TEST_FAILED",
  "MATCHING_TEST_PASSED",
  "UNKNOWN",
] as const;

export type CapabilityBadge = (typeof CapabilityBadges)[number];

export { z };
export { createMockAdapter, defaultModelsFor } from "./mock-adapter.js";