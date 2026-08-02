import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema/index.js";
import { FTS_BOOTSTRAP_SQL } from "./schema/index.js";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type MatterMailDb = ReturnType<typeof createDb>["db"];

export function createDb(dbPath: string) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const sqlite = new Database(dbPath);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  return { db, sqlite };
}

export function bootstrapSchema(sqlite: Database.Database): void {
  // Create tables via SQL for reliable first-run without requiring migrate tooling at runtime
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS application_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS connector_accounts (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL,
      account_identifier TEXT,
      display_name TEXT,
      connection_status TEXT NOT NULL DEFAULT 'disconnected',
      token_reference TEXT,
      last_authenticated_at INTEGER,
      last_error TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS connector_provider_account ON connector_accounts(provider, account_identifier);

    CREATE TABLE IF NOT EXISTS ai_provider_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider_type TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      secret_reference TEXT,
      non_secret_config_json TEXT NOT NULL DEFAULT '{}',
      base_url TEXT,
      organization_meta_json TEXT DEFAULT '{}',
      test_status TEXT DEFAULT 'untested',
      last_tested_at INTEGER,
      last_error TEXT,
      last_model_refresh_at INTEGER,
      allowed_tasks_json TEXT NOT NULL DEFAULT '["OCR","MATCHING","LEARNING"]',
      privacy_ack_version TEXT,
      cost_warning_json TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_models (
      id TEXT PRIMARY KEY,
      provider_profile_id TEXT NOT NULL REFERENCES ai_provider_profiles(id),
      exact_model_id TEXT NOT NULL,
      display_name TEXT,
      aliases_json TEXT DEFAULT '[]',
      version_snapshot TEXT,
      deployment_name TEXT,
      modalities_json TEXT DEFAULT '{}',
      context_window INTEGER,
      max_output INTEGER,
      capability_meta_json TEXT DEFAULT '{}',
      price_meta_json TEXT DEFAULT '{}',
      lifecycle_status TEXT DEFAULT 'unknown',
      source TEXT DEFAULT 'api',
      fetched_at INTEGER,
      raw_meta_json TEXT
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ai_models_profile_exact ON ai_models(provider_profile_id, exact_model_id);

    CREATE TABLE IF NOT EXISTS ai_model_capability_tests (
      id TEXT PRIMARY KEY,
      provider_profile_id TEXT NOT NULL,
      exact_model_id TEXT NOT NULL,
      text_ok INTEGER,
      image_ok INTEGER,
      pdf_ok INTEGER,
      structured_output_ok INTEGER,
      ocr_ok INTEGER,
      matching_ok INTEGER,
      result_json TEXT,
      warnings_json TEXT DEFAULT '[]',
      tested_at INTEGER NOT NULL,
      adapter_version TEXT,
      model_list_version TEXT
    );

    CREATE TABLE IF NOT EXISTS ai_task_config (
      id TEXT PRIMARY KEY DEFAULT 'default',
      ocr_profile_id TEXT,
      ocr_model_id TEXT,
      matching_profile_id TEXT,
      matching_model_id TEXT,
      learning_profile_id TEXT,
      learning_model_id TEXT,
      use_one_model INTEGER NOT NULL DEFAULT 1,
      fallback_enabled INTEGER NOT NULL DEFAULT 0,
      fallback_config_json TEXT DEFAULT '[]',
      automatic_rules_json TEXT DEFAULT '{}',
      cost_limits_json TEXT DEFAULT '{}',
      privacy_controls_json TEXT DEFAULT '{}',
      cloud_ai_disabled INTEGER NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_requests (
      id TEXT PRIMARY KEY,
      source_item_id TEXT,
      task TEXT NOT NULL,
      provider_profile_id TEXT NOT NULL,
      requested_model_id TEXT NOT NULL,
      actual_model_id TEXT,
      fallback_chain_json TEXT DEFAULT '[]',
      prompt_version TEXT NOT NULL,
      schema_version TEXT NOT NULL DEFAULT '1.0',
      candidate_set_hash TEXT,
      content_hash TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      status TEXT NOT NULL,
      provider_request_id TEXT,
      usage_json TEXT,
      estimated_cost REAL,
      error TEXT,
      used_fallback INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS ai_results (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL REFERENCES ai_requests(id),
      validated_result_json TEXT,
      validation_status TEXT NOT NULL,
      raw_result_reference TEXT,
      cached INTEGER NOT NULL DEFAULT 0,
      user_accepted INTEGER,
      warnings_json TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sync_runs (
      id TEXT PRIMARY KEY,
      connector TEXT NOT NULL,
      kind TEXT NOT NULL,
      window_start INTEGER,
      window_end INTEGER,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      error TEXT,
      counts_json TEXT DEFAULT '{}',
      is_demo INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sync_checkpoints (
      id TEXT PRIMARY KEY,
      connector TEXT NOT NULL,
      checkpoint_key TEXT NOT NULL,
      checkpoint_value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS sync_checkpoint_unique ON sync_checkpoints(connector, checkpoint_key);

    CREATE TABLE IF NOT EXISTS gmail_threads (
      id TEXT PRIMARY KEY,
      gmail_thread_id TEXT NOT NULL UNIQUE,
      subject TEXT,
      snippet TEXT,
      last_message_at INTEGER,
      is_demo INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS gmail_messages (
      id TEXT PRIMARY KEY,
      gmail_message_id TEXT NOT NULL UNIQUE,
      gmail_thread_id TEXT NOT NULL,
      rfc_message_id TEXT,
      direction TEXT NOT NULL,
      subject TEXT,
      snippet TEXT,
      body_text TEXT,
      body_html TEXT,
      internal_date INTEGER NOT NULL,
      label_ids_json TEXT DEFAULT '[]',
      raw_headers_json TEXT DEFAULT '{}',
      review_status TEXT NOT NULL DEFAULT 'unreviewed',
      is_quest INTEGER NOT NULL DEFAULT 0,
      is_demo INTEGER NOT NULL DEFAULT 0,
      ingested_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS gmail_messages_thread ON gmail_messages(gmail_thread_id);
    CREATE INDEX IF NOT EXISTS gmail_messages_review ON gmail_messages(review_status);

    CREATE TABLE IF NOT EXISTS email_participants (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES gmail_messages(id),
      role TEXT NOT NULL,
      email TEXT NOT NULL,
      display_name TEXT
    );

    CREATE TABLE IF NOT EXISTS email_links (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL REFERENCES gmail_messages(id),
      url TEXT NOT NULL,
      domain TEXT,
      is_quest INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT REFERENCES gmail_messages(id),
      filename TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER,
      sha256 TEXT NOT NULL,
      local_path TEXT,
      gmail_attachment_id TEXT,
      page_count INTEGER,
      ocr_status TEXT DEFAULT 'pending',
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS attachments_sha256 ON attachments(sha256);

    CREATE TABLE IF NOT EXISTS extracted_text (
      id TEXT PRIMARY KEY,
      attachment_id TEXT REFERENCES attachments(id),
      message_id TEXT REFERENCES gmail_messages(id),
      method TEXT NOT NULL,
      page_number INTEGER,
      text_content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      version TEXT NOT NULL DEFAULT '1',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS rendered_pages (
      id TEXT PRIMARY KEY,
      attachment_id TEXT NOT NULL REFERENCES attachments(id),
      page_number INTEGER NOT NULL,
      local_path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      render_version TEXT NOT NULL DEFAULT '1',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quest_email_metadata (
      id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL UNIQUE REFERENCES gmail_messages(id),
      possible_names_json TEXT DEFAULT '[]',
      case_identifiers_json TEXT DEFAULT '[]',
      links_json TEXT DEFAULT '[]',
      detection_rule TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS quest_imported_documents (
      id TEXT PRIMARY KEY,
      message_id TEXT REFERENCES gmail_messages(id),
      attachment_id TEXT REFERENCES attachments(id),
      source TEXT NOT NULL,
      original_filename TEXT,
      sha256 TEXT NOT NULL,
      local_path TEXT NOT NULL,
      correlation_confidence TEXT,
      imported_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS quest_doc_sha_message ON quest_imported_documents(sha256, message_id);

    CREATE TABLE IF NOT EXISTS clio_matters (
      id TEXT PRIMARY KEY,
      clio_matter_id TEXT NOT NULL UNIQUE,
      display_number TEXT,
      description TEXT,
      status TEXT,
      client_name TEXT,
      client_id TEXT,
      practice_area TEXT,
      responsible_attorney TEXT,
      open_date TEXT,
      close_date TEXT,
      court TEXT,
      county TEXT,
      case_number TEXT,
      docket_number TEXT,
      warrant_number TEXT,
      custom_fields_json TEXT DEFAULT '{}',
      search_blob TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      indexed_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS clio_matters_display ON clio_matters(display_number);

    CREATE TABLE IF NOT EXISTS clio_contacts (
      id TEXT PRIMARY KEY,
      clio_contact_id TEXT NOT NULL UNIQUE,
      name TEXT,
      emails_json TEXT DEFAULT '[]',
      phones_json TEXT DEFAULT '[]',
      is_demo INTEGER NOT NULL DEFAULT 0,
      indexed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS clio_matter_contacts (
      id TEXT PRIMARY KEY,
      matter_id TEXT NOT NULL REFERENCES clio_matters(id),
      contact_id TEXT NOT NULL REFERENCES clio_contacts(id),
      role TEXT
    );

    CREATE TABLE IF NOT EXISTS match_candidates (
      id TEXT PRIMARY KEY,
      source_item_id TEXT NOT NULL,
      clio_matter_id TEXT NOT NULL,
      rank INTEGER NOT NULL,
      confidence TEXT NOT NULL,
      score_hint REAL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS match_evidence (
      id TEXT PRIMARY KEY,
      candidate_id TEXT NOT NULL REFERENCES match_candidates(id),
      evidence_type TEXT NOT NULL,
      evidence_value TEXT NOT NULL,
      weight TEXT NOT NULL,
      supporting INTEGER NOT NULL DEFAULT 1,
      explanation TEXT
    );

    CREATE TABLE IF NOT EXISTS review_decisions (
      id TEXT PRIMARY KEY,
      source_item_id TEXT NOT NULL,
      disposition TEXT NOT NULL,
      matter_id TEXT,
      remember INTEGER NOT NULL DEFAULT 1,
      split_json TEXT,
      ai_request_id TEXT,
      decided_at INTEGER NOT NULL,
      undone INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS learning_rules (
      id TEXT PRIMARY KEY,
      rule_type TEXT NOT NULL,
      case_relatedness TEXT NOT NULL,
      matter_scope TEXT NOT NULL,
      fixed_matter_id TEXT,
      matched_value TEXT NOT NULL,
      reason TEXT,
      source_decision_id TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      expires_at INTEGER,
      successful_uses INTEGER NOT NULL DEFAULT 0,
      corrected_uses INTEGER NOT NULL DEFAULT 0,
      last_used_at INTEGER,
      created_at INTEGER NOT NULL,
      proposed_by_ai INTEGER NOT NULL DEFAULT 0,
      user_activated INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS staged_items (
      id TEXT PRIMARY KEY,
      source_item_id TEXT NOT NULL,
      matter_id TEXT NOT NULL,
      disposition TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'STAGED',
      intended_write_fingerprint TEXT,
      communication_body TEXT,
      subject TEXT,
      direction TEXT,
      metadata_json TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS staged_attachment_assignments (
      id TEXT PRIMARY KEY,
      staged_item_id TEXT NOT NULL REFERENCES staged_items(id),
      attachment_id TEXT NOT NULL,
      matter_id TEXT,
      action TEXT NOT NULL,
      page_range_json TEXT
    );

    CREATE TABLE IF NOT EXISTS commit_runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      counts_json TEXT DEFAULT '{}',
      error TEXT
    );

    CREATE TABLE IF NOT EXISTS commit_steps (
      id TEXT PRIMARY KEY,
      commit_run_id TEXT NOT NULL REFERENCES commit_runs(id),
      staged_item_id TEXT NOT NULL,
      step TEXT NOT NULL,
      status TEXT NOT NULL,
      detail_json TEXT,
      started_at INTEGER NOT NULL,
      ended_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS clio_write_receipts (
      id TEXT PRIMARY KEY,
      staged_item_id TEXT NOT NULL,
      write_kind TEXT NOT NULL,
      intended_write_fingerprint TEXT NOT NULL,
      clio_id TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );
    CREATE UNIQUE INDEX IF NOT EXISTS clio_receipt_fingerprint ON clio_write_receipts(intended_write_fingerprint, write_kind);

    CREATE TABLE IF NOT EXISTS duplicate_fingerprints (
      id TEXT PRIMARY KEY,
      fingerprint TEXT NOT NULL UNIQUE,
      kind TEXT NOT NULL,
      source_ref TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_files (
      id TEXT PRIMARY KEY,
      run_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      local_path TEXT NOT NULL,
      sha256 TEXT NOT NULL,
      size_bytes INTEGER,
      drive_file_id TEXT,
      drive_verified INTEGER DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS drive_reconciliation_runs (
      id TEXT PRIMARY KEY,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      ended_at INTEGER,
      findings_json TEXT DEFAULT '{}'
    );
  `);
  sqlite.exec(FTS_BOOTSTRAP_SQL);
}

export * from "./schema/index.js";
