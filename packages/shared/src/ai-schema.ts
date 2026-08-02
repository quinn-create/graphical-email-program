import { z } from "zod";
import {
  CaseRelatednessSchema,
  ConfidenceSchema,
  ProviderTypeSchema,
} from "./enums.js";

export const AiAnalysisMetaSchema = z.object({
  provider_profile_id: z.string(),
  provider_type: ProviderTypeSchema,
  requested_model_id: z.string(),
  actual_model_id: z.string().nullable(),
  deployment_name: z.string().nullable(),
  provider_request_id: z.string().nullable(),
  system_fingerprint: z.string().nullable(),
  prompt_version: z.string(),
  schema_version: z.literal("1.0"),
  used_fallback: z.boolean(),
  cached: z.boolean(),
});

export const AiStructuredResultSchema = z.object({
  schema_version: z.literal("1.0"),
  source_item_id: z.string(),
  analysis: AiAnalysisMetaSchema,
  case_relatedness: z.object({
    classification: CaseRelatednessSchema,
    is_this_item_case_related: z.boolean(),
    confidence: ConfidenceSchema,
    reasons: z.array(
      z.object({
        reason: z.string(),
        source_location: z.string(),
      }),
    ),
  }),
  extracted_entities: z.object({
    people: z.array(z.string()),
    organizations: z.array(z.string()),
    case_numbers: z.array(z.string()),
    docket_numbers: z.array(z.string()),
    warrant_numbers: z.array(z.string()),
    courts: z.array(z.string()),
    counties: z.array(z.string()),
    charges: z.array(z.string()),
    dates: z.array(z.string()),
    email_addresses: z.array(z.string()),
    phone_numbers: z.array(z.string()),
  }),
  pages: z.array(
    z.object({
      attachment_id: z.string(),
      page_number: z.number().int().positive(),
      ocr_text: z.string(),
      quality: z.enum(["HIGH", "MEDIUM", "LOW"]),
      warnings: z.array(z.string()),
    }),
  ),
  matter_result: z.object({
    status: z.enum([
      "PROPOSED",
      "MATTER_UNKNOWN",
      "NOT_CASE_RELATED",
      "MULTIPLE_MATTERS",
    ]),
    candidates: z.array(
      z.object({
        clio_matter_id: z.string(),
        rank: z.number().int().positive(),
        confidence: ConfidenceSchema,
        supporting_evidence: z.array(z.string()),
        contrary_evidence: z.array(z.string()),
      }),
    ),
  }),
  attachment_assignments: z.array(
    z.object({
      attachment_id: z.string(),
      recommended_matter_id: z.string().nullable(),
      recommendation: z.enum(["UPLOAD", "DO_NOT_UPLOAD", "REVIEW"]),
      reason: z.string(),
    }),
  ),
  proposed_learning_rules: z.array(
    z.object({
      rule_type: z.enum([
        "THREAD",
        "CASE_NUMBER",
        "DOCKET_NUMBER",
        "WARRANT_NUMBER",
        "SENDER_CLASSIFICATION",
        "CONTACT_CONTEXT",
        "OTHER",
      ]),
      case_relatedness: CaseRelatednessSchema,
      matter_scope: z.enum([
        "FIXED_MATTER",
        "VARIABLE_MATTER",
        "UNKNOWN",
        "NOT_APPLICABLE",
      ]),
      fixed_matter_id: z.string().nullable(),
      matched_value: z.string(),
      reason: z.string(),
      requires_user_confirmation: z.literal(true),
    }),
  ),
  usage: z.object({
    input_tokens: z.number().nullable(),
    output_tokens: z.number().nullable(),
    cached_tokens: z.number().nullable(),
    image_units: z.number().nullable(),
    provider_reported_cost: z.number().nullable(),
    estimated_cost: z.number().nullable(),
    currency: z.literal("USD"),
  }),
  warnings: z.array(z.string()),
});

export type AiStructuredResult = z.infer<typeof AiStructuredResultSchema>;
