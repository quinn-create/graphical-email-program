import { z } from "zod";

export const CaseRelatednessSchema = z.enum([
  "ALWAYS",
  "USUALLY",
  "MIXED",
  "NEVER",
  "UNKNOWN",
]);
export type CaseRelatedness = z.infer<typeof CaseRelatednessSchema>;

export const MatterScopeSchema = z.enum([
  "FIXED_MATTER",
  "VARIABLE_MATTER",
  "UNKNOWN",
  "NOT_APPLICABLE",
]);
export type MatterScope = z.infer<typeof MatterScopeSchema>;

export const ConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);
export type Confidence = z.infer<typeof ConfidenceSchema>;

export const ProviderTypeSchema = z.enum([
  "OPENAI",
  "ANTHROPIC",
  "GEMINI",
  "XAI",
  "MISTRAL",
  "OPENROUTER",
  "AZURE_OPENAI",
  "CUSTOM_OPENAI_COMPATIBLE",
  "OLLAMA",
  "MOCK",
]);
export type ProviderType = z.infer<typeof ProviderTypeSchema>;

export const AiTaskSchema = z.enum(["OCR", "MATCHING", "LEARNING"]);
export type AiTask = z.infer<typeof AiTaskSchema>;

export const CommitStateSchema = z.enum([
  "STAGED",
  "PREFLIGHT_VALIDATED",
  "DUPLICATE_CHECKED",
  "COMMUNICATION_CREATING",
  "COMMUNICATION_CREATED",
  "COMMUNICATION_VERIFIED",
  "DOCUMENTS_UPLOADING",
  "DOCUMENTS_PARTIALLY_UPLOADED",
  "DOCUMENTS_VERIFIED",
  "AUDIT_WRITTEN",
  "DRIVE_PENDING",
  "COMPLETE",
  "PARTIAL_FAILURE",
  "RETRY_REQUIRED",
]);
export type CommitState = z.infer<typeof CommitStateSchema>;

export const ReviewDispositionSchema = z.enum([
  "APPROVED_PROPOSED",
  "APPROVED_ALTERNATE",
  "CASE_RELATED_MATTER_UNKNOWN",
  "NOT_CASE_RELATED",
  "REVIEW_LATER",
  "DUPLICATE_ALREADY_LOGGED",
  "SPLIT",
]);
export type ReviewDisposition = z.infer<typeof ReviewDispositionSchema>;

export const GMAIL_READONLY_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly" as const;

export const DRIVE_FILE_SCOPE =
  "https://www.googleapis.com/auth/drive.file" as const;

export const FORBIDDEN_GMAIL_SCOPES = [
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://mail.google.com/",
] as const;
