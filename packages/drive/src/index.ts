import {
  assertDriveActionAllowed,
  assertDriveNoOverwrite,
  getAllowedDriveScopes,
} from "@mattermail/security";
import { DRIVE_FILE_SCOPE } from "@mattermail/shared";
import { newId, sha256 } from "@mattermail/domain";
import { PRODUCT } from "@mattermail/shared";

export interface DriveFileRecord {
  id: string;
  name: string;
  path: string;
  size: number;
  checksum: string;
  runId: string;
}

export class DriveClient {
  private files = new Map<string, DriveFileRecord>();
  private byRunId = new Map<string, DriveFileRecord[]>();

  getScopes() {
    return getAllowedDriveScopes();
  }

  assertScope() {
    if (![...getAllowedDriveScopes()].includes(DRIVE_FILE_SCOPE)) {
      throw new Error("Drive scope misconfigured");
    }
  }

  async createAuditFolderPath(runId: string, date = new Date()): Promise<string> {
    assertDriveActionAllowed("files.create");
    const year = date.getUTCFullYear();
    const month = date.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
    const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
    return `${PRODUCT.auditRootFolderName}/${year}/${mm}-${month}/${runId}`;
  }

  async uploadAuditFile(input: {
    runId: string;
    filename: string;
    content: Buffer | string;
  }): Promise<DriveFileRecord> {
    assertDriveActionAllowed("files.create");
    // Search by immutable run ID before retry
    const existing = (this.byRunId.get(input.runId) ?? []).find((f) => f.name === input.filename);
    if (existing) {
      assertDriveNoOverwrite(existing.id);
    }
    const buf = typeof input.content === "string" ? Buffer.from(input.content) : input.content;
    const checksum = sha256(buf);
    const path = `${await this.createAuditFolderPath(input.runId)}/${input.filename}`;
    const record: DriveFileRecord = {
      id: newId("drive"),
      name: input.filename,
      path,
      size: buf.length,
      checksum,
      runId: input.runId,
    };
    this.files.set(record.id, record);
    const list = this.byRunId.get(input.runId) ?? [];
    list.push(record);
    this.byRunId.set(input.runId, list);
    return record;
  }

  async findByRunId(runId: string): Promise<DriveFileRecord[]> {
    assertDriveActionAllowed("files.list");
    return this.byRunId.get(runId) ?? [];
  }

  async reconcileManifest(runId: string, expectedNames: string[]): Promise<{
    missing: string[];
    present: string[];
  }> {
    const files = await this.findByRunId(runId);
    const names = new Set(files.map((f) => f.name));
    return {
      missing: expectedNames.filter((n) => !names.has(n)),
      present: expectedNames.filter((n) => names.has(n)),
    };
  }

  /** Explicitly absent — delete must never be implemented. */
  delete = undefined;
  trash = undefined;
}

export function createMockDriveClient(): DriveClient {
  return new DriveClient();
}
