import { newId } from "@mattermail/domain";

export type {
  StagedCommitItem,
  PreflightIssue,
  CommitPreflight,
} from "@mattermail/domain";
export { buildCommitPreflight } from "@mattermail/domain";

export function persistWriteReceipt(
  sqlite: {
    prepare: (sql: string) => { run: (...args: unknown[]) => unknown };
  },
  input: {
    stagedItemId: string;
    writeKind: "communication" | "document";
    fingerprint: string;
    clioId: string;
    verified: boolean;
  },
) {
  sqlite
    .prepare(
      `INSERT OR IGNORE INTO clio_write_receipts(
        id, staged_item_id, write_kind, intended_write_fingerprint, clio_id, verified, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId("receipt"),
      input.stagedItemId,
      input.writeKind,
      input.fingerprint,
      input.clioId,
      input.verified ? 1 : 0,
      Date.now(),
    );
}

export function loadWriteReceipts(sqlite: {
  prepare: (sql: string) => {
    all: (...args: unknown[]) => Array<Record<string, unknown>>;
  };
}): Array<{
  writeKind: "communication" | "document";
  fingerprint: string;
  clioId: string;
  verified: boolean;
  stagedItemId: string;
}> {
  try {
    const rows = sqlite
      .prepare(
        `SELECT write_kind, intended_write_fingerprint, clio_id, verified, staged_item_id
         FROM clio_write_receipts`,
      )
      .all();
    return rows.map((r) => ({
      writeKind: String(r.write_kind) as "communication" | "document",
      fingerprint: String(r.intended_write_fingerprint),
      clioId: String(r.clio_id),
      verified: Boolean(r.verified),
      stagedItemId: String(r.staged_item_id),
    }));
  } catch {
    return [];
  }
}

export function recordCommitRun(
  sqlite: {
    prepare: (sql: string) => { run: (...args: unknown[]) => unknown };
  },
  input: {
    runId: string;
    status: string;
    startedAt: number;
    endedAt?: number;
    counts: Record<string, unknown>;
    error?: string | null;
  },
) {
  sqlite
    .prepare(
      `INSERT OR REPLACE INTO commit_runs(id, status, started_at, ended_at, counts_json, error)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.runId,
      input.status,
      input.startedAt,
      input.endedAt ?? null,
      JSON.stringify(input.counts),
      input.error ?? null,
    );
}

export function recordCommitStep(
  sqlite: {
    prepare: (sql: string) => { run: (...args: unknown[]) => unknown };
  },
  input: {
    commitRunId: string;
    stagedItemId: string;
    step: string;
    status: string;
    detail?: unknown;
    startedAt: number;
    endedAt?: number;
  },
) {
  sqlite
    .prepare(
      `INSERT INTO commit_steps(
        id, commit_run_id, staged_item_id, step, status, detail_json, started_at, ended_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      newId("cstep"),
      input.commitRunId,
      input.stagedItemId,
      input.step,
      input.status,
      JSON.stringify(input.detail ?? {}),
      input.startedAt,
      input.endedAt ?? null,
    );
}
