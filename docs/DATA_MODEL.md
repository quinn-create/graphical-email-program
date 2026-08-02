# Data Model

SQLite is the local source of truth. See `packages/database/src/schema/index.ts` for tables:

connector_accounts, ai_*, sync_*, gmail_*, attachments, quest_*, clio_*, match_*, review_decisions, learning_rules, staged_*, commit_*, clio_write_receipts, duplicate_fingerprints, audit_files, drive_reconciliation_runs, application_settings.

FTS5 virtual table: `clio_matters_fts`.
