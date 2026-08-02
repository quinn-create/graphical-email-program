import type Database from "better-sqlite3";

export interface MatterSearchHit {
  matterId: string;
  displayNumber: string | null;
  description: string | null;
  clientName: string | null;
  court: string | null;
  county: string | null;
  status: string | null;
  rank: number;
  matchWhy: string;
}

export function upsertMatterFts(
  sqlite: Database.Database,
  row: {
    matterId: string;
    displayNumber?: string | null;
    description?: string | null;
    clientName?: string | null;
    court?: string | null;
    county?: string | null;
    caseNumber?: string | null;
    docketNumber?: string | null;
    warrantNumber?: string | null;
    practiceArea?: string | null;
    searchBlob?: string | null;
  },
): void {
  sqlite
    .prepare(`DELETE FROM clio_matters_fts WHERE matter_id = ?`)
    .run(row.matterId);
  sqlite
    .prepare(
      `INSERT INTO clio_matters_fts(
        matter_id, display_number, description, client_name, court, county,
        case_number, docket_number, warrant_number, practice_area, search_blob
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      row.matterId,
      row.displayNumber ?? "",
      row.description ?? "",
      row.clientName ?? "",
      row.court ?? "",
      row.county ?? "",
      row.caseNumber ?? "",
      row.docketNumber ?? "",
      row.warrantNumber ?? "",
      row.practiceArea ?? "",
      row.searchBlob ?? "",
    );
}

/** Local FTS matter search — target under 150ms for typical indexes. */
export function searchMattersFts(
  sqlite: Database.Database,
  query: string,
  limit = 25,
): MatterSearchHit[] {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const tokens = trimmed
    .split(/\s+/)
    .map((t) => t.replace(/[^a-zA-Z0-9\-]/g, ""))
    .filter((t) => t.length > 0);

  if (tokens.length === 0) return [];

  // Prefix match each token for autocomplete (e.g. "Jonathan rob")
  const ftsQuery = tokens.map((t) => `${t}*`).join(" ");

  const rows = sqlite
    .prepare(
      `SELECT
        f.matter_id as matterId,
        m.display_number as displayNumber,
        m.description as description,
        m.client_name as clientName,
        m.court as court,
        m.county as county,
        m.status as status,
        bm25(clio_matters_fts) as rank
      FROM clio_matters_fts f
      JOIN clio_matters m ON m.id = f.matter_id
      WHERE clio_matters_fts MATCH ?
      ORDER BY rank
      LIMIT ?`,
    )
    .all(ftsQuery, limit) as Array<{
    matterId: string;
    displayNumber: string | null;
    description: string | null;
    clientName: string | null;
    court: string | null;
    county: string | null;
    status: string | null;
    rank: number;
  }>;

  return rows.map((r) => ({
    ...r,
    matchWhy: buildMatchWhy(trimmed, r),
  }));
}

function buildMatchWhy(
  query: string,
  row: {
    displayNumber: string | null;
    clientName: string | null;
    description: string | null;
  },
): string {
  const q = query.toLowerCase();
  if (row.displayNumber?.toLowerCase().includes(q)) return "display number";
  if (row.clientName?.toLowerCase().includes(q.split(/\s+/)[0] ?? q))
    return "client name";
  if (row.description?.toLowerCase().includes(q.split(/\s+/)[0] ?? q))
    return "description";
  return "full-text match";
}
