import { sql } from "drizzle-orm";
import {
  sqliteTable,
  text,
  integer,
  real,
  blob,
  uniqueIndex,
  index,
} from "drizzle-orm/sqlite-core";

const ts = (name: string) =>
  integer(name, { mode: "timestamp_ms" }).notNull();

const tsNullable = (name: string) =>
  integer(name, { mode: "timestamp_ms" });

export const applicationSettings = sqliteTable("application_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: ts("updated_at"),
});

export const connectorAccounts = sqliteTable(
  "connector_accounts",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(), // gmail | clio | drive
    accountIdentifier: text("account_identifier"),
    displayName: text("display_name"),
    connectionStatus: text("connection_status").notNull().default("disconnected"),
    tokenReference: text("token_reference"),
    lastAuthenticatedAt: tsNullable("last_authenticated_at"),
    lastError: text("last_error"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [uniqueIndex("connector_provider_account").on(t.provider, t.accountIdentifier)],
);

export const aiProviderProfiles = sqliteTable("ai_provider_profiles", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  providerType: text("provider_type").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  secretReference: text("secret_reference"),
  nonSecretConfigJson: text("non_secret_config_json").notNull().default("{}"),
  baseUrl: text("base_url"),
  organizationMetaJson: text("organization_meta_json").default("{}"),
  testStatus: text("test_status").default("untested"),
  lastTestedAt: tsNullable("last_tested_at"),
  lastError: text("last_error"),
  lastModelRefreshAt: tsNullable("last_model_refresh_at"),
  allowedTasksJson: text("allowed_tasks_json").notNull().default('["OCR","MATCHING","LEARNING"]'),
  privacyAckVersion: text("privacy_ack_version"),
  costWarningJson: text("cost_warning_json"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export const aiModels = sqliteTable(
  "ai_models",
  {
    id: text("id").primaryKey(),
    providerProfileId: text("provider_profile_id")
      .notNull()
      .references(() => aiProviderProfiles.id),
    exactModelId: text("exact_model_id").notNull(),
    displayName: text("display_name"),
    aliasesJson: text("aliases_json").default("[]"),
    versionSnapshot: text("version_snapshot"),
    deploymentName: text("deployment_name"),
    modalitiesJson: text("modalities_json").default("{}"),
    contextWindow: integer("context_window"),
    maxOutput: integer("max_output"),
    capabilityMetaJson: text("capability_meta_json").default("{}"),
    priceMetaJson: text("price_meta_json").default("{}"),
    lifecycleStatus: text("lifecycle_status").default("unknown"),
    source: text("source").default("api"),
    fetchedAt: tsNullable("fetched_at"),
    rawMetaJson: text("raw_meta_json"),
  },
  (t) => [
    uniqueIndex("ai_models_profile_exact").on(t.providerProfileId, t.exactModelId),
  ],
);

export const aiModelCapabilityTests = sqliteTable("ai_model_capability_tests", {
  id: text("id").primaryKey(),
  providerProfileId: text("provider_profile_id").notNull(),
  exactModelId: text("exact_model_id").notNull(),
  textOk: integer("text_ok", { mode: "boolean" }),
  imageOk: integer("image_ok", { mode: "boolean" }),
  pdfOk: integer("pdf_ok", { mode: "boolean" }),
  structuredOutputOk: integer("structured_output_ok", { mode: "boolean" }),
  ocrOk: integer("ocr_ok", { mode: "boolean" }),
  matchingOk: integer("matching_ok", { mode: "boolean" }),
  resultJson: text("result_json"),
  warningsJson: text("warnings_json").default("[]"),
  testedAt: ts("tested_at"),
  adapterVersion: text("adapter_version"),
  modelListVersion: text("model_list_version"),
});

export const aiTaskConfig = sqliteTable("ai_task_config", {
  id: text("id").primaryKey().default("default"),
  ocrProfileId: text("ocr_profile_id"),
  ocrModelId: text("ocr_model_id"),
  matchingProfileId: text("matching_profile_id"),
  matchingModelId: text("matching_model_id"),
  learningProfileId: text("learning_profile_id"),
  learningModelId: text("learning_model_id"),
  useOneModel: integer("use_one_model", { mode: "boolean" }).notNull().default(true),
  fallbackEnabled: integer("fallback_enabled", { mode: "boolean" }).notNull().default(false),
  fallbackConfigJson: text("fallback_config_json").default("[]"),
  automaticRulesJson: text("automatic_rules_json").default("{}"),
  costLimitsJson: text("cost_limits_json").default("{}"),
  privacyControlsJson: text("privacy_controls_json").default("{}"),
  cloudAiDisabled: integer("cloud_ai_disabled", { mode: "boolean" }).notNull().default(false),
  updatedAt: ts("updated_at"),
});

export const aiRequests = sqliteTable("ai_requests", {
  id: text("id").primaryKey(),
  sourceItemId: text("source_item_id"),
  task: text("task").notNull(),
  providerProfileId: text("provider_profile_id").notNull(),
  requestedModelId: text("requested_model_id").notNull(),
  actualModelId: text("actual_model_id"),
  fallbackChainJson: text("fallback_chain_json").default("[]"),
  promptVersion: text("prompt_version").notNull(),
  schemaVersion: text("schema_version").notNull().default("1.0"),
  candidateSetHash: text("candidate_set_hash"),
  contentHash: text("content_hash"),
  startedAt: ts("started_at"),
  endedAt: tsNullable("ended_at"),
  status: text("status").notNull(),
  providerRequestId: text("provider_request_id"),
  usageJson: text("usage_json"),
  estimatedCost: real("estimated_cost"),
  error: text("error"),
  usedFallback: integer("used_fallback", { mode: "boolean" }).notNull().default(false),
});

export const aiResults = sqliteTable("ai_results", {
  id: text("id").primaryKey(),
  requestId: text("request_id")
    .notNull()
    .references(() => aiRequests.id),
  validatedResultJson: text("validated_result_json"),
  validationStatus: text("validation_status").notNull(),
  rawResultReference: text("raw_result_reference"),
  cached: integer("cached", { mode: "boolean" }).notNull().default(false),
  userAccepted: integer("user_accepted", { mode: "boolean" }),
  warningsJson: text("warnings_json").default("[]"),
  createdAt: ts("created_at"),
});

export const syncRuns = sqliteTable("sync_runs", {
  id: text("id").primaryKey(),
  connector: text("connector").notNull(),
  kind: text("kind").notNull(),
  windowStart: tsNullable("window_start"),
  windowEnd: tsNullable("window_end"),
  status: text("status").notNull(),
  startedAt: ts("started_at"),
  endedAt: tsNullable("ended_at"),
  error: text("error"),
  countsJson: text("counts_json").default("{}"),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
});

export const syncCheckpoints = sqliteTable(
  "sync_checkpoints",
  {
    id: text("id").primaryKey(),
    connector: text("connector").notNull(),
    checkpointKey: text("checkpoint_key").notNull(),
    checkpointValue: text("checkpoint_value").notNull(),
    updatedAt: ts("updated_at"),
  },
  (t) => [uniqueIndex("sync_checkpoint_unique").on(t.connector, t.checkpointKey)],
);

export const gmailThreads = sqliteTable("gmail_threads", {
  id: text("id").primaryKey(),
  gmailThreadId: text("gmail_thread_id").notNull().unique(),
  subject: text("subject"),
  snippet: text("snippet"),
  lastMessageAt: tsNullable("last_message_at"),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
});

export const gmailMessages = sqliteTable(
  "gmail_messages",
  {
    id: text("id").primaryKey(),
    gmailMessageId: text("gmail_message_id").notNull().unique(),
    gmailThreadId: text("gmail_thread_id").notNull(),
    rfcMessageId: text("rfc_message_id"),
    direction: text("direction").notNull(), // sent | received
    subject: text("subject"),
    snippet: text("snippet"),
    bodyText: text("body_text"),
    bodyHtml: text("body_html"),
    internalDate: ts("internal_date"),
    labelIdsJson: text("label_ids_json").default("[]"),
    rawHeadersJson: text("raw_headers_json").default("{}"),
    reviewStatus: text("review_status").notNull().default("unreviewed"),
    isQuest: integer("is_quest", { mode: "boolean" }).notNull().default(false),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    ingestedAt: ts("ingested_at"),
  },
  (t) => [
    index("gmail_messages_thread").on(t.gmailThreadId),
    index("gmail_messages_review").on(t.reviewStatus),
  ],
);

export const emailParticipants = sqliteTable("email_participants", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => gmailMessages.id),
  role: text("role").notNull(), // from | to | cc | bcc
  email: text("email").notNull(),
  displayName: text("display_name"),
});

export const emailLinks = sqliteTable("email_links", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => gmailMessages.id),
  url: text("url").notNull(),
  domain: text("domain"),
  isQuest: integer("is_quest", { mode: "boolean" }).notNull().default(false),
});

export const attachments = sqliteTable(
  "attachments",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id").references(() => gmailMessages.id),
    filename: text("filename").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    sha256: text("sha256").notNull(),
    localPath: text("local_path"),
    gmailAttachmentId: text("gmail_attachment_id"),
    pageCount: integer("page_count"),
    ocrStatus: text("ocr_status").default("pending"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    createdAt: ts("created_at"),
  },
  (t) => [index("attachments_sha256").on(t.sha256)],
);

export const extractedText = sqliteTable("extracted_text", {
  id: text("id").primaryKey(),
  attachmentId: text("attachment_id").references(() => attachments.id),
  messageId: text("message_id").references(() => gmailMessages.id),
  method: text("method").notNull(), // local | ocr | hybrid
  pageNumber: integer("page_number"),
  textContent: text("text_content").notNull(),
  contentHash: text("content_hash").notNull(),
  version: text("version").notNull().default("1"),
  createdAt: ts("created_at"),
});

export const renderedPages = sqliteTable("rendered_pages", {
  id: text("id").primaryKey(),
  attachmentId: text("attachment_id")
    .notNull()
    .references(() => attachments.id),
  pageNumber: integer("page_number").notNull(),
  localPath: text("local_path").notNull(),
  sha256: text("sha256").notNull(),
  renderVersion: text("render_version").notNull().default("1"),
  createdAt: ts("created_at"),
});

export const questEmailMetadata = sqliteTable("quest_email_metadata", {
  id: text("id").primaryKey(),
  messageId: text("message_id")
    .notNull()
    .references(() => gmailMessages.id)
    .unique(),
  possibleNamesJson: text("possible_names_json").default("[]"),
  caseIdentifiersJson: text("case_identifiers_json").default("[]"),
  linksJson: text("links_json").default("[]"),
  detectionRule: text("detection_rule"),
  createdAt: ts("created_at"),
});

export const questImportedDocuments = sqliteTable(
  "quest_imported_documents",
  {
    id: text("id").primaryKey(),
    messageId: text("message_id").references(() => gmailMessages.id),
    attachmentId: text("attachment_id").references(() => attachments.id),
    source: text("source").notNull(), // attachment | download | picker | watcher
    originalFilename: text("original_filename"),
    sha256: text("sha256").notNull(),
    localPath: text("local_path").notNull(),
    correlationConfidence: text("correlation_confidence"),
    importedAt: ts("imported_at"),
  },
  (t) => [uniqueIndex("quest_doc_sha_message").on(t.sha256, t.messageId)],
);

export const clioMatters = sqliteTable(
  "clio_matters",
  {
    id: text("id").primaryKey(),
    clioMatterId: text("clio_matter_id").notNull().unique(),
    displayNumber: text("display_number"),
    description: text("description"),
    status: text("status"),
    clientName: text("client_name"),
    clientId: text("client_id"),
    practiceArea: text("practice_area"),
    responsibleAttorney: text("responsible_attorney"),
    openDate: text("open_date"),
    closeDate: text("close_date"),
    court: text("court"),
    county: text("county"),
    caseNumber: text("case_number"),
    docketNumber: text("docket_number"),
    warrantNumber: text("warrant_number"),
    customFieldsJson: text("custom_fields_json").default("{}"),
    searchBlob: text("search_blob"),
    isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
    indexedAt: ts("indexed_at"),
  },
  (t) => [index("clio_matters_display").on(t.displayNumber)],
);

export const clioContacts = sqliteTable("clio_contacts", {
  id: text("id").primaryKey(),
  clioContactId: text("clio_contact_id").notNull().unique(),
  name: text("name"),
  emailsJson: text("emails_json").default("[]"),
  phonesJson: text("phones_json").default("[]"),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  indexedAt: ts("indexed_at"),
});

export const clioMatterContacts = sqliteTable("clio_matter_contacts", {
  id: text("id").primaryKey(),
  matterId: text("matter_id")
    .notNull()
    .references(() => clioMatters.id),
  contactId: text("contact_id")
    .notNull()
    .references(() => clioContacts.id),
  role: text("role"),
});

export const matchCandidates = sqliteTable("match_candidates", {
  id: text("id").primaryKey(),
  sourceItemId: text("source_item_id").notNull(),
  clioMatterId: text("clio_matter_id").notNull(),
  rank: integer("rank").notNull(),
  confidence: text("confidence").notNull(),
  scoreHint: real("score_hint"),
  createdAt: ts("created_at"),
});

export const matchEvidence = sqliteTable("match_evidence", {
  id: text("id").primaryKey(),
  candidateId: text("candidate_id")
    .notNull()
    .references(() => matchCandidates.id),
  evidenceType: text("evidence_type").notNull(),
  evidenceValue: text("evidence_value").notNull(),
  weight: text("weight").notNull(), // highest | strong | lower
  supporting: integer("supporting", { mode: "boolean" }).notNull().default(true),
  explanation: text("explanation"),
});

export const reviewDecisions = sqliteTable("review_decisions", {
  id: text("id").primaryKey(),
  sourceItemId: text("source_item_id").notNull(),
  disposition: text("disposition").notNull(),
  matterId: text("matter_id"),
  remember: integer("remember", { mode: "boolean" }).notNull().default(true),
  splitJson: text("split_json"),
  aiRequestId: text("ai_request_id"),
  decidedAt: ts("decided_at"),
  undone: integer("undone", { mode: "boolean" }).notNull().default(false),
});

export const learningRules = sqliteTable("learning_rules", {
  id: text("id").primaryKey(),
  ruleType: text("rule_type").notNull(),
  caseRelatedness: text("case_relatedness").notNull(),
  matterScope: text("matter_scope").notNull(),
  fixedMatterId: text("fixed_matter_id"),
  matchedValue: text("matched_value").notNull(),
  reason: text("reason"),
  sourceDecisionId: text("source_decision_id"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  expiresAt: tsNullable("expires_at"),
  successfulUses: integer("successful_uses").notNull().default(0),
  correctedUses: integer("corrected_uses").notNull().default(0),
  lastUsedAt: tsNullable("last_used_at"),
  createdAt: ts("created_at"),
  proposedByAi: integer("proposed_by_ai", { mode: "boolean" }).notNull().default(false),
  userActivated: integer("user_activated", { mode: "boolean" }).notNull().default(false),
});

export const stagedItems = sqliteTable("staged_items", {
  id: text("id").primaryKey(),
  sourceItemId: text("source_item_id").notNull(),
  matterId: text("matter_id").notNull(),
  disposition: text("disposition").notNull(),
  state: text("state").notNull().default("STAGED"),
  intendedWriteFingerprint: text("intended_write_fingerprint"),
  communicationBody: text("communication_body"),
  subject: text("subject"),
  direction: text("direction"),
  metadataJson: text("metadata_json").default("{}"),
  createdAt: ts("created_at"),
  updatedAt: ts("updated_at"),
});

export const stagedAttachmentAssignments = sqliteTable(
  "staged_attachment_assignments",
  {
    id: text("id").primaryKey(),
    stagedItemId: text("staged_item_id")
      .notNull()
      .references(() => stagedItems.id),
    attachmentId: text("attachment_id").notNull(),
    matterId: text("matter_id"),
    action: text("action").notNull(), // UPLOAD | DO_NOT_UPLOAD
    pageRangeJson: text("page_range_json"),
  },
);

export const commitRuns = sqliteTable("commit_runs", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  startedAt: ts("started_at"),
  endedAt: tsNullable("ended_at"),
  countsJson: text("counts_json").default("{}"),
  error: text("error"),
});

export const commitSteps = sqliteTable("commit_steps", {
  id: text("id").primaryKey(),
  commitRunId: text("commit_run_id")
    .notNull()
    .references(() => commitRuns.id),
  stagedItemId: text("staged_item_id").notNull(),
  step: text("step").notNull(),
  status: text("status").notNull(),
  detailJson: text("detail_json"),
  startedAt: ts("started_at"),
  endedAt: tsNullable("ended_at"),
});

export const clioWriteReceipts = sqliteTable(
  "clio_write_receipts",
  {
    id: text("id").primaryKey(),
    stagedItemId: text("staged_item_id").notNull(),
    writeKind: text("write_kind").notNull(), // communication | document
    intendedWriteFingerprint: text("intended_write_fingerprint").notNull(),
    clioId: text("clio_id").notNull(),
    verified: integer("verified", { mode: "boolean" }).notNull().default(false),
    createdAt: ts("created_at"),
  },
  (t) => [
    uniqueIndex("clio_receipt_fingerprint").on(t.intendedWriteFingerprint, t.writeKind),
  ],
);

export const duplicateFingerprints = sqliteTable(
  "duplicate_fingerprints",
  {
    id: text("id").primaryKey(),
    fingerprint: text("fingerprint").notNull().unique(),
    kind: text("kind").notNull(),
    sourceRef: text("source_ref"),
    createdAt: ts("created_at"),
  },
);

export const auditFiles = sqliteTable("audit_files", {
  id: text("id").primaryKey(),
  runId: text("run_id").notNull(),
  kind: text("kind").notNull(), // pdf | xlsx | json
  localPath: text("local_path").notNull(),
  sha256: text("sha256").notNull(),
  sizeBytes: integer("size_bytes"),
  driveFileId: text("drive_file_id"),
  driveVerified: integer("drive_verified", { mode: "boolean" }).default(false),
  createdAt: ts("created_at"),
});

export const driveReconciliationRuns = sqliteTable("drive_reconciliation_runs", {
  id: text("id").primaryKey(),
  status: text("status").notNull(),
  startedAt: ts("started_at"),
  endedAt: tsNullable("ended_at"),
  findingsJson: text("findings_json").default("{}"),
});

/** Bootstrap SQL including FTS5 virtual table (managed outside drizzle table defs). */
export const FTS_BOOTSTRAP_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS clio_matters_fts USING fts5(
  matter_id UNINDEXED,
  display_number,
  description,
  client_name,
  court,
  county,
  case_number,
  docket_number,
  warrant_number,
  practice_area,
  search_blob,
  tokenize = 'porter unicode61'
);
`;

export const schema = {
  applicationSettings,
  connectorAccounts,
  aiProviderProfiles,
  aiModels,
  aiModelCapabilityTests,
  aiTaskConfig,
  aiRequests,
  aiResults,
  syncRuns,
  syncCheckpoints,
  gmailThreads,
  gmailMessages,
  emailParticipants,
  emailLinks,
  attachments,
  extractedText,
  renderedPages,
  questEmailMetadata,
  questImportedDocuments,
  clioMatters,
  clioContacts,
  clioMatterContacts,
  matchCandidates,
  matchEvidence,
  reviewDecisions,
  learningRules,
  stagedItems,
  stagedAttachmentAssignments,
  commitRuns,
  commitSteps,
  clioWriteReceipts,
  duplicateFingerprints,
  auditFiles,
  driveReconciliationRuns,
};
