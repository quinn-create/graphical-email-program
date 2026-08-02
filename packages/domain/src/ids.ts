import { createHash, randomUUID } from "node:crypto";

export function newId(prefix?: string): string {
  const id = randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

export function sha256(data: Buffer | string): string {
  return createHash("sha256").update(data).digest("hex");
}

export function utcNow(): Date {
  return new Date();
}

export function formatRunId(kind: "SCAN-GMAIL" | "IMPORT-QUEST" | "COMMIT-CLIO" | "SYNC-CLIO" | "AI-BATCH" | "DRIVE-RECON", date = new Date(), seq = 1): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${kind}-${y}-${m}-${d}-${String(seq).padStart(3, "0")}`;
}

/** Deterministic intended-write fingerprint for idempotent Clio commits. */
export function intendedWriteFingerprint(parts: {
  sourceType: string;
  sourceId: string;
  targetMatterId: string;
  direction: string;
  timestampIso: string;
  attachmentHashes: string[];
}): string {
  const canonical = JSON.stringify({
    sourceType: parts.sourceType,
    sourceId: parts.sourceId,
    targetMatterId: parts.targetMatterId,
    direction: parts.direction,
    timestampIso: parts.timestampIso,
    attachmentHashes: [...parts.attachmentHashes].sort(),
  });
  return sha256(canonical);
}

export function candidateSetHash(matterIds: string[]): string {
  return sha256([...matterIds].sort().join("|"));
}
