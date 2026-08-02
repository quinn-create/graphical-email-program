import type {
  AiAnalyzeOutput,
  AiModelInfo,
  AiNormalizedError,
  AiProviderAdapter,
  AiUsage,
  AnalyzeDocumentInput,
  AnalyzeTextInput,
} from "@mattermail/ai-core";
import { ADAPTER_VERSION, PROMPT_VERSION, guardAiRequest, validateAiResult } from "@mattermail/ai-core";
import type { AiStructuredResult, ProviderType } from "@mattermail/shared";

const EMPTY_USAGE: AiUsage = {
  inputTokens: 100,
  outputTokens: 50,
  cachedTokens: 0,
  imageUnits: null,
  providerReportedCost: null,
  estimatedCost: 0.001,
  currency: "USD",
};

export function createMockAdapter(
  providerType: ProviderType,
  defaultModels: AiModelInfo[],
): AiProviderAdapter {
  return {
    providerType,
    adapterVersion: ADAPTER_VERSION,

    async testConnection() {
      return { ok: true, message: `Mock ${providerType} connection OK` };
    },

    async listModels() {
      return defaultModels;
    },

    async getModelDetails(modelId: string) {
      return defaultModels.find((m) => m.id === modelId) ?? null;
    },

    async testModelCapabilities(modelId: string) {
      const model = defaultModels.find((m) => m.id === modelId);
      const vision = model?.supportsVision ?? false;
      return {
        text: true,
        image: vision,
        pdf: model?.supportsPdfDirect ?? false,
        structuredOutput: model?.supportsStructuredOutput ?? true,
        ocr: vision,
        matching: true,
        warnings: vision ? [] : ["Model lacks vision — not suitable for OCR alone"],
      };
    },

    async analyzeText(input: AnalyzeTextInput): Promise<AiAnalyzeOutput> {
      return analyze(input, providerType, false);
    },

    async analyzeDocument(input: AnalyzeDocumentInput): Promise<AiAnalyzeOutput> {
      return analyze(input, providerType, true);
    },

    normalizeUsage(): AiUsage {
      return EMPTY_USAGE;
    },

    normalizeError(err: unknown): AiNormalizedError {
      return {
        code: "MOCK_ERROR",
        message: err instanceof Error ? err.message : String(err),
        retryable: false,
        raw: err,
      };
    },

    getRequestedModelId(input) {
      return input.requestedModelId;
    },

    getActualModelIdFromResponse(raw: unknown) {
      if (raw && typeof raw === "object" && "model" in raw) {
        return String((raw as { model: string }).model);
      }
      return null;
    },
  };
}

function analyze(
  input: AnalyzeTextInput | AnalyzeDocumentInput,
  providerType: ProviderType,
  _isDoc: boolean,
): AiAnalyzeOutput {
  guardAiRequest({
    payload: { text: input.text, candidates: input.candidateMatterSummaries },
    requestedModelId: input.requestedModelId,
    usedFallback: false,
    fallbackEnabled: Boolean(input.allowFallback),
    fallbackConfigured: Boolean(input.fallbackModelIds?.length),
  });

  const allowed = new Set(
    input.candidateMatterSummaries.map((c) => c.clioMatterId),
  );

  // Deterministic demo matching heuristics on fictional content
  const text = input.text.toLowerCase();
  let proposedId: string | null = null;
  let confidence: "HIGH" | "MEDIUM" | "LOW" = "LOW";
  let status: AiStructuredResult["matter_result"]["status"] = "MATTER_UNKNOWN";
  let caseRelated = true;
  let classification: AiStructuredResult["case_relatedness"]["classification"] = "UNKNOWN";

  if (text.includes("retailmart") || text.includes("unsubscribe") || text.includes("weekend deals")) {
    caseRelated = false;
    classification = "NEVER";
    status = "NOT_CASE_RELATED";
  } else if (text.includes("26-gs-12345") || text.includes("jonathan roberts")) {
    proposedId =
      input.candidateMatterSummaries.find((c) =>
        (c.displayNumber ?? "").includes("0142") ||
        (c.clientName ?? "").toLowerCase().includes("roberts"),
      )?.clioMatterId ??
      input.candidateMatterSummaries[0]?.clioMatterId ??
      null;
    confidence = "HIGH";
    status = proposedId ? "PROPOSED" : "MATTER_UNKNOWN";
    classification = "ALWAYS";
  } else if (text.includes("roberson") || text.includes("26-gs-12999")) {
    proposedId =
      input.candidateMatterSummaries.find((c) =>
        (c.clientName ?? "").toLowerCase().includes("roberson"),
      )?.clioMatterId ?? null;
    confidence = proposedId ? "HIGH" : "MEDIUM";
    status = proposedId ? "PROPOSED" : "MATTER_UNKNOWN";
    classification = "USUALLY";
  } else if (text.includes("quest") || text.includes("jv-25-0088") || text.includes("a.m.")) {
    proposedId =
      input.candidateMatterSummaries.find((c) =>
        (c.caseNumber ?? c.displayNumber ?? "").toLowerCase().includes("jv") ||
        (c.clientName ?? "").toLowerCase().includes("a.m"),
      )?.clioMatterId ??
      input.candidateMatterSummaries.find((c) =>
        (c.description ?? "").toLowerCase().includes("juvenile"),
      )?.clioMatterId ??
      null;
    confidence = proposedId ? "HIGH" : "MEDIUM";
    status = proposedId ? "PROPOSED" : "MATTER_UNKNOWN";
    classification = "ALWAYS";
  }

  const candidates = input.candidateMatterSummaries.slice(0, 5).map((c, i) => ({
    clio_matter_id: c.clioMatterId,
    rank: i + 1,
    confidence: (c.clioMatterId === proposedId ? confidence : "LOW") as "HIGH" | "MEDIUM" | "LOW",
    supporting_evidence:
      c.clioMatterId === proposedId
        ? ["Matched identifier or name in source text"]
        : [],
    contrary_evidence: [],
  }));

  if (proposedId) {
    candidates.sort((a, b) =>
      a.clio_matter_id === proposedId ? -1 : b.clio_matter_id === proposedId ? 1 : 0,
    );
    candidates.forEach((c, i) => {
      c.rank = i + 1;
    });
  }

  const result: AiStructuredResult = {
    schema_version: "1.0",
    source_item_id: input.sourceItemId,
    analysis: {
      provider_profile_id: input.providerProfileId,
      provider_type: providerType,
      requested_model_id: input.requestedModelId,
      actual_model_id: input.requestedModelId,
      deployment_name: null,
      provider_request_id: `mock-${Date.now()}`,
      system_fingerprint: null,
      prompt_version: PROMPT_VERSION,
      schema_version: "1.0",
      used_fallback: false,
      cached: false,
    },
    case_relatedness: {
      classification,
      is_this_item_case_related: caseRelated,
      confidence,
      reasons: caseRelated
        ? [{ reason: "Legal identifiers or party names detected", source_location: "body" }]
        : [{ reason: "Advertising/newsletter language", source_location: "body" }],
    },
    extracted_entities: {
      people: extractPeople(input.text),
      organizations: [],
      case_numbers: extractPattern(input.text, /\b\d{2}-[A-Z]{2}-\d+\b/g),
      docket_numbers: extractPattern(input.text, /\b\d{2}-GS-\d+\b/gi),
      warrant_numbers: extractPattern(input.text, /\bW-\d{4}-\d+\b/g),
      courts: [],
      counties: extractPattern(input.text, /\b(Davidson|Shelby|Knox)\b/g),
      charges: [],
      dates: [],
      email_addresses: extractPattern(input.text, /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g),
      phone_numbers: [],
    },
    pages: [],
    matter_result: {
      status,
      candidates: status === "NOT_CASE_RELATED" ? [] : candidates.filter((c) => allowed.has(c.clio_matter_id)),
    },
    attachment_assignments: [],
    proposed_learning_rules: [
      {
        rule_type: "SENDER_CLASSIFICATION",
        case_relatedness: classification === "NEVER" ? "NEVER" : "ALWAYS",
        matter_scope: classification === "NEVER" ? "NOT_APPLICABLE" : "VARIABLE_MATTER",
        fixed_matter_id: null,
        matched_value: "sender",
        reason: "Narrow sender classification — matter from content, not sender alone",
        requires_user_confirmation: true,
      },
    ],
    usage: {
      input_tokens: EMPTY_USAGE.inputTokens,
      output_tokens: EMPTY_USAGE.outputTokens,
      cached_tokens: EMPTY_USAGE.cachedTokens,
      image_units: EMPTY_USAGE.imageUnits,
      provider_reported_cost: EMPTY_USAGE.providerReportedCost,
      estimated_cost: EMPTY_USAGE.estimatedCost,
      currency: "USD",
    },
    warnings: [],
  };

  const validated = validateAiResult(result, allowed);
  if (!validated.ok) {
    throw new Error(validated.error);
  }

  return {
    result: validated.data,
    requestedModelId: input.requestedModelId,
    actualModelId: input.requestedModelId,
    usage: EMPTY_USAGE,
  };
}

function extractPattern(text: string, re: RegExp): string[] {
  return [...new Set(text.match(re) ?? [])];
}

function extractPeople(text: string): string[] {
  const people: string[] = [];
  if (/jonathan roberts/i.test(text)) people.push("Jonathan Roberts");
  if (/jonathan roberson/i.test(text)) people.push("Jonathan Roberson");
  if (/\bA\.M\./i.test(text)) people.push("A.M.");
  return people;
}

export function defaultModelsFor(provider: ProviderType): AiModelInfo[] {
  const base = (id: string, vision: boolean): AiModelInfo => ({
    id,
    displayName: id,
    modalities: { input: vision ? ["text", "image"] : ["text"], output: ["text"] },
    supportsVision: vision,
    supportsPdfDirect: provider === "MISTRAL" || provider === "GEMINI",
    supportsStructuredOutput: true,
    supportsJsonSchema: true,
    contextWindow: 128000,
    maxOutput: 8192,
    lifecycleStatus: "stable",
  });

  switch (provider) {
    case "OPENAI":
      return [base("gpt-4.1", true), base("gpt-4.1-mini", true), base("o4-mini", false)];
    case "ANTHROPIC":
      return [base("claude-sonnet-4-20250514", true), base("claude-haiku-4-20250414", true)];
    case "GEMINI":
      return [base("gemini-2.5-pro", true), base("gemini-2.5-flash", true)];
    case "XAI":
      return [base("grok-3", true), base("grok-2-vision", true)];
    case "MISTRAL":
      return [base("mistral-large-latest", false), base("pixtral-large-latest", true)];
    case "OPENROUTER":
      return [
        { ...base("openrouter/auto", true), displayName: "OpenRouter Auto", aliases: ["auto"] },
        base("anthropic/claude-sonnet-4", true),
      ];
    case "AZURE_OPENAI":
      return [
        {
          ...base("gpt-4o", true),
          deploymentName: "firm-gpt4o-deploy",
          displayName: "gpt-4o (deployment: firm-gpt4o-deploy)",
        },
      ];
    case "CUSTOM_OPENAI_COMPATIBLE":
      return [base("custom-model", false)];
    case "OLLAMA":
      return [base("llama3.2", false), base("llava", true)];
    case "MOCK":
    default:
      return [base("mock-vision-model", true), base("mock-text-model", false)];
  }
}
